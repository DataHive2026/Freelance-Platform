import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserType } from "@/types/domain";

export class AuthServiceError extends Error {}

export interface SignUpInput {
  email: string;
  password: string;
  userType: Extract<UserType, "client" | "expert">;
  // Client-specific
  companyName?: string;
  // Expert-specific
  fullName?: string;
}

/**
 * Wraps Supabase Auth. This service owns signup/login/session only — it
 * never decides WHO is allowed to do WHAT once authenticated. That's
 * AuthzService's job. See phase0-database-and-lifecycle.md Section 7.
 */
export async function signUp(input: SignUpInput) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      // Captured as raw_user_meta_data — the 0002_auth_integration.sql
      // trigger reads this to set users.user_type at row-creation time.
      data: { user_type: input.userType },
    },
  });

  if (error) throw new AuthServiceError(error.message);
  if (!data.user) throw new AuthServiceError("Signup did not return a user");

  // The trigger has already created the public.users row by the time this
  // resolves (same Postgres transaction as the auth.users insert). Fetch
  // it so we can attach the client/expert profile to the right id.
  const { data: appUser, error: lookupError } = await supabase
    .from("users")
    .select("id")
    .eq("auth_provider_id", data.user.id)
    .single();

  if (lookupError || !appUser) {
    throw new AuthServiceError("Account created but profile row is missing — check the auth trigger.");
  }

  if (input.userType === "client") {
    const { error: profileError } = await supabase
      .from("client_profiles")
      .insert({ user_id: appUser.id, company_name: input.companyName ?? "Unnamed company" });
    if (profileError) throw new AuthServiceError(profileError.message);
  } else {
    const { error: profileError } = await supabase
      .from("expert_profiles")
      .insert({ user_id: appUser.id, headline: input.fullName ?? "New expert" });
    if (profileError) throw new AuthServiceError(profileError.message);
  }

  return { userId: appUser.id, authUserId: data.user.id };
}

export async function signIn(email: string, password: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new AuthServiceError(error.message);
  return data;
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new AuthServiceError(error.message);
}

/**
 * Resolves the currently authenticated Supabase session into our
 * application-level user row + role-specific profile. Returns null if
 * no one is signed in — callers (Server Components, layouts) decide
 * what to do with that (usually redirect to /login).
 */
export async function getCurrentAppUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data: appUser } = await supabase
    .from("users")
    .select("id, email, user_type, status")
    .eq("auth_provider_id", authUser.id)
    .single();

  if (!appUser || appUser.status !== "active") return null;

  return appUser;
}
