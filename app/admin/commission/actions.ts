"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/services/auth";
import { createCommissionRule, deactivateCommissionRule, CommissionServiceError } from "@/lib/config/commission";

export interface CommissionActionState {
  error?: string;
}

export async function createCommissionRuleAction(_prev: CommissionActionState, formData: FormData): Promise<CommissionActionState> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Not signed in" };

  const scope = formData.get("scope");
  const categoryId = formData.get("categoryId");
  const clientFeePct = formData.get("clientFeePct");
  const expertFeePct = formData.get("expertFeePct");

  if (scope !== "global" && scope !== "category" && scope !== "promotional") {
    return { error: "Invalid scope" };
  }

  try {
    await createCommissionRule(user.id, {
      scope,
      categoryId: typeof categoryId === "string" && categoryId ? categoryId : undefined,
      clientFeePct: clientFeePct ? Number(clientFeePct) : 0,
      expertFeePct: expertFeePct ? Number(expertFeePct) : 0,
    });
  } catch (err) {
    return { error: err instanceof CommissionServiceError ? err.message : "Failed to create rule" };
  }

  revalidatePath("/admin/commission");
  return {};
}

export async function deactivateCommissionRuleAction(formData: FormData): Promise<void> {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("Not signed in");

  const ruleId = formData.get("ruleId");
  if (typeof ruleId !== "string") throw new Error("Missing rule id");

  await deactivateCommissionRule(user.id, ruleId);
  revalidatePath("/admin/commission");
}
