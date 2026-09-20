"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/services/auth";
import { createCategory, toggleCategoryActive, deleteCategory, CategoryServiceError } from "@/lib/services/categories";

export interface CategoryActionState {
  error?: string;
}

export async function createCategoryAction(_prev: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Not signed in" };

  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) return { error: "Name is required" };

  try {
    await createCategory(user.id, name);
  } catch (err) {
    return { error: err instanceof CategoryServiceError ? err.message : "Failed to create category" };
  }

  revalidatePath("/admin/categories");
  return {};
}

export async function toggleCategoryAction(formData: FormData): Promise<void> {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("Not signed in");

  const categoryId = formData.get("categoryId");
  if (typeof categoryId !== "string") throw new Error("Missing category id");

  await toggleCategoryActive(user.id, categoryId);
  revalidatePath("/admin/categories");
}

export async function deleteCategoryAction(_prev: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Not signed in" };

  const categoryId = formData.get("categoryId");
  if (typeof categoryId !== "string") return { error: "Missing category id" };

  try {
    await deleteCategory(user.id, categoryId);
  } catch (err) {
    return { error: err instanceof CategoryServiceError ? err.message : "Failed to delete category" };
  }

  revalidatePath("/admin/categories");
  return {};
}
