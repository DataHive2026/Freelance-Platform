import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/services/authz";
import { transitionStatus } from "@/lib/services/projects";

export class DisputeServiceError extends Error {}

/**
 * Opening a dispute does two things: creates the disputes row, and
 * moves the project to DISPUTED via ProjectService.transitionStatus()
 * — which has mapped "IN_PROGRESS->DISPUTED" and
 * "MILESTONE_REVIEW->DISPUTED" to this exact action
 * (HUMAN_TRANSITION_ACTIONS in lib/services/projects/index.ts) since
 * Phase 6, before this service existed to actually call it. Yes, this
 * means can(actorId, "dispute:open", projectId) runs twice — once here,
 * once inside transitionStatus's own check — but that's the accepted
 * cost of transitionStatus staying the single gate on projects.status;
 * a duplicate authz check is cheap, a second path that could write
 * status without going through it is not.
 */
export async function openDispute(actorId: string, projectId: string, reason: string, against?: string) {
  const permitted = await can(actorId, "dispute:open", projectId);
  if (!permitted) throw new DisputeServiceError("Not authorized to open a dispute on this project");
  if (!reason.trim()) throw new DisputeServiceError("A reason is required");

  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("disputes")
    .select("id")
    .eq("project_id", projectId)
    .in("status", ["open", "under_review", "waiting_for_client", "waiting_for_expert"])
    .maybeSingle();
  if (existing) throw new DisputeServiceError("There's already an open dispute on this project");

  const { data: dispute, error } = await supabase
    .from("disputes")
    .insert({ project_id: projectId, raised_by: actorId, against, reason, status: "open" })
    .select()
    .single();
  if (error) throw new DisputeServiceError(error.message);

  await transitionStatus(actorId, projectId, "DISPUTED");

  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action: "dispute.opened",
    entity_type: "dispute",
    entity_id: dispute.id,
    metadata: { project_id: projectId },
  });

  return dispute;
}

export interface SubmitEvidenceInput {
  disputeId: string;
  message?: string;
  fileId?: string;
}

/**
 * Covers both "evidence" and "messages" in the dispute thread — the
 * schema's dispute_evidence table (0001_init.sql) already has both a
 * file_id and a message column on the same row, so a text-only entry
 * and a file attachment use the same function rather than two separate
 * tables/services for what the UI shows as one conversational thread.
 */
export async function submitEvidence(actorId: string, input: SubmitEvidenceInput) {
  if (!input.message?.trim() && !input.fileId) {
    throw new DisputeServiceError("Provide a message or a file");
  }

  const permitted = await can(actorId, "dispute:submit_evidence", input.disputeId);
  if (!permitted) throw new DisputeServiceError("Not authorized on this dispute");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("dispute_evidence")
    .insert({ dispute_id: input.disputeId, message: input.message, file_id: input.fileId, submitted_by: actorId })
    .select()
    .single();
  if (error) throw new DisputeServiceError(error.message);

  // Moves toward whichever side hasn't spoken most recently — a light
  // heuristic, not a full workflow engine. Admin can always override
  // via a status field on resolution regardless of this.
  const { data: dispute } = await supabase.from("disputes").select("raised_by, against, status").eq("id", input.disputeId).single();
  if (dispute && dispute.status !== "resolved" && dispute.status !== "closed") {
    const nextStatus = actorId === dispute.raised_by ? "waiting_for_expert" : "waiting_for_client";
    await supabase.from("disputes").update({ status: dispute.status === "open" ? "under_review" : nextStatus }).eq("id", input.disputeId);
  }

  return data;
}

export type DisputeResolutionOutcome = "reopen" | "cancel";

/**
 * Admin-only, no exception — Section 24 of the original spec is
 * explicit that admins "do not automatically make legal conclusions."
 * `resolution` is a required, stored, auditable explanation, not a
 * silent status flip.
 */
export async function resolveDispute(actorId: string, disputeId: string, resolution: string, outcome: DisputeResolutionOutcome) {
  if (!resolution.trim()) throw new DisputeServiceError("A resolution explanation is required");

  const permitted = await can(actorId, "dispute:resolve");
  if (!permitted) throw new DisputeServiceError("Not authorized to resolve disputes");

  const supabase = await createSupabaseServerClient();
  const { data: dispute } = await supabase.from("disputes").select("project_id").eq("id", disputeId).single();
  if (!dispute) throw new DisputeServiceError("Dispute not found");

  const { error } = await supabase
    .from("disputes")
    .update({ status: "resolved", resolution, resolved_by_admin_id: actorId, resolved_at: new Date().toISOString() })
    .eq("id", disputeId);
  if (error) throw new DisputeServiceError(error.message);

  await transitionStatus(actorId, dispute.project_id, outcome === "reopen" ? "IN_PROGRESS" : "CANCELLED");

  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action: "dispute.resolved",
    entity_type: "dispute",
    entity_id: disputeId,
    metadata: { outcome, resolution },
  });
}

export async function getDispute(actorId: string, disputeId: string) {
  const permitted = await can(actorId, "dispute:view", disputeId);
  if (!permitted) throw new DisputeServiceError("Not authorized to view this dispute");

  const supabase = await createSupabaseServerClient();
  const { data: dispute, error } = await supabase
    .from("disputes")
    .select("id, project_id, raised_by, against, reason, status, resolution, created_at, resolved_at, projects(title)")
    .eq("id", disputeId)
    .single();
  if (error) throw new DisputeServiceError(error.message);

  const { data: evidence } = await supabase
    .from("dispute_evidence")
    .select("id, message, file_id, submitted_by, users(email)")
    .eq("dispute_id", disputeId)
    .order("id", { ascending: true });

  return { dispute, evidence: evidence ?? [] };
}

export async function listForProject(actorId: string, projectId: string) {
  const permitted = await can(actorId, "project:view", projectId);
  if (!permitted) throw new DisputeServiceError("Not authorized to view this project");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("disputes")
    .select("id, reason, status, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw new DisputeServiceError(error.message);
  return data;
}

export async function listAllForAdmin(actorId: string) {
  const permitted = await can(actorId, "admin:manage_disputes");
  if (!permitted) throw new DisputeServiceError("Not authorized to view all disputes");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("disputes")
    .select("id, reason, status, created_at, projects(title)")
    .order("created_at", { ascending: false });

  if (error) throw new DisputeServiceError(error.message);
  return data;
}
