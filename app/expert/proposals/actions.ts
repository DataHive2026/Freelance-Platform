"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/services/auth";
import { withdrawApplication } from "@/lib/services/applications";

export async function withdrawApplicationAction(formData: FormData): Promise<void> {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("Not signed in");

  const applicationId = formData.get("applicationId");
  if (typeof applicationId !== "string") throw new Error("Missing application id");

  await withdrawApplication(user.id, applicationId);
  revalidatePath("/expert/proposals");
}
