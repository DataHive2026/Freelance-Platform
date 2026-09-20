"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/services/auth";
import { submitApplication, ApplicationServiceError } from "@/lib/services/applications";

export interface ApplyState {
  error?: string;
  success?: boolean;
}

export async function applyAction(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Not signed in" };

  const projectId = formData.get("projectId");
  const coverLetter = formData.get("coverLetter");
  const proposedRate = formData.get("proposedRate");

  if (typeof projectId !== "string") return { error: "Missing project" };

  try {
    await submitApplication(user.id, {
      projectId,
      coverLetter: typeof coverLetter === "string" ? coverLetter : undefined,
      proposedRate: proposedRate ? Number(proposedRate) : undefined,
    });
  } catch (err) {
    return { error: err instanceof ApplicationServiceError ? err.message : "Failed to submit application" };
  }

  revalidatePath("/expert/browse");
  revalidatePath("/expert/proposals");
  return { success: true };
}
