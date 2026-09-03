import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/services/authz";
import { ALLOWED_TRANSITIONS, type ProjectStatus } from "@/types/domain";

export class ProjectServiceError extends Error {}

/**
 * The ONLY function in the codebase allowed to write projects.status.
 * No UI component or API route may set it directly — see
 * phase0-database-and-lifecycle.md Section 3 for the full state machine
 * this enforces, and permission-matrix.md Section 3.1.1 for who may
 * trigger each transition.
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

  const permitted = await can(actorId, "project:transition_status", projectId);
  if (!permitted) {
    throw new ProjectServiceError("Not authorized to transition this project");
  }

  const { error: updateError } = await supabase
    .from("projects")
    .update({ status: target })
    .eq("id", projectId);

  if (updateError) throw new ProjectServiceError(updateError.message);

  // Every status change is audited — this is how the Admin Audit Log
  // screen gets its data.
  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action: "project.status_changed",
    entity_type: "project",
    entity_id: projectId,
    metadata: { from: current, to: target },
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
