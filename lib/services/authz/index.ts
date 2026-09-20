import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findRule, type AuthzContext } from "./rules";
import type { UserType } from "@/types/domain";

/**
 * The single gate every service method calls before touching a
 * project-scoped resource. See permission-matrix.md for the full
 * rule table this implements — that document and RULES in ./rules.ts
 * must always match; this function is intentionally "dumb" (it just
 * evaluates the table) so the table stays the one place logic lives.
 */
export async function can(
  userId: string,
  action: string,
  resourceId: string | null = null
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();

  // 1. Load the actor. Suspended/deleted users fail every check.
  const { data: user } = await supabase
    .from("users")
    .select("id, user_type, status")
    .eq("id", userId)
    .single();

  if (!user || user.status !== "active") return false;

  // 2. Deny by default — no rule means no access.
  const rule = findRule(action);
  if (!rule) return false;

  if (!rule.allowedRoles.includes(user.user_type as UserType) && user.user_type !== "admin") {
    return false;
  }

  // 3. Resolve scope. "none" actions (e.g. admin:manage_users) skip this.
  const ctx: AuthzContext = {
    userId,
    actorRole: user.user_type as UserType,
    isOwner: false,
    isMember: false,
    isLead: false,
    isParty: false,
    isAssignee: false,
  };

  if (rule.scope !== "none" && resourceId) {
    await resolveScope(supabase, rule.scope, resourceId, ctx);

    const hasScope =
      (rule.scope === "owner" && (ctx.isOwner || ctx.actorRole === "admin")) ||
      (rule.scope === "member" && (ctx.isMember || ctx.isOwner || ctx.actorRole === "admin")) ||
      (rule.scope === "party" && (ctx.isParty || ctx.actorRole === "admin")) ||
      (rule.scope === "self" && ctx.resource?.owner_user_id === userId);

    if (!hasScope) return false;
  }

  // 4. State-dependent condition, if any.
  if (rule.condition && !rule.condition(ctx)) return false;

  // 5. Admin override — always logged, never silent (see permission-matrix.md §1).
  if (ctx.actorRole === "admin" && rule.scope !== "none") {
    await supabase.from("audit_logs").insert({
      actor_id: userId,
      action: `authz.admin_override.${action}`,
      entity_type: action.split(":")[0],
      entity_id: resourceId,
    });
  }

  return true;
}

/**
 * Loads whatever's needed to evaluate `scope` for a given resourceId.
 * This is intentionally generic — it inspects the action's entity type
 * via a lightweight lookup rather than one bespoke query per action,
 * to keep this file from growing one branch per action forever. Extend
 * the switch as new entity types need scope resolution.
 */
async function resolveScope(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  scope: string,
  resourceId: string,
  ctx: AuthzContext
) {
  // --- Milestone id? Resolve via its project, but keep the MILESTONE's
  // status on ctx.resource — milestone:approve's condition checks
  // milestone.status === "SUBMITTED", not the project's status. ---
  const { data: milestone } = await supabase
    .from("milestones")
    .select("id, project_id, status")
    .eq("id", resourceId)
    .maybeSingle();

  if (milestone) {
    await resolveProjectMembership(supabase, milestone.project_id, ctx);
    ctx.resource = { status: milestone.status };
    return;
  }

  // --- Task id? Same pattern — task:update_status's condition needs
  // assigned_expert_id, which only exists on the task row, not the
  // project. (This was the bug: the previous version of this function
  // only ever set ctx.resource = { status: project.status }, so
  // "assigned_expert_id === ctx.userId" could never be true and every
  // assigned expert who wasn't also the lead was silently denied.) ---
  const { data: task } = await supabase
    .from("tasks")
    .select("id, project_id, assigned_expert_id")
    .eq("id", resourceId)
    .maybeSingle();

  if (task) {
    await resolveProjectMembership(supabase, task.project_id, ctx);
    const { data: myExpertProfile } = await supabase
      .from("expert_profiles")
      .select("id")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    ctx.isAssignee = !!myExpertProfile && task.assigned_expert_id === myExpertProfile.id;
    return;
  }

  // --- Meeting id? Same pattern as tasks/milestones above —
  // meeting:cancel's condition needs created_by, which only exists on
  // the meeting row itself. (Before this branch existed, ANY resourceId
  // that wasn't a milestone/task/project would silently fall through
  // with isMember=false and resource=undefined — meaning meeting:cancel
  // could never actually succeed for anyone, including the meeting's
  // own creator. Same class of bug as the task/milestone one from
  // Phase 5, caught here before Phase 7's MeetingService shipped with
  // it.) ---
  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, project_id, created_by")
    .eq("id", resourceId)
    .maybeSingle();

  if (meeting) {
    await resolveProjectMembership(supabase, meeting.project_id, ctx);
    ctx.resource = { created_by: meeting.created_by };
    return;
  }

  // --- File id? Same pattern as tasks/milestones/meetings —
  // file:delete's condition needs uploaded_by, which only exists on the
  // file row itself. Added before FileService shipped, not after
  // finding it broken (Phase 9) — this is now the fifth entity to need
  // this exact treatment (team_members, tasks, milestones, meetings,
  // files), so it's a checklist item for any new entity now: does its
  // rule have a per-row condition, and if so, does resolveScope() have
  // a branch for it? ---
  const { data: file } = await supabase
    .from("files")
    .select("id, project_id, uploaded_by")
    .eq("id", resourceId)
    .maybeSingle();

  if (file) {
    await resolveProjectMembership(supabase, file.project_id, ctx);
    ctx.resource = { uploaded_by: file.uploaded_by };
    return;
  }

  // --- Plain project id — the common case (project:*, team:*, file:*, etc). ---
  const { data: project } = await supabase
    .from("projects")
    .select("id, status")
    .eq("id", resourceId)
    .maybeSingle();

  if (project) {
    await resolveProjectMembership(supabase, resourceId, ctx);
    ctx.resource = { status: project.status };
    return;
  }

  // --- Fall back to a team_members row id — used by
  // team:accept_invitation / team:decline_invitation, where the resource
  // being acted on IS the invitation itself, not a project. ---
  const { data: member } = await supabase
    .from("team_members")
    .select("id, expert_profiles(user_id)")
    .eq("id", resourceId)
    .maybeSingle();

  if (member) {
    // @ts-expect-error — Supabase's joined-table typing needs generated types wired in
    ctx.resource = { owner_user_id: member.expert_profiles?.user_id };
    return;
  }

  // --- Fall back to a project_applications row id — same pattern,
  // used by application:withdraw. Caught proactively this time (Phase 8)
  // rather than after ApplicationService shipped with it broken — the
  // same class of bug (a "self" or per-row condition scope with no
  // matching resolveScope branch) has now hit team_members, tasks,
  // milestones, and meetings across Phases 4 through 7. ---
  const { data: application } = await supabase
    .from("project_applications")
    .select("id, expert_profiles(user_id)")
    .eq("id", resourceId)
    .maybeSingle();

  if (application) {
    // @ts-expect-error — same joined-table typing gap as above
    ctx.resource = { owner_user_id: application.expert_profiles?.user_id };
    return;
  }

  // --- Fall back to dispute party resolution. ---
  const { data: dispute } = await supabase
    .from("disputes")
    .select("raised_by, against")
    .eq("id", resourceId)
    .maybeSingle();

  if (dispute) {
    ctx.isParty = dispute.raised_by === ctx.userId || dispute.against === ctx.userId;
  }
}

/**
 * Sets isOwner / isMember / isLead on ctx for a given project id. Shared
 * by every branch above (project, task, milestone) so "am I on this
 * project's team" is resolved exactly one way, not reimplemented per
 * entity type.
 */
async function resolveProjectMembership(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  projectId: string,
  ctx: AuthzContext
) {
  const { data: project } = await supabase
    .from("projects")
    .select("client_profiles(user_id)")
    .eq("id", projectId)
    .maybeSingle();

  // @ts-expect-error — same joined-table typing gap as elsewhere in this file
  ctx.isOwner = project?.client_profiles?.user_id === ctx.userId;

  const { data: team } = await supabase
    .from("project_teams")
    .select("id")
    .eq("project_id", projectId)
    .maybeSingle();

  const { data: myExpertProfile } = await supabase
    .from("expert_profiles")
    .select("id")
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (team && myExpertProfile) {
    const { data: membership } = await supabase
      .from("team_members")
      .select("is_lead, status")
      .eq("project_team_id", team.id)
      .eq("expert_id", myExpertProfile.id)
      .maybeSingle();

    if (membership) {
      ctx.isMember = membership.status === "active" || membership.status === "accepted";
      ctx.isLead = membership.is_lead === true;
    }
  }
}
