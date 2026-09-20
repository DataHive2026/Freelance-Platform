import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/services/authz";
import { inviteExpert } from "@/lib/services/teams";
import { systemTransition } from "@/lib/services/projects";

export class ApplicationServiceError extends Error {}

export interface SubmitApplicationInput {
  projectId: string;
  projectRoleId?: string;
  coverLetter?: string;
  proposedRate?: number;
  proposedAvailability?: string;
  estimatedDuration?: string;
}

/**
 * The self-service counterpart to TeamService.inviteExpert() (Phase 4) —
 * an expert applying to a publicly posted project, rather than being
 * invited directly. Both paths converge on the same team_members table
 * once a client acts on them: an invite goes straight to 'invited', an
 * application goes through 'submitted' → 'shortlisted'/'accepted' first.
 */
export async function submitApplication(actorId: string, input: SubmitApplicationInput) {
  const permitted = await can(actorId, "application:submit");
  if (!permitted) throw new ApplicationServiceError("Not authorized to submit applications");

  const supabase = await createSupabaseServerClient();

  const { data: project } = await supabase.from("projects").select("status").eq("id", input.projectId).single();
  if (!project) throw new ApplicationServiceError("Project not found");
  if (!["POSTED", "REVIEWING"].includes(project.status)) {
    throw new ApplicationServiceError("This project isn't open for applications right now");
  }

  const { data: myExpertProfile } = await supabase.from("expert_profiles").select("id").eq("user_id", actorId).single();
  if (!myExpertProfile) throw new ApplicationServiceError("No expert profile for this account");

  const { data: existing } = await supabase
    .from("project_applications")
    .select("id, status")
    .eq("project_id", input.projectId)
    .eq("expert_id", myExpertProfile.id)
    .maybeSingle();
  if (existing && existing.status !== "withdrawn") {
    throw new ApplicationServiceError("You've already applied to this project");
  }

  const { data: application, error } = await supabase
    .from("project_applications")
    .insert({
      project_id: input.projectId,
      project_role_id: input.projectRoleId,
      expert_id: myExpertProfile.id,
      status: "submitted",
    })
    .select()
    .single();
  if (error) throw new ApplicationServiceError(error.message);

  const { error: proposalError } = await supabase.from("proposals").insert({
    application_id: application.id,
    cover_letter: input.coverLetter,
    proposed_rate: input.proposedRate,
    proposed_availability: input.proposedAvailability,
    estimated_duration: input.estimatedDuration,
  });
  if (proposalError) throw new ApplicationServiceError(proposalError.message);

  // First application on a project nudges it into REVIEWING — matches
  // the state machine's "POSTED → REVIEWING: System (automatic on first
  // application)" edge from phase0-database-and-lifecycle.md §3, via
  // systemTransition() so it doesn't need a second human authz check.
  if (project.status === "POSTED") {
    await systemTransition(input.projectId, "REVIEWING", "First application received").catch(() => {
      // Best-effort — if this races with something else changing the
      // project's status, the application itself is still valid.
    });
  }

  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action: "application.submitted",
    entity_type: "project_application",
    entity_id: application.id,
    metadata: { project_id: input.projectId },
  });

  return application;
}

export async function withdrawApplication(actorId: string, applicationId: string) {
  const permitted = await can(actorId, "application:withdraw", applicationId);
  if (!permitted) throw new ApplicationServiceError("Not authorized to withdraw this application");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("project_applications").update({ status: "withdrawn" }).eq("id", applicationId);
  if (error) throw new ApplicationServiceError(error.message);
}

export async function shortlist(actorId: string, applicationId: string) {
  return setReviewStatus(actorId, applicationId, "shortlisted");
}

export async function reject(actorId: string, applicationId: string) {
  return setReviewStatus(actorId, applicationId, "rejected");
}

async function setReviewStatus(actorId: string, applicationId: string, status: "shortlisted" | "rejected") {
  const supabase = await createSupabaseServerClient();
  const { data: application } = await supabase
    .from("project_applications")
    .select("id, project_id")
    .eq("id", applicationId)
    .single();
  if (!application) throw new ApplicationServiceError("Application not found");

  const permitted = await can(actorId, "application:review", application.project_id);
  if (!permitted) throw new ApplicationServiceError("Not authorized to review applications on this project");

  const { error } = await supabase.from("project_applications").update({ status }).eq("id", applicationId);
  if (error) throw new ApplicationServiceError(error.message);
}

/**
 * Accepting an application is the moment it converts into an actual
 * team_members row — deliberately reuses TeamService.inviteExpert()
 * rather than duplicating team-creation logic, since both the invite
 * path (Phase 4) and the application path converge on the same table.
 * The application's own status flips to 'accepted' alongside it.
 */
export async function accept(actorId: string, applicationId: string, options?: { isLead?: boolean; compensationAmount?: number }) {
  const supabase = await createSupabaseServerClient();
  const { data: application } = await supabase
    .from("project_applications")
    .select("id, project_id, project_role_id, expert_id")
    .eq("id", applicationId)
    .single();
  if (!application) throw new ApplicationServiceError("Application not found");

  const permitted = await can(actorId, "application:review", application.project_id);
  if (!permitted) throw new ApplicationServiceError("Not authorized to accept applications on this project");

  await inviteExpert(actorId, {
    projectId: application.project_id,
    expertId: application.expert_id,
    projectRoleId: application.project_role_id ?? undefined,
    isLead: options?.isLead,
    compensationAmount: options?.compensationAmount,
  });

  const { error } = await supabase.from("project_applications").update({ status: "accepted" }).eq("id", applicationId);
  if (error) throw new ApplicationServiceError(error.message);
}

export async function listForProject(actorId: string, projectId: string) {
  const permitted = await can(actorId, "application:review", projectId);
  if (!permitted) throw new ApplicationServiceError("Not authorized to view applications on this project");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("project_applications")
    .select("id, status, created_at, expert_profiles(id, headline, users(email)), proposals(cover_letter, proposed_rate, proposed_availability)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw new ApplicationServiceError(error.message);
  return data;
}

export async function listMine(actorId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: myExpertProfile } = await supabase.from("expert_profiles").select("id").eq("user_id", actorId).maybeSingle();
  if (!myExpertProfile) return [];

  const { data, error } = await supabase
    .from("project_applications")
    .select("id, status, created_at, projects(id, title, client_profiles(company_name))")
    .eq("expert_id", myExpertProfile.id)
    .order("created_at", { ascending: false });

  if (error) throw new ApplicationServiceError(error.message);
  return data;
}

/**
 * Projects open for applications — powers the expert "browse projects"
 * view. Deliberately narrow: only POSTED/REVIEWING, visibility public.
 * project:view's own rule is deliberately public-scope (scope: "none"),
 * but browsing should still only surface projects actually open for
 * new applicants, which is a business rule, not an authz one.
 */
export async function listOpenProjects() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, title, description, status, budget_min, budget_max, currency, deadline, category_id, created_at")
    .in("status", ["POSTED", "REVIEWING"])
    .eq("visibility", "public")
    .order("created_at", { ascending: false });

  if (error) throw new ApplicationServiceError(error.message);
  return data;
}
