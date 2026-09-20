import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/services/authz";

export class CommissionServiceError extends Error {}

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

export async function listCommissionRules(actorId: string) {
  const permitted = await can(actorId, "admin:manage_commission_rules");
  if (!permitted) throw new CommissionServiceError("Not authorized to view commission rules");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("commission_rules")
    .select("id, scope, category_id, client_fee_pct, expert_fee_pct, effective_from, effective_to, categories(name)")
    .order("effective_from", { ascending: false });

  if (error) throw new CommissionServiceError(error.message);
  return data;
}

export interface CreateCommissionRuleInput {
  scope: "global" | "category" | "promotional";
  categoryId?: string; // required when scope === "category"
  clientFeePct: number;
  expertFeePct: number;
  effectiveTo?: string; // ISO date — open-ended if omitted
}

/**
 * New rules are ADDED, not edited in place — commission_rules is meant
 * to preserve history (every past rate a project might have been
 * funded under), matching the append-only philosophy already used for
 * `transactions`. "Changing" a rate means adding a new row with a fresh
 * effective_from; resolveCommission() always picks the currently-active
 * one by date range and precedence.
 */
export async function createCommissionRule(actorId: string, input: CreateCommissionRuleInput) {
  const permitted = await can(actorId, "admin:manage_commission_rules");
  if (!permitted) throw new CommissionServiceError("Not authorized to manage commission rules");
  if (input.scope === "category" && !input.categoryId) {
    throw new CommissionServiceError("categoryId is required for a category-scoped rule");
  }
  if (input.clientFeePct < 0 || input.clientFeePct > 100 || input.expertFeePct < 0 || input.expertFeePct > 100) {
    throw new CommissionServiceError("Fees must be between 0 and 100");
  }

  const supabase = await createSupabaseServerClient();

  // A new rule of a given scope+category supersedes the previous one —
  // close out any currently open-ended rule in the same scope so
  // resolveCommission()'s date-range filter doesn't see two active
  // candidates at once and pick one arbitrarily.
  let supersedeQuery = supabase
    .from("commission_rules")
    .update({ effective_to: new Date().toISOString() })
    .eq("scope", input.scope)
    .is("effective_to", null);
  supersedeQuery = input.categoryId ? supersedeQuery.eq("category_id", input.categoryId) : supersedeQuery.is("category_id", null);
  await supersedeQuery;

  const { data, error } = await supabase
    .from("commission_rules")
    .insert({
      scope: input.scope,
      category_id: input.categoryId,
      client_fee_pct: input.clientFeePct,
      expert_fee_pct: input.expertFeePct,
      effective_to: input.effectiveTo,
      created_by_admin_id: actorId,
    })
    .select()
    .single();
  if (error) throw new CommissionServiceError(error.message);

  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action: "commission_rule.created",
    entity_type: "commission_rule",
    entity_id: data.id,
    metadata: { scope: input.scope, client_fee_pct: input.clientFeePct },
  });

  return data;
}

export async function deactivateCommissionRule(actorId: string, ruleId: string) {
  const permitted = await can(actorId, "admin:manage_commission_rules");
  if (!permitted) throw new CommissionServiceError("Not authorized to manage commission rules");

  const supabase = await createSupabaseServerClient();

  // The global scope must always have a live rule — resolveCommission()
  // throws if none is found, which would break funding platform-wide.
  const { data: rule } = await supabase.from("commission_rules").select("scope").eq("id", ruleId).single();
  if (rule?.scope === "global") {
    const { count } = await supabase
      .from("commission_rules")
      .select("id", { count: "exact", head: true })
      .eq("scope", "global")
      .is("effective_to", null)
      .neq("id", ruleId);
    if (!count) {
      throw new CommissionServiceError("Can't deactivate the only active global rule — create a replacement first.");
    }
  }

  const { error } = await supabase.from("commission_rules").update({ effective_to: new Date().toISOString() }).eq("id", ruleId);
  if (error) throw new CommissionServiceError(error.message);
}
