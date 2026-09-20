"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/services/auth";
import { submitEvidence, resolveDispute, DisputeServiceError } from "@/lib/services/disputes";

export interface DisputeActionState {
  error?: string;
  success?: boolean;
}

export async function submitEvidenceAction(_prev: DisputeActionState, formData: FormData): Promise<DisputeActionState> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Not signed in" };

  const disputeId = formData.get("disputeId");
  const message = formData.get("message");
  if (typeof disputeId !== "string") return { error: "Missing dispute id" };

  try {
    await submitEvidence(user.id, { disputeId, message: typeof message === "string" ? message : undefined });
  } catch (err) {
    return { error: err instanceof DisputeServiceError ? err.message : "Failed to submit" };
  }

  revalidatePath(`/admin/disputes/${disputeId}`);
  revalidatePath(`/projects`);
  return { success: true };
}

export async function resolveDisputeAction(_prev: DisputeActionState, formData: FormData): Promise<DisputeActionState> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Not signed in" };

  const disputeId = formData.get("disputeId");
  const resolution = formData.get("resolution");
  const outcome = formData.get("outcome");
  if (typeof disputeId !== "string" || typeof resolution !== "string" || (outcome !== "reopen" && outcome !== "cancel")) {
    return { error: "Missing required fields" };
  }

  try {
    await resolveDispute(user.id, disputeId, resolution, outcome);
  } catch (err) {
    return { error: err instanceof DisputeServiceError ? err.message : "Failed to resolve dispute" };
  }

  revalidatePath(`/admin/disputes/${disputeId}`);
  revalidatePath("/admin/disputes");
  return { success: true };
}
