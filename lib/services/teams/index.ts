import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/services/authz";

export class TeamServiceError extends Error {}

/**
 * Lazily creates the project_teams row for a project the first time
 * anyone is invited onto it. A project has at most one team (Phase 0:
 * project_teams.project_id is unique), so this is idempotent.
 */
async function ensureTeamExists(projectId: string) {
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("project_teams")
    .select("id")
    .eq("project_id", projectId)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("project_teams")
    .insert({ project_id: projectId, status: "forming" })
    .select("id")
    .single();

  if (error) throw new TeamServiceError(error.message);
  return created.id;
}

export interface InviteExpertInput {
  projectId: string;
  expertId: string;       // expert_profiles.id
  projectRoleId?: string;
  isLead?: boolean;
  responsibilities?: string;
  compensationAmount?: number;
  contributionPct?: number;
}

/**
 * Invites an expert onto a project's team. Per permission-matrix.md
 * Section 3.2, this is deliberately not client-only — a team lead can
 * invite too (the Section 20 "expert network effect"), which is why the
 * authz check is against the project, not a hardcoded role check here.
 */
export async function inviteExpert(actorId: string, input: InviteExpertInput) {
  const permitted = await can(actorId, "team:invite_expert", input.projectId);
  if (!permitted) throw new TeamServiceError("Not authorized to invite experts to this project");

  const teamId = await ensureTeamExists(input.projectId);
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("team_members")
    .insert({
      project_team_id: teamId,
      expert_id: input.expertId,
      project_role_id: input.projectRoleId,
      is_lead: input.isLead ?? false,
      responsibilities: input.responsibilities,
      compensation_amount: input.compensationAmount,
      contribution_pct: input.contributionPct,
      status: "invited",
    })
    .select()
    .single();

  if (error) throw new TeamServiceError(error.message);

  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action: "team.member_invited",
    entity_type: "team_member",
    entity_id: data.id,
    metadata: { project_id: input.projectId, expert_id: input.expertId },
  });

  // TODO(notifications): fire a team_invitation notification to the invited
  // expert's user_id once NotificationService exists.

  return data;
}

/**
 * Accept/decline both take a team_members.id (the invitation itself) as
 * resourceId — AuthzService resolves "self" scope by checking the
 * invited expert's user_id matches the caller (see authz/index.ts's
 * team_members fallback branch).
 */
export async function acceptInvitation(actorId: string, teamMemberId: string) {
  const permitted = await can(actorId, "team:accept_invitation", teamMemberId);
  if (!permitted) throw new TeamServiceError("Not authorized to accept this invitation");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("team_members")
    .update({ status: "active", joined_at: new Date().toISOString() })
    .eq("id", teamMemberId)
    .select()
    .single();

  if (error) throw new TeamServiceError(error.message);

  await maybeConfirmTeam(data.project_team_id);
  return data;
}

export async function declineInvitation(actorId: string, teamMemberId: string) {
  const permitted = await can(actorId, "team:decline_invitation", teamMemberId);
  if (!permitted) throw new TeamServiceError("Not authorized to decline this invitation");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("team_members")
    .update({ status: "declined" })
    .eq("id", teamMemberId)
    .select()
    .single();

  if (error) throw new TeamServiceError(error.message);
  return data;
}

export async function removeMember(actorId: string, projectId: string, teamMemberId: string) {
  const permitted = await can(actorId, "team:remove_member", projectId);
  if (!permitted) throw new TeamServiceError("Not authorized to remove team members on this project");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("team_members")
    .update({ status: "removed" })
    .eq("id", teamMemberId);

  if (error) throw new TeamServiceError(error.message);

  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action: "team.member_removed",
    entity_type: "team_member",
    entity_id: teamMemberId,
    metadata: { project_id: projectId },
  });
}

export async function listRoster(actorId: string, projectId: string) {
  const permitted = await can(actorId, "team:view_roster", projectId);
  if (!permitted) throw new TeamServiceError("Not authorized to view this project's team");

  const supabase = await createSupabaseServerClient();
  const { data: team } = await supabase
    .from("project_teams")
    .select("id")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!team) return [];

  const { data, error } = await supabase
    .from("team_members")
    .select("id, is_lead, responsibilities, compensation_amount, contribution_pct, status, joined_at, expert_profiles(id, headline, user_id, users(email))")
    .eq("project_team_id", team.id)
    .neq("status", "removed")
    .order("is_lead", { ascending: false });

  if (error) throw new TeamServiceError(error.message);
  return data;
}

/**
 * Lists pending invitations for the signed-in expert, across all
 * projects — this is what powers the /invitations page.
 */
export async function listMyInvitations(userId: string) {
  const supabase = await createSupabaseServerClient();

  const { data: myExpertProfile } = await supabase
    .from("expert_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!myExpertProfile) return [];

  const { data, error } = await supabase
    .from("team_members")
    .select("id, is_lead, responsibilities, compensation_amount, status, project_teams(project_id, projects(title, client_profiles(company_name)))")
    .eq("expert_id", myExpertProfile.id)
    .order("id", { ascending: false });

  if (error) throw new TeamServiceError(error.message);
  return data;
}

/**
 * TEAM_FORMING → TEAM_CONFIRMED is meant to fire automatically once every
 * required role is filled (Phase 0's state machine, transition table in
 * permission-matrix.md §3.1.1: "System (automatic)"). This is a first-pass
 * implementation of that trigger — it checks whether all seats are filled
 * with active members, and if so calls ProjectService.
 *
 * Deliberately NOT wired to project_roles.seats_available yet (that
 * requires joining seats-per-role vs. accepted-members-per-role, which
 * needs project_roles.id on every team_members row consistently populated
 * — left as a TODO once the role-assignment UI in Phase 4b exists). For
 * now this only confirms a team once at least one member is active AND
 * there are no outstanding "invited" rows.
 */
async function maybeConfirmTeam(teamId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: members } = await supabase
    .from("team_members")
    .select("status")
    .eq("project_team_id", teamId);

  if (!members || members.length === 0) return;
  const hasPending = members.some((m) => m.status === "invited");
  const hasActive = members.some((m) => m.status === "active");

  if (hasActive && !hasPending) {
    await supabase.from("project_teams").update({ status: "confirmed" }).eq("id", teamId);
    // NOTE: does not yet call ProjectService.transitionStatus() to move
    // the project itself to TEAM_CONFIRMED — that needs the acting
    // system identity threaded through, left for the next pass.
  }
}
