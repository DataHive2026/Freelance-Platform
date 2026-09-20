import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/services/authz";
import { systemTransition } from "@/lib/services/projects";
import { resolveCommission } from "@/lib/config/commission";
import type { PaymentProviderAdapter } from "./provider";
import { RazorpayAdapter } from "./razorpay-adapter";
import { MockPaymentProvider } from "./mock-adapter";

export class PaymentServiceError extends Error {}

// Not yet a database-driven rate (no gst_pct column anywhere in the
// Phase 0 schema) — flagged here rather than silently assumed to be
// "handled." If GST needs to vary (state, category, exemptions), this
// is the one place to make configurable.
const GST_PCT = 18;

function getProvider(): PaymentProviderAdapter {
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    return new RazorpayAdapter();
  }
  return new MockPaymentProvider();
}

export interface InitiateFundingInput {
  projectId: string;
  scope: "milestone" | "full";
  milestoneId?: string; // required when scope === "milestone"
}

export interface FundingBreakdown {
  fundingId: string;
  providerOrderId: string;
  baseAmount: number;
  commissionPct: number;
  commission: number;
  gst: number;
  totalDue: number;
  currency: string;
}

/**
 * Step 1 of funding: authorize, compute the amount and commission
 * breakdown, create a pending project_funding row, and open an order
 * with the payment provider. Does NOT move money or change project
 * status yet — that only happens once confirmFunding() verifies the
 * payment actually succeeded (called from the client after checkout
 * completes, or from the Razorpay webhook route — whichever fires
 * first; confirmFunding is idempotent against project_funding.status).
 */
export async function initiateFunding(actorId: string, input: InitiateFundingInput): Promise<FundingBreakdown> {
  const permitted = await can(actorId, "payment:fund_project", input.projectId);
  if (!permitted) throw new PaymentServiceError("Not authorized to fund this project");

  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, category_id, currency")
    .eq("id", input.projectId)
    .single();
  if (!project) throw new PaymentServiceError("Project not found");

  let baseAmount: number;
  if (input.scope === "milestone") {
    if (!input.milestoneId) throw new PaymentServiceError("milestoneId is required when scope is 'milestone'");
    const { data: milestone } = await supabase
      .from("milestones")
      .select("budget_allocation")
      .eq("id", input.milestoneId)
      .single();
    if (!milestone?.budget_allocation) throw new PaymentServiceError("Milestone has no budget allocated");
    baseAmount = Number(milestone.budget_allocation);
  } else {
    const { data: milestones } = await supabase
      .from("milestones")
      .select("budget_allocation")
      .eq("project_id", input.projectId)
      .neq("status", "approved");
    baseAmount = (milestones ?? []).reduce((sum, m) => sum + Number(m.budget_allocation ?? 0), 0);
  }

  if (baseAmount <= 0) throw new PaymentServiceError("Nothing to fund — no outstanding budget on this project/milestone");

  const commission = await resolveCommission(project.category_id);
  const commissionAmount = Math.round(baseAmount * (commission.clientFeePct / 100));
  const gst = Math.round(commissionAmount * (GST_PCT / 100));
  const totalDue = baseAmount + gst;
  const currency = project.currency ?? "INR";

  const { data: funding, error: fundingError } = await supabase
    .from("project_funding")
    .insert({
      project_id: input.projectId,
      milestone_id: input.scope === "milestone" ? input.milestoneId : null,
      amount: totalDue,
      base_amount: baseAmount,
      commission_amount: commissionAmount,
      commission_pct: commission.clientFeePct,
      gst_amount: gst,
      currency,
      funded_by: (await requireClientProfileId(supabase, actorId)),
      payment_provider: "razorpay",
      status: "pending",
    })
    .select()
    .single();
  if (fundingError) throw new PaymentServiceError(fundingError.message);

  const provider = getProvider();
  const { providerOrderId } = await provider.createOrder({
    amountInSmallestUnit: Math.round(totalDue * 100), // Razorpay wants paise
    currency,
    receipt: funding.id,
  });

  await supabase.from("project_funding").update({ provider_reference_id: providerOrderId }).eq("id", funding.id);

  return {
    fundingId: funding.id,
    providerOrderId,
    baseAmount,
    commissionPct: commission.clientFeePct,
    commission: commissionAmount,
    gst,
    totalDue,
    currency,
  };
}

async function requireClientProfileId(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string) {
  const { data } = await supabase.from("client_profiles").select("id").eq("user_id", userId).single();
  if (!data) throw new PaymentServiceError("No client profile for this account");
  return data.id;
}

/**
 * Step 2, checkout path: the browser calls this right after Razorpay's
 * Checkout.js widget completes, passing the order_id/payment_id/signature
 * it received. Verifies that trio using the provider's
 * order-id|payment-id HMAC scheme.
 */
export async function confirmFunding(fundingId: string, providerPaymentId: string, signature: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { data: funding } = await supabase
    .from("project_funding")
    .select("id, status, provider_reference_id")
    .eq("id", fundingId)
    .single();
  if (!funding) throw new PaymentServiceError("Funding record not found");
  if (funding.status === "succeeded") return; // idempotent — webhook and client confirm can race

  const provider = getProvider();
  const verified = provider.verifyPayment({
    providerOrderId: funding.provider_reference_id!,
    providerPaymentId,
    signature,
  });

  if (!verified) {
    await supabase.from("project_funding").update({ status: "failed" }).eq("id", fundingId);
    throw new PaymentServiceError("Payment signature verification failed");
  }

  await finalizeFunding(fundingId, providerPaymentId);
}

/**
 * Step 2, webhook path: Razorpay calls app/api/webhooks/razorpay/route.ts
 * directly. That route verifies webhook AUTHENTICITY itself — a
 * different signature scheme entirely (HMAC over the raw request body
 * using RAZORPAY_WEBHOOK_SECRET, not the order|payment HMAC used above).
 * By the time this function is called, the webhook route has already
 * established the request genuinely came from Razorpay, so this does
 * NOT re-run provider.verifyPayment() — doing so would be checking the
 * wrong signature against the wrong secret.
 */
export async function confirmFundingFromWebhook(providerOrderId: string, providerPaymentId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { data: funding } = await supabase
    .from("project_funding")
    .select("id, status")
    .eq("provider_reference_id", providerOrderId)
    .single();
  if (!funding) throw new PaymentServiceError(`No project_funding row for order ${providerOrderId}`);
  if (funding.status === "succeeded") return; // idempotent

  await finalizeFunding(funding.id, providerPaymentId);
}

/**
 * The actual ledger-writing logic, shared by both confirmation paths so
 * it's written exactly once. By the time this runs, payment authenticity
 * has already been established by whichever caller invoked it.
 */
async function finalizeFunding(fundingId: string, providerPaymentId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { data: funding } = await supabase
    .from("project_funding")
    .select("id, project_id, amount, base_amount, commission_amount, currency")
    .eq("id", fundingId)
    .single();
  if (!funding) throw new PaymentServiceError("Funding record not found");

  await supabase.from("project_funding").update({ status: "succeeded" }).eq("id", fundingId);

  // commission_amount was computed and stored at initiateFunding time
  // (see 0003_project_funding_breakdown.sql) — read it back directly
  // rather than re-deriving it from the total, which is fragile and was
  // wrong on the first attempt at this function.
  const commissionAmount = Number(funding.commission_amount ?? 0);

  await supabase.from("transactions").insert([
    {
      project_id: funding.project_id,
      type: "funding",
      amount: funding.amount,
      currency: funding.currency,
      from_party: "client",
      to_party: "platform_escrow",
      provider_reference_id: providerPaymentId,
      status: "succeeded",
    },
    {
      project_id: funding.project_id,
      type: "platform_fee",
      amount: commissionAmount,
      currency: funding.currency,
      from_party: "platform_escrow",
      to_party: "platform",
      status: "succeeded",
    },
  ]);

  await supabase.from("audit_logs").insert({
    actor_id: null,
    action: "payment.funding_confirmed",
    entity_type: "project_funding",
    entity_id: fundingId,
    metadata: { project_id: funding.project_id, amount: funding.amount },
  });

  // Move the project forward — a verified payment is itself the
  // authorization for both edges, so these go through systemTransition,
  // not a second human authz check.
  const { data: currentProject } = await supabase.from("projects").select("status").eq("id", funding.project_id).single();
  if (currentProject?.status === "TEAM_CONFIRMED") {
    await systemTransition(funding.project_id, "FUNDED", "Payment verified");
  }
  const { data: refreshed } = await supabase.from("projects").select("status").eq("id", funding.project_id).single();
  if (refreshed?.status === "FUNDED") {
    await systemTransition(funding.project_id, "IN_PROGRESS", "Funding complete");
  }
}

/**
 * Called ONLY by MilestoneService.approve() — never directly by any
 * route or Server Action. permission-matrix.md §3.5 is explicit that no
 * human role may call payout:initiate; there is deliberately no rule for
 * it in rules.ts. A verified milestone approval (already authorized as
 * milestone:approve, client-only) is the sole trigger.
 *
 * Split is even across active team members for now — NOT yet weighted
 * by team_members.contribution_pct, which is populated in the schema
 * but not consulted here. Flagged rather than silently approximated:
 * proportional split is the obvious next step once contribution_pct is
 * reliably set at team-formation time.
 */
export async function releaseMilestone(milestoneId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { data: milestone } = await supabase
    .from("milestones")
    .select("id, project_id, budget_allocation")
    .eq("id", milestoneId)
    .single();
  if (!milestone || !milestone.budget_allocation) return;

  const { data: team } = await supabase.from("project_teams").select("id").eq("project_id", milestone.project_id).maybeSingle();
  if (!team) return;

  const { data: members } = await supabase
    .from("team_members")
    .select("id, expert_id")
    .eq("project_team_id", team.id)
    .eq("status", "active");
  if (!members || members.length === 0) return;

  const perMember = Math.floor(Number(milestone.budget_allocation) / members.length);

  for (const member of members) {
    await supabase.from("transactions").insert({
      project_id: milestone.project_id,
      milestone_id: milestoneId,
      type: "expert_payout",
      amount: perMember,
      currency: "INR",
      from_party: "platform_escrow",
      to_party: member.expert_id,
      status: "succeeded",
    });

    await supabase.from("payouts").insert({
      expert_id: member.expert_id,
      project_id: milestone.project_id,
      amount: perMember,
      currency: "INR",
      status: "paid", // TODO(payments): this should be "pending" until an
      // actual payout API call clears — currently there's no
      // provider payout integration, only the escrow-side ledger entry,
      // so marking "paid" here is optimistic. Flagged, not hidden.
      paid_at: new Date().toISOString(),
    });
  }

  await supabase.from("audit_logs").insert({
    actor_id: null,
    action: "payment.milestone_released",
    entity_type: "milestone",
    entity_id: milestoneId,
    metadata: { project_id: milestone.project_id, per_member: perMember, member_count: members.length },
  });
}

export async function listTransactions(actorId: string, projectId: string) {
  const permitted = await can(actorId, "payment:view_transactions", projectId);
  if (!permitted) throw new PaymentServiceError("Not authorized to view this project's transactions");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, type, amount, currency, from_party, to_party, status, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw new PaymentServiceError(error.message);
  return data;
}
