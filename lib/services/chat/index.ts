import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/services/authz";

export class ChatServiceError extends Error {}

/**
 * A project has at most one team-wide conversation, created lazily the
 * first time anyone sends a message — same pattern as
 * TeamService.ensureTeamExists(). Note: neither message:send nor
 * message:read has a per-row condition in rules.ts (see Phase 9's
 * README entry for the pattern this WOULD need if they did) — scope
 * "member" resolves fine against a plain project id through the
 * existing project branch in resolveScope(), so this is one of the few
 * entities that DIDN'T need a new branch there.
 */
async function getOrCreateConversation(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, projectId: string) {
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("project_id", projectId)
    .eq("type", "team_wide")
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ project_id: projectId, type: "team_wide" })
    .select("id")
    .single();
  if (error) throw new ChatServiceError(error.message);

  await ensureParticipants(supabase, created.id, projectId);
  return created.id;
}

async function ensureParticipants(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  conversationId: string,
  projectId: string
) {
  const { data: project } = await supabase.from("projects").select("client_profiles(user_id)").eq("id", projectId).single();
  const { data: team } = await supabase.from("project_teams").select("id").eq("project_id", projectId).maybeSingle();
  const { data: members } = team
    ? await supabase.from("team_members").select("expert_profiles(user_id)").eq("project_team_id", team.id).eq("status", "active")
    : { data: [] };

  const userIds = new Set<string>();
  // @ts-expect-error — joined-table typing gap, same as elsewhere in the codebase
  if (project?.client_profiles?.user_id) userIds.add(project.client_profiles.user_id);
  for (const m of members ?? []) {
    // @ts-expect-error — see above
    if (m.expert_profiles?.user_id) userIds.add(m.expert_profiles.user_id);
  }
  if (userIds.size === 0) return;

  await supabase.from("conversation_participants").upsert(
    Array.from(userIds).map((userId) => ({ conversation_id: conversationId, user_id: userId })),
    { onConflict: "conversation_id,user_id", ignoreDuplicates: true }
  );
}

export async function sendMessage(actorId: string, projectId: string, content: string) {
  const permitted = await can(actorId, "message:send", projectId);
  if (!permitted) throw new ChatServiceError("Not authorized to send messages on this project");
  if (!content.trim()) throw new ChatServiceError("Message can't be empty");

  const supabase = await createSupabaseServerClient();
  const conversationId = await getOrCreateConversation(supabase, projectId);

  // Re-sync participants on every send too — cheap, and covers the case
  // where someone joined the team after the conversation was first
  // created (ensureParticipants upserts with ignoreDuplicates, so this
  // is a no-op for people already in it).
  await ensureParticipants(supabase, conversationId, projectId);

  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: actorId, content: content.trim() })
    .select()
    .single();
  if (error) throw new ChatServiceError(error.message);

  return data;
}

export async function listMessages(actorId: string, projectId: string) {
  const permitted = await can(actorId, "message:read", projectId);
  if (!permitted) throw new ChatServiceError("Not authorized to read messages on this project");

  const supabase = await createSupabaseServerClient();
  const conversationId = await getOrCreateConversation(supabase, projectId);

  const { data, error } = await supabase
    .from("messages")
    .select("id, content, created_at, sender_id, users(email)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw new ChatServiceError(error.message);
  return { conversationId, messages: data };
}

export async function markRead(actorId: string, messageId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("message_reads")
    .upsert({ message_id: messageId, user_id: actorId }, { onConflict: "message_id,user_id", ignoreDuplicates: true });
  if (error) throw new ChatServiceError(error.message);
}
