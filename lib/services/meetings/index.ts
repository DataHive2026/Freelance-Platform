import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/services/authz";
import type { MeetingProviderAdapter } from "./provider";
import { ZoomAdapter } from "./zoom-adapter";
import { MockMeetingProvider } from "./mock-adapter";

export class MeetingServiceError extends Error {}

function getProvider(): MeetingProviderAdapter {
  if (process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET) {
    return new ZoomAdapter();
  }
  return new MockMeetingProvider();
}

export interface ScheduleMeetingInput {
  projectId: string;
  title: string;
  startTime: string; // ISO 8601
  durationMinutes: number;
}

/**
 * Schedules a meeting: creates it with the provider first (so a failed
 * Zoom call never leaves a half-created DB row pointing at nothing),
 * then persists it and auto-invites every active team member plus the
 * project's client as participants — matching the workflow in Section
 * 13 ("Select participants" defaults to the project team, not a blank
 * picker).
 */
export async function scheduleMeeting(actorId: string, input: ScheduleMeetingInput) {
  const permitted = await can(actorId, "meeting:schedule", input.projectId);
  if (!permitted) throw new MeetingServiceError("Not authorized to schedule meetings on this project");

  const provider = getProvider();
  const { providerMeetingId, joinUrl } = await provider.createMeeting({
    topic: input.title,
    startTime: input.startTime,
    durationMinutes: input.durationMinutes,
  });

  const supabase = await createSupabaseServerClient();
  const scheduledEnd = new Date(new Date(input.startTime).getTime() + input.durationMinutes * 60_000).toISOString();

  const { data: meeting, error } = await supabase
    .from("meetings")
    .insert({
      project_id: input.projectId,
      title: input.title,
      scheduled_start: input.startTime,
      scheduled_end: scheduledEnd,
      meeting_provider: "zoom",
      provider_meeting_id: providerMeetingId,
      provider_join_url: joinUrl,
      created_by: actorId,
      status: "scheduled",
    })
    .select()
    .single();
  if (error) throw new MeetingServiceError(error.message);

  await autoInviteParticipants(supabase, meeting.id, input.projectId);

  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action: "meeting.scheduled",
    entity_type: "meeting",
    entity_id: meeting.id,
    metadata: { project_id: input.projectId, provider_meeting_id: providerMeetingId },
  });

  return meeting;
}

async function autoInviteParticipants(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  meetingId: string,
  projectId: string
) {
  const { data: project } = await supabase
    .from("projects")
    .select("client_profiles(user_id)")
    .eq("id", projectId)
    .single();

  const { data: team } = await supabase.from("project_teams").select("id").eq("project_id", projectId).maybeSingle();
  const { data: members } = team
    ? await supabase
        .from("team_members")
        .select("expert_profiles(user_id)")
        .eq("project_team_id", team.id)
        .eq("status", "active")
    : { data: [] };

  const participantUserIds = new Set<string>();
  // @ts-expect-error — joined-table typing gap, same as elsewhere in the codebase
  if (project?.client_profiles?.user_id) participantUserIds.add(project.client_profiles.user_id);
  for (const m of members ?? []) {
    // @ts-expect-error — see above
    if (m.expert_profiles?.user_id) participantUserIds.add(m.expert_profiles.user_id);
  }

  if (participantUserIds.size === 0) return;

  await supabase.from("meeting_participants").insert(
    Array.from(participantUserIds).map((userId) => ({
      meeting_id: meetingId,
      user_id: userId,
      rsvp_status: "pending",
    }))
  );
}

export async function cancelMeeting(actorId: string, meetingId: string) {
  const permitted = await can(actorId, "meeting:cancel", meetingId);
  if (!permitted) throw new MeetingServiceError("Not authorized to cancel this meeting");

  const supabase = await createSupabaseServerClient();
  const { data: meeting } = await supabase.from("meetings").select("provider_meeting_id").eq("id", meetingId).single();
  if (!meeting) throw new MeetingServiceError("Meeting not found");

  if (meeting.provider_meeting_id) {
    const provider = getProvider();
    await provider.cancelMeeting(meeting.provider_meeting_id);
  }

  const { error } = await supabase.from("meetings").update({ status: "cancelled" }).eq("id", meetingId);
  if (error) throw new MeetingServiceError(error.message);
}

export async function respondRsvp(actorId: string, meetingId: string, status: "accepted" | "declined") {
  const permitted = await can(actorId, "meeting:respond_rsvp", meetingId);
  if (!permitted) throw new MeetingServiceError("Not authorized to RSVP on this meeting");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("meeting_participants")
    .update({ rsvp_status: status })
    .eq("meeting_id", meetingId)
    .eq("user_id", actorId);

  if (error) throw new MeetingServiceError(error.message);
}

export async function addActionItem(actorId: string, meetingId: string, description: string, assignedTo?: string) {
  const permitted = await can(actorId, "meeting:view", meetingId);
  if (!permitted) throw new MeetingServiceError("Not authorized on this meeting");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("action_items")
    .insert({ meeting_id: meetingId, description, assigned_to: assignedTo, status: "open" })
    .select()
    .single();

  if (error) throw new MeetingServiceError(error.message);
  return data;
}

export async function toggleActionItem(actorId: string, actionItemId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: item } = await supabase.from("action_items").select("meeting_id, status").eq("id", actionItemId).single();
  if (!item) throw new MeetingServiceError("Action item not found");

  const permitted = await can(actorId, "meeting:view", item.meeting_id);
  if (!permitted) throw new MeetingServiceError("Not authorized on this meeting");

  const { error } = await supabase
    .from("action_items")
    .update({ status: item.status === "open" ? "done" : "open" })
    .eq("id", actionItemId);
  if (error) throw new MeetingServiceError(error.message);
}

export async function addNotes(actorId: string, meetingId: string, notes: string) {
  const permitted = await can(actorId, "meeting:view", meetingId);
  if (!permitted) throw new MeetingServiceError("Not authorized on this meeting");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("meetings").update({ notes, status: "completed" }).eq("id", meetingId);
  if (error) throw new MeetingServiceError(error.message);
}

export async function listForProject(actorId: string, projectId: string) {
  const permitted = await can(actorId, "meeting:view", projectId);
  if (!permitted) throw new MeetingServiceError("Not authorized to view this project's meetings");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("meetings")
    .select("id, title, scheduled_start, scheduled_end, provider_join_url, status, notes, created_by")
    .eq("project_id", projectId)
    .order("scheduled_start", { ascending: true });

  if (error) throw new MeetingServiceError(error.message);
  return data;
}

export async function getMeeting(actorId: string, meetingId: string) {
  const permitted = await can(actorId, "meeting:view", meetingId);
  if (!permitted) throw new MeetingServiceError("Not authorized to view this meeting");

  const supabase = await createSupabaseServerClient();
  const { data: meeting, error } = await supabase
    .from("meetings")
    .select("id, project_id, title, scheduled_start, scheduled_end, provider_join_url, status, notes, created_by")
    .eq("id", meetingId)
    .single();
  if (error) throw new MeetingServiceError(error.message);

  const { data: participants } = await supabase
    .from("meeting_participants")
    .select("user_id, rsvp_status, users(email)")
    .eq("meeting_id", meetingId);

  const { data: actionItems } = await supabase
    .from("action_items")
    .select("id, description, status, assigned_to")
    .eq("meeting_id", meetingId);

  return { meeting, participants: participants ?? [], actionItems: actionItems ?? [] };
}
