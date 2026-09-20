import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/services/authz";

export class UserServiceError extends Error {}

export interface ListUsersInput {
  search?: string;
  userType?: "client" | "expert" | "admin";
}

export async function listUsers(actorId: string, input: ListUsersInput = {}) {
  const permitted = await can(actorId, "admin:manage_users");
  if (!permitted) throw new UserServiceError("Not authorized to manage users");

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("users")
    .select("id, email, user_type, status, created_at, client_profiles(company_name), expert_profiles(headline)")
    .order("created_at", { ascending: false });

  if (input.userType) query = query.eq("user_type", input.userType);
  if (input.search) query = query.ilike("email", `%${input.search}%`);

  const { data, error } = await query;
  if (error) throw new UserServiceError(error.message);
  return data;
}

/**
 * Suspension takes effect immediately for any already-issued session —
 * not because of anything new here, but because
 * lib/services/auth/getCurrentAppUser() has checked
 * `appUser.status !== "active"` and returned null since Phase 2. Every
 * protected page's `if (!user) redirect("/login")` guard already covers
 * suspended users; this function only has to flip the status column.
 */
export async function suspendUser(actorId: string, targetUserId: string) {
  if (actorId === targetUserId) {
    throw new UserServiceError("You can't suspend your own account");
  }

  const permitted = await can(actorId, "admin:manage_users");
  if (!permitted) throw new UserServiceError("Not authorized to manage users");

  const supabase = await createSupabaseServerClient();
  const { data: target } = await supabase.from("users").select("user_type, status").eq("id", targetUserId).single();
  if (!target) throw new UserServiceError("User not found");
  if (target.user_type === "admin") {
    throw new UserServiceError("Suspend another admin's access at the database level, not through this panel — prevents a compromised or careless admin session from locking out the rest of the admin team.");
  }

  const { error } = await supabase.from("users").update({ status: "suspended" }).eq("id", targetUserId);
  if (error) throw new UserServiceError(error.message);

  await supabase.from("audit_logs").insert({
    actor_id: actorId, action: "user.suspended", entity_type: "user", entity_id: targetUserId,
  });
}

export async function restoreUser(actorId: string, targetUserId: string) {
  const permitted = await can(actorId, "admin:manage_users");
  if (!permitted) throw new UserServiceError("Not authorized to manage users");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("users").update({ status: "active" }).eq("id", targetUserId);
  if (error) throw new UserServiceError(error.message);

  await supabase.from("audit_logs").insert({
    actor_id: actorId, action: "user.restored", entity_type: "user", entity_id: targetUserId,
  });
}
