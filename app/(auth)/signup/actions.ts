"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { signUp } from "@/lib/services/auth";

const signupSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  userType: z.enum(["client", "expert"]),
  companyName: z.string().optional(),
  fullName: z.string().optional(),
});

export interface SignupState {
  error?: string;
}

export async function signupAction(_prevState: SignupState, formData: FormData): Promise<SignupState> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    userType: formData.get("userType"),
    companyName: formData.get("companyName") || undefined,
    fullName: formData.get("fullName") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await signUp(parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Sign up failed" };
  }

  redirect(parsed.data.userType === "expert" ? "/expert/dashboard" : "/client/dashboard");
}
