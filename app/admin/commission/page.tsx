import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAppUser } from "@/lib/services/auth";
import { listCommissionRules } from "@/lib/config/commission";
import { listCategories } from "@/lib/services/categories";
import { CreateRuleForm, DeactivateButton } from "./CommissionForms";

export default async function AdminCommissionPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (user.user_type !== "admin") redirect("/login");

  const [rules, categories] = await Promise.all([listCommissionRules(user.id), listCategories()]);
  const active = rules.filter((r) => !r.effective_to || new Date(r.effective_to) > new Date());
  const past = rules.filter((r) => r.effective_to && new Date(r.effective_to) <= new Date());

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 640 }}>
      <Link href="/admin/dashboard" style={{ fontSize: 13, color: "#9AA0AF", textDecoration: "none" }}>← Back to admin</Link>
      <h1 style={{ marginTop: 12 }}>Commission rules</h1>
      <p style={{ color: "#5B6172", marginBottom: 20 }}>
        Precedence at funding time: promotional &gt; category &gt; global. New rules don&apos;t overwrite old ones — they supersede them, and history stays queryable.
      </p>

      <CreateRuleForm categories={categories.filter((c) => c.is_active)} />

      <h2 style={{ fontSize: 15, marginBottom: 8 }}>Active</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
        {active.length === 0 && <p style={{ color: "#9AA0AF", fontSize: 13 }}>No active rules — funding will fail until at least the global rule exists.</p>}
        {active.map((r) => (
          <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #E2E4EA", borderRadius: 10, padding: 12 }}>
            <div>
              <span style={{ fontSize: 10, textTransform: "uppercase", color: "#3454D1" }}>{r.scope}</span>
              {/* @ts-expect-error — joined-table typing gap, closes once generated types are wired in */}
              {r.categories?.name && <span style={{ fontSize: 12, color: "#5B6172", marginLeft: 6 }}>{r.categories.name}</span>}
              <div style={{ fontSize: 13, fontFamily: "monospace", marginTop: 2 }}>
                Client {r.client_fee_pct}% · Expert {r.expert_fee_pct}%
              </div>
            </div>
            <DeactivateButton ruleId={r.id} />
          </div>
        ))}
      </div>

      {past.length > 0 && (
        <>
          <h2 style={{ fontSize: 15, marginBottom: 8 }}>History</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {past.map((r) => (
              <div key={r.id} style={{ fontSize: 12, color: "#9AA0AF", padding: "8px 12px", borderBottom: "1px solid #E2E4EA" }}>
                {r.scope} · Client {r.client_fee_pct}% · Expert {r.expert_fee_pct}% · ended {new Date(r.effective_to!).toLocaleDateString()}
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
