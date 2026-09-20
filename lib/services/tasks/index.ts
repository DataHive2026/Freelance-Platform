import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/services/authz";
import type { TaskStatus } from "@/types/domain";

export class TaskServiceError extends Error {}

export interface CreateTaskInput {
  projectId: string;
  milestoneId?: string;
  title: string;
  description?: string;
  assignedExpertId?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  dueDate?: string;
}

export async function createTask(actorId: string, input: CreateTaskInput) {
  const permitted = await can(actorId, "task:create", input.projectId);
  if (!permitted) throw new TaskServiceError("Not authorized to create tasks on this project");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      project_id: input.projectId,
      milestone_id: input.milestoneId,
      title: input.title,
      description: input.description,
      assigned_expert_id: input.assignedExpertId,
      priority: input.priority ?? "medium",
      status: "todo",
      due_date: input.dueDate,
      created_by: actorId,
    })
    .select()
    .single();

  if (error) throw new TaskServiceError(error.message);
  return data;
}

/**
 * Status updates are the one action on tasks with a real per-row
 * condition: an assigned expert may move their own task, a lead or
 * client may move any task on the project — see permission-matrix.md
 * §3.3. This is gated by can(actorId, "task:update_status", taskId) —
 * passing the TASK id (not the project id) lets AuthzService's
 * resolveScope() load the task's own assigned_expert_id and evaluate
 * the isAssignee condition correctly.
 */
export async function updateTaskStatus(actorId: string, taskId: string, status: TaskStatus) {
  const permitted = await can(actorId, "task:update_status", taskId);
  if (!permitted) throw new TaskServiceError("Not authorized to update this task");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ status })
    .eq("id", taskId)
    .select()
    .single();

  if (error) throw new TaskServiceError(error.message);

  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action: "task.status_changed",
    entity_type: "task",
    entity_id: taskId,
    metadata: { status },
  });

  return data;
}

export async function addComment(actorId: string, taskId: string, content: string) {
  const supabase = await createSupabaseServerClient();

  const { data: task } = await supabase.from("tasks").select("project_id").eq("id", taskId).single();
  if (!task) throw new TaskServiceError("Task not found");

  const permitted = await can(actorId, "task:comment", task.project_id);
  if (!permitted) throw new TaskServiceError("Not authorized to comment on this task");

  const { data, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, author_id: actorId, content })
    .select()
    .single();

  if (error) throw new TaskServiceError(error.message);
  return data;
}

export async function listForProject(actorId: string, projectId: string) {
  const permitted = await can(actorId, "task:view", projectId);
  if (!permitted) throw new TaskServiceError("Not authorized to view this project's tasks");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, description, status, priority, due_date, milestone_id, assigned_expert_id, expert_profiles(headline, users(email))")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) throw new TaskServiceError(error.message);
  return data;
}

export async function listComments(actorId: string, taskId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: task } = await supabase.from("tasks").select("project_id").eq("id", taskId).single();
  if (!task) throw new TaskServiceError("Task not found");

  const permitted = await can(actorId, "task:comment", task.project_id);
  if (!permitted) throw new TaskServiceError("Not authorized to view this task");

  const { data, error } = await supabase
    .from("task_comments")
    .select("id, content, created_at, author_id, users(email)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) throw new TaskServiceError(error.message);
  return data;
}
