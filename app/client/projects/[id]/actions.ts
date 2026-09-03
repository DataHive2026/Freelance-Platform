"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/services/auth";
import { inviteExpert, TeamServiceError } from "@/lib/services/teams";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface InviteExpertState {
  error?: string;
  success?: boolean;
}

/**
 * Looks up an expert by email — a stand-in for a proper expert-directory
 * search (the Community/Directory screens from the design phase). Real
 * search wiring is a Phase 4b item; this proves the invite → accept loop
 * works end to end in the meantime.
 */
export async function inviteExpertAction(_prev: InviteExpertState, formData: FormData): Promise<InviteExpertState> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Not signed in" };

  const projectId = formData.get("projectId");
  const email = formData.get("expertEmail");
  const roleTitle = formData.get("roleTitle");
  const compensation = formData.get("compensation");
  const isLead = formData.get("isLead") === "on";

  if (typeof projectId !== "string" || typeof email !== "string" || !email.trim()) {
    return { error: "Missing project or expert email" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: expertUser } = await supabase
    .from("users")
    .select("id, user_type")
    .eq("email", email.trim())
    .maybeSingle();

  if (!expertUser || expertUser.user_type !== "expert") {
    return { error: `No expert account found for ${email}` };
  }

  const { data: expertProfile } = await supabase
    .from("expert_profiles")
    .select("id")
    .eq("user_id", expertUser.id)
    .single();

  if (!expertProfile) {
    return { error: `Found a user for ${email}, but no expert profile exists for them.` };
  }

  try {
    await inviteExpert(user.id, {
      projectId,
      expertId: expertProfile.id,
      isLead,
      responsibilities: typeof roleTitle === "string" ? roleTitle : undefined,
      compensationAmount: compensation ? Number(compensation) : undefined,
    });
  } catch (err) {
    return { error: err instanceof TeamServiceError ? err.message : "Failed to send invitation" };
  }

  revalidatePath(`/client/projects/${projectId}`);
  return { success: true };
}
