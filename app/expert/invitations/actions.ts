"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/services/auth";
import { acceptInvitation, declineInvitation } from "@/lib/services/teams";

/**
 * These are used directly as `<form action={...}>` on a Server Component
 * page (app/(expert)/invitations/page.tsx), which requires the plain
 * `(formData) => Promise<void>` signature — not the `(prevState, formData)`
 * shape `useActionState` expects. If this page grows client-side
 * pending/error UI later, wrap these instead of changing the signature
 * here, so both call sites keep working.
 */
export async function acceptInvitationAction(formData: FormData): Promise<void> {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("Not signed in");

  const teamMemberId = formData.get("teamMemberId");
  if (typeof teamMemberId !== "string") throw new Error("Missing invitation id");

  await acceptInvitation(user.id, teamMemberId);
  revalidatePath("/expert/invitations");
}

export async function declineInvitationAction(formData: FormData): Promise<void> {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("Not signed in");

  const teamMemberId = formData.get("teamMemberId");
  if (typeof teamMemberId !== "string") throw new Error("Missing invitation id");

  await declineInvitation(user.id, teamMemberId);
  revalidatePath("/expert/invitations");
}
