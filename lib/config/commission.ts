import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ResolvedCommission {
  clientFeePct: number;
  expertFeePct: number;
  ruleId: string;
}

/**
 * Resolves the applicable commission_rules row for a project at the
 * moment it's funded. Precedence: promotional > category > global.
 * This is the ONLY place commission percentages are read from — never
 * hardcode a rate in a service, component, or webhook handler.
 */
export async function resolveCommission(categoryId: string | null): Promise<ResolvedCommission> {
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();

  const { data: rules } = await supabase
    .from("commission_rules")
    .select("*")
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gte.${now}`);

  if (!rules || rules.length === 0) {
    // Should never happen — 0001_init.sql seeds a global default row.
    throw new Error("No commission rule found — check that the global default row exists.");
  }

  const promo = rules.find((r) => r.scope === "promotional");
  const category = categoryId ? rules.find((r) => r.scope === "category" && r.category_id === categoryId) : null;
  const global = rules.find((r) => r.scope === "global");

  const chosen = promo ?? category ?? global ?? rules[0];

  return {
    clientFeePct: Number(chosen.client_fee_pct),
    expertFeePct: Number(chosen.expert_fee_pct),
    ruleId: chosen.id,
  };
}
