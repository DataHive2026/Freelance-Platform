import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/services/authz";
import { ALLOWED_TRANSITIONS, type ProjectStatus } from "@/types/domain";

export class ProjectServiceError extends Error {}

/**
 * Transitions are the one place authorization is inherently
 * two-dimensional — who's allowed depends on BOTH the current status
 * and the target, not just "the project." AuthzService's flat
 * action → rule model can't express that on its own, so this map is a
 * deliberate, documented exception: it composes atomic AuthzService
 * actions per edge, rather than inventing one enormous conditional rule.
 * See permission-matrix.md §3.1.1 for the source table this mirrors.
 *
 * Edges NOT listed here are system-automatic (see systemTransition()
 * below) — a human calling transitionStatus() for one of those edges
 * gets a clear error telling them which service actually triggers it,
 * rather than a confusing "not authorized."
 */
const HUMAN_TRANSITION_ACTIONS: Partial<Record<string, string>> = {
  "DRAFT->POSTED": "project:post",
  "POSTED->CANCELLED": "project:cancel",
  "REVIEWING->CANCELLED": "project:cancel",
  "TEAM_FORMING->CANCELLED": "project:cancel",
  "TEAM_CONFIRMED->FUNDED": "payment:fund_project", // client authorizes funding; PaymentService calls this after the charge succeeds, not before
  "DELIVERABLE_REVIEW->COMPLETED": "project:complete",
  "IN_PROGRESS->DISPUTED": "dispute:open",
  "MILESTONE_REVIEW->DISPUTED": "dispute:open",
  "DISPUTED->IN_PROGRESS": "dispute:resolve",
  "DISPUTED->CANCELLED": "dispute:resolve",
};

/**
 * The ONLY function in the codebase allowed to write projects.status as
 * a result of a human-initiated action. No UI component or API route may
 * set it directly — see phase0-database-and-lifecycle.md Section 3 for
 * the full state machine this enforces.
 */
export async function transitionStatus(
  actorId: string,
  projectId: string,
  target: ProjectStatus
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { data: project, error } = await supabase
    .from("projects")
    .select("status")
    .eq("id", projectId)
    .single();

  if (error || !project) throw new ProjectServiceError("Project not found");

  const current = project.status as ProjectStatus;
  const allowed = ALLOWED_TRANSITIONS[current] ?? [];

  if (!allowed.includes(target)) {
    throw new ProjectServiceError(
      `Illegal transition: ${current} → ${target}. Allowed: ${allowed.join(", ") || "none (terminal state)"}`
    );
  }

  const action = HUMAN_TRANSITION_ACTIONS[`${current}->${target}`];
  if (!action) {
    throw new ProjectServiceError(
      `${current} → ${target} is a system-automatic transition, not a human-initiated one — it should be triggered by the service that causes it (e.g. PaymentService, TeamService), not called directly.`
    );
  }

  const permitted = await can(actorId, action, projectId);
  if (!permitted) {
    throw new ProjectServiceError("Not authorized to make this transition");
  }

  await writeStatus(supabase, projectId, current, target, actorId);
}

/**
 * For transitions the state machine marks "System (automatic)" in
 * permission-matrix.md §3.1.1 — POSTED→REVIEWING,
 * TEAM_FORMING→TEAM_CONFIRMED, FUNDED→IN_PROGRESS. These are always a
 * direct, already-authorized consequence of something else (an
 * application was submitted, a team filled its last seat, a payment
 * cleared) — the authorization happened at THAT step, so this
 * deliberately does not call AuthzService.can() again. actor_id is
 * null in the audit log, matching the "null for system actions" design
 * in phase0-database-and-lifecycle.md's audit_logs table.
 */
export async function systemTransition(projectId: string, target: ProjectStatus, reason: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { data: project, error } = await supabase
    .from("projects")
    .select("status")
    .eq("id", projectId)
    .single();

  if (error || !project) throw new ProjectServiceError("Project not found");

  const current = project.status as ProjectStatus;
  const allowed = ALLOWED_TRANSITIONS[current] ?? [];

  if (!allowed.includes(target)) {
    throw new ProjectServiceError(
      `Illegal system transition: ${current} → ${target}. Allowed: ${allowed.join(", ") || "none (terminal state)"}`
    );
  }

  await writeStatus(supabase, projectId, current, target, null, reason);
}

async function writeStatus(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  projectId: string,
  from: ProjectStatus,
  to: ProjectStatus,
  actorId: string | null,
  reason?: string
) {
  const { error: updateError } = await supabase.from("projects").update({ status: to }).eq("id", projectId);
  if (updateError) throw new ProjectServiceError(updateError.message);

  // Every status change is audited — this is how the Admin Audit Log
  // screen gets its data.
  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action: "project.status_changed",
    entity_type: "project",
    entity_id: projectId,
    metadata: { from, to, ...(reason ? { reason } : {}) },
  });
}

export async function createProject(
  actorId: string,
  input: {
    clientId: string;
    title: string;
    description: string;
    categoryId?: string;
    budgetMin?: number;
    budgetMax?: number;
    deadline?: string;
  }
) {
  const permitted = await can(actorId, "project:create");
  if (!permitted) throw new ProjectServiceError("Not authorized to create a project");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      client_id: input.clientId,
      title: input.title,
      description: input.description,
      category_id: input.categoryId,
      budget_min: input.budgetMin,
      budget_max: input.budgetMax,
      deadline: input.deadline,
      status: "DRAFT",
    })
    .select()
    .single();

  if (error) throw new ProjectServiceError(error.message);

  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action: "project.created",
    entity_type: "project",
    entity_id: data.id,
    metadata: { title: input.title },
  });

  return data;
}

/**
 * Lists every project owned by a given client_profiles.id, most recent
 * first. Used by the client dashboard — deliberately narrow (one client's
 * own projects) rather than a general-purpose query builder, so the
 * authorization story stays simple: this function only ever returns rows
 * the caller is already allowed to see by construction.
 */
export async function listForClient(clientId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, title, description, status, budget_min, budget_max, currency, deadline, category_id, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) throw new ProjectServiceError(error.message);
  return data;
}

export async function getById(actorId: string, projectId: string) {
  const permitted = await can(actorId, "project:view", projectId);
  if (!permitted) throw new ProjectServiceError("Not authorized to view this project");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (error) throw new ProjectServiceError(error.message);
  return data;
}
