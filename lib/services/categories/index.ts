import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/services/authz";

export class CategoryServiceError extends Error {}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
 * Public read — categories power the project-creation dropdown and the
 * browse-projects filter, so this deliberately has no can() check
 * (matches project:view's own public scope from Phase 4).
 */
export async function listCategories() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, parent_category_id, is_active")
    .order("name", { ascending: true });

  if (error) throw new CategoryServiceError(error.message);
  return data;
}

export async function createCategory(actorId: string, name: string, parentCategoryId?: string) {
  const permitted = await can(actorId, "admin:manage_categories");
  if (!permitted) throw new CategoryServiceError("Not authorized to manage categories");
  if (!name.trim()) throw new CategoryServiceError("Category name is required");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("categories")
    .insert({ name: name.trim(), slug: slugify(name), parent_category_id: parentCategoryId, is_active: true })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") throw new CategoryServiceError("A category with that name already exists");
    throw new CategoryServiceError(error.message);
  }

  await supabase.from("audit_logs").insert({
    actor_id: actorId, action: "category.created", entity_type: "category", entity_id: data.id, metadata: { name },
  });

  return data;
}

export async function toggleCategoryActive(actorId: string, categoryId: string) {
  const permitted = await can(actorId, "admin:manage_categories");
  if (!permitted) throw new CategoryServiceError("Not authorized to manage categories");

  const supabase = await createSupabaseServerClient();
  const { data: cat } = await supabase.from("categories").select("is_active").eq("id", categoryId).single();
  if (!cat) throw new CategoryServiceError("Category not found");

  const { error } = await supabase.from("categories").update({ is_active: !cat.is_active }).eq("id", categoryId);
  if (error) throw new CategoryServiceError(error.message);

  await supabase.from("audit_logs").insert({
    actor_id: actorId, action: "category.toggled", entity_type: "category", entity_id: categoryId, metadata: { is_active: !cat.is_active },
  });
}

/**
 * projects.category_id has no ON DELETE clause in 0001_init.sql, so
 * Postgres defaults to RESTRICT — deleting a category still referenced
 * by a project fails at the database level. Caught here and turned into
 * a clear message rather than a raw foreign-key-violation error; the
 * right move for an in-use category is deactivating it (above), not
 * deleting it, and the error message says so.
 */
export async function deleteCategory(actorId: string, categoryId: string) {
  const permitted = await can(actorId, "admin:manage_categories");
  if (!permitted) throw new CategoryServiceError("Not authorized to manage categories");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("categories").delete().eq("id", categoryId);

  if (error) {
    if (error.code === "23503") {
      throw new CategoryServiceError("This category is still used by existing projects — deactivate it instead of deleting it.");
    }
    throw new CategoryServiceError(error.message);
  }

  await supabase.from("audit_logs").insert({
    actor_id: actorId, action: "category.deleted", entity_type: "category", entity_id: categoryId,
  });
}
