"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, getCurrentAppUser } from "@/lib/services/auth";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export interface LoginState {
  error?: string;
}

/**
 * Server Actions are thin by design (Phase 0 Section 6, rule #2): parse
 * and validate input, call exactly one service method, shape the
 * response. No business logic lives here.
 */
export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await signIn(parsed.data.email, parsed.data.password);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Sign in failed" };
  }

  const appUser = await getCurrentAppUser();
  if (!appUser) {
    return { error: "Signed in, but couldn't load your account. Contact support." };
  }

  redirect(appUser.user_type === "expert" ? "/expert/dashboard" : appUser.user_type === "admin" ? "/admin/dashboard" : "/client/dashboard");
}
