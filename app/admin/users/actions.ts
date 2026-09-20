"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/services/auth";
import { suspendUser, restoreUser, UserServiceError } from "@/lib/services/users";

export interface UserActionState {
  error?: string;
}

export async function suspendUserAction(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Not signed in" };

  const targetUserId = formData.get("targetUserId");
  if (typeof targetUserId !== "string") return { error: "Missing user id" };

  try {
    await suspendUser(user.id, targetUserId);
  } catch (err) {
    return { error: err instanceof UserServiceError ? err.message : "Failed to suspend user" };
  }

  revalidatePath("/admin/users");
  return {};
}

export async function restoreUserAction(formData: FormData): Promise<void> {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("Not signed in");

  const targetUserId = formData.get("targetUserId");
  if (typeof targetUserId !== "string") throw new Error("Missing user id");

  await restoreUser(user.id, targetUserId);
  revalidatePath("/admin/users");
}
