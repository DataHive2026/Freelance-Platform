import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/services/authz";
import { releaseMilestone } from "@/lib/services/payments";

export class MilestoneServiceError extends Error {}

export interface CreateMilestoneInput {
  projectId: string;
  title: string;
  description?: string;
  deadline?: string;
  budgetAllocation?: number;
  sequenceOrder?: number;
}

export async function createMilestone(actorId: string, input: CreateMilestoneInput) {
  const permitted = await can(actorId, "milestone:create", input.projectId);
  if (!permitted) throw new MilestoneServiceError("Not authorized to create milestones on this project");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("milestones")
    .insert({
      project_id: input.projectId,
      title: input.title,
      description: input.description,
      deadline: input.deadline,
      budget_allocation: input.budgetAllocation,
      sequence_order: input.sequenceOrder ?? 0,
      status: "pending",
    })
    .select()
    .single();

  if (error) throw new MilestoneServiceError(error.message);
  return data;
}

export interface SubmitDeliverableInput {
  milestoneId: string;
  title: string;
  description?: string;
  fileId?: string;
}

/**
 * Submitting a deliverable does two things atomically (as atomically as
 * two sequential Supabase calls can be — a real transaction/RPC is a
 * follow-up if this needs to be airtight): creates the `deliverables`
 * row, and flips the milestone to 'submitted' so it shows up in the
 * client's review queue. permission-matrix.md §3.3 gates this to any
 * active team member (lead or the specifically assigned expert) — not
 * client-only, mirroring milestone:submit_deliverable's "member" scope.
 */
export async function submitDeliverable(actorId: string, input: SubmitDeliverableInput) {
  const supabase = await createSupabaseServerClient();

  const { data: milestone } = await supabase
    .from("milestones")
    .select("id, project_id")
    .eq("id", input.milestoneId)
    .single();
  if (!milestone) throw new MilestoneServiceError("Milestone not found");

  const permitted = await can(actorId, "milestone:submit_deliverable", input.milestoneId);
  if (!permitted) throw new MilestoneServiceError("Not authorized to submit a deliverable for this milestone");

  const { data: myExpertProfile } = await supabase
    .from("expert_profiles")
    .select("id")
    .eq("user_id", actorId)
    .single();
  if (!myExpertProfile) throw new MilestoneServiceError("No expert profile for this account");

  const { data: deliverable, error: insertError } = await supabase
    .from("deliverables")
    .insert({
      project_id: milestone.project_id,
      milestone_id: input.milestoneId,
      submitted_by: myExpertProfile.id,
      title: input.title,
      description: input.description,
      file_id: input.fileId,
      status: "submitted",
    })
    .select()
    .single();
  if (insertError) throw new MilestoneServiceError(insertError.message);

  const { error: updateError } = await supabase
    .from("milestones")
    .update({ status: "submitted" })
    .eq("id", input.milestoneId);
  if (updateError) throw new MilestoneServiceError(updateError.message);

  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action: "deliverable.submitted",
    entity_type: "milestone",
    entity_id: input.milestoneId,
    metadata: { deliverable_id: deliverable.id },
  });

  return deliverable;
}

/**
 * The client-only approval action. Per permission-matrix.md §3.3, this
 * has NO admin path — see the note there on why (Section 24: admins
 * "do not automatically make legal conclusions"; a stuck milestone goes
 * through disputes, not a silent admin override here).
 *
 * This is also the sole trigger for payout release — approve() calls
 * PaymentService.releaseMilestone() below, which is itself unreachable
 * from anywhere else in the codebase (permission-matrix.md §3.5: no
 * human role may call payout:initiate directly). The authorization for
 * moving money IS a successful call to this function, not a separate
 * check inside PaymentService.
 */
export async function approve(actorId: string, milestoneId: string) {
  const permitted = await can(actorId, "milestone:approve", milestoneId);
  if (!permitted) throw new MilestoneServiceError("Not authorized to approve this milestone (check status is SUBMITTED and you own the project)");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("milestones")
    .update({ status: "approved" })
    .eq("id", milestoneId)
    .select()
    .single();
  if (error) throw new MilestoneServiceError(error.message);

  await supabase
    .from("deliverables")
    .update({ status: "approved", reviewed_at: new Date().toISOString() })
    .eq("milestone_id", milestoneId)
    .eq("status", "submitted");

  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action: "milestone.approved",
    entity_type: "milestone",
    entity_id: milestoneId,
  });

  // PaymentService.releaseMilestone() is the ONLY code path allowed to
  // write payout/transaction rows for this (permission-matrix.md §3.5 —
  // no human-callable payout:initiate exists). A verified client
  // approval, which just happened above via can(), IS the authorization;
  // releaseMilestone() itself takes no actorId and does no further
  // authz check, by design.
  await releaseMilestone(milestoneId);

  return data;
}

export async function requestRevision(actorId: string, milestoneId: string, note: string) {
  const permitted = await can(actorId, "milestone:request_revision", milestoneId);
  if (!permitted) throw new MilestoneServiceError("Not authorized to request revision on this milestone");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("milestones")
    .update({ status: "in_progress" })
    .eq("id", milestoneId)
    .select()
    .single();
  if (error) throw new MilestoneServiceError(error.message);

  await supabase
    .from("deliverables")
    .update({ status: "revision_requested" })
    .eq("milestone_id", milestoneId)
    .eq("status", "submitted");

  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action: "milestone.revision_requested",
    entity_type: "milestone",
    entity_id: milestoneId,
    metadata: { note },
  });

  return data;
}

export async function listForProject(actorId: string, projectId: string) {
  const permitted = await can(actorId, "milestone:view", projectId);
  if (!permitted) throw new MilestoneServiceError("Not authorized to view this project's milestones");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("milestones")
    .select("id, title, description, deadline, budget_allocation, status, sequence_order")
    .eq("project_id", projectId)
    .order("sequence_order", { ascending: true });

  if (error) throw new MilestoneServiceError(error.message);
  return data;
}

export async function getDeliverable(actorId: string, milestoneId: string) {
  const permitted = await can(actorId, "milestone:view", milestoneId); // resolveScope's milestone branch handles this id
  if (!permitted) throw new MilestoneServiceError("Not authorized to view this deliverable");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("deliverables")
    .select("id, title, description, status, submitted_at, reviewed_at, expert_profiles(headline, users(email))")
    .eq("milestone_id", milestoneId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new MilestoneServiceError(error.message);
  return data;
}
