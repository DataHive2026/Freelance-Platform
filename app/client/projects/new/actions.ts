"use server";

import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/services/auth";
import { getMyClientProfile } from "@/lib/services/profiles";
import { createProject } from "@/lib/services/projects";
import { createProjectSchema } from "@/lib/validation/project";

export interface NewProjectState {
  error?: string;
}

export async function createProjectAction(_prevState: NewProjectState, formData: FormData): Promise<NewProjectState> {
  const user = await getCurrentAppUser();
  if (!user || user.user_type !== "client") {
    return { error: "You must be signed in as a client to post a project." };
  }

  const budgetMinRaw = formData.get("budgetMin");
  const budgetMaxRaw = formData.get("budgetMax");
  const deadlineRaw = formData.get("deadline");
  const categoryIdRaw = formData.get("categoryId");

  const parsed = createProjectSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    categoryId: categoryIdRaw || undefined,
    budgetMin: budgetMinRaw ? Number(budgetMinRaw) : undefined,
    budgetMax: budgetMaxRaw ? Number(budgetMaxRaw) : undefined,
    deadline: deadlineRaw || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const profile = await getMyClientProfile(user.id);
    const project = await createProject(user.id, {
      clientId: profile.id,
      title: parsed.data.title,
      description: parsed.data.description,
      categoryId: parsed.data.categoryId,
      budgetMin: parsed.data.budgetMin,
      budgetMax: parsed.data.budgetMax,
      deadline: parsed.data.deadline,
    });
    redirect(`/projects/${project.id}`);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create project" };
  }
}
