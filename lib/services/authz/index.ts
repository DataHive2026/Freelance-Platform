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
  // Try resolving as a project id first — the common case.
  const { data: project } = await supabase
    .from("projects")
    .select("id, status, client_profiles(user_id)")
    .eq("id", resourceId)
    .maybeSingle();

  if (project) {
    ctx.resource = { status: project.status };
    // @ts-expect-error — Supabase's joined-table typing needs generated types wired in
    ctx.isOwner = project.client_profiles?.user_id === ctx.userId;

    // team_members.project_team_id references project_teams.id, NOT the
    // project directly — resolve through project_teams first, then look
    // up the caller's own expert_profiles row to find their membership.
    // (An earlier version of this function queried team_members with the
    // project id directly, which silently never matched anything — every
    // non-owner call fell through as "not a member." Fixed here.)
    const { data: team } = await supabase
      .from("project_teams")
      .select("id")
      .eq("project_id", resourceId)
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
    return;
  }

  // Fall back to a team_members row id — used by team:accept_invitation /
  // team:decline_invitation, where the resource being acted on IS the
  // invitation itself, not a project.
  const { data: member } = await supabase
    .from("team_members")
    .select("id, expert_profiles(user_id)")
    .eq("id", resourceId)
    .maybeSingle();

  if (member) {
    // @ts-expect-error — same joined-table typing gap as above
    ctx.resource = { owner_user_id: member.expert_profiles?.user_id };
    return;
  }

  // Fall back to dispute party resolution.
  const { data: dispute } = await supabase
    .from("disputes")
    .select("raised_by, against")
    .eq("id", resourceId)
    .maybeSingle();

  if (dispute) {
    ctx.isParty = dispute.raised_by === ctx.userId || dispute.against === ctx.userId;
  }
}
