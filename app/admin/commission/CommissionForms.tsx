"use client";

import { useActionState, useState } from "react";
import { createCommissionRuleAction, deactivateCommissionRuleAction, type CommissionActionState } from "./actions";

export function CreateRuleForm({ categories }: { categories: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<CommissionActionState, FormData>(createCommissionRuleAction, {});
  const [scope, setScope] = useState("global");

  return (
    <form action={formAction} style={{ padding: 14, background: "#F2F3F6", borderRadius: 10, marginBottom: 20 }}>
      {state.error && <div style={{ color: "#B4432F", fontSize: 12, marginBottom: 8 }}>{state.error}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <select
          name="scope"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13 }}
        >
          <option value="global">Global (applies everywhere by default)</option>
          <option value="category">Category-specific</option>
          <option value="promotional">Promotional (overrides everything)</option>
        </select>
        {scope === "category" && (
          <select name="categoryId" required style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13 }}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <label style={{ flex: 1, fontSize: 12, color: "#5B6172" }}>
          Client fee %
          <input name="clientFeePct" type="number" step="0.1" min="0" max="100" defaultValue="10" required style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13, marginTop: 4 }} />
        </label>
        <label style={{ flex: 1, fontSize: 12, color: "#5B6172" }}>
          Expert fee %
          <input name="expertFeePct" type="number" step="0.1" min="0" max="100" defaultValue="0" required style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13, marginTop: 4 }} />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        style={{ background: "#3454D1", color: "white", padding: "8px 16px", borderRadius: 8, border: "none", fontSize: 13 }}
      >
        {pending ? "Creating..." : "Create rule"}
      </button>
      <p style={{ fontSize: 11, color: "#9AA0AF", marginTop: 6 }}>
        Creating a rule automatically closes out any existing open-ended rule in the same scope — history is preserved, not overwritten.
      </p>
    </form>
  );
}

export function DeactivateButton({ ruleId }: { ruleId: string }) {
  return (
    <form action={deactivateCommissionRuleAction}>
      <input type="hidden" name="ruleId" value={ruleId} />
      <button type="submit" style={{ fontSize: 12, color: "#B4432F", background: "none", border: "none", cursor: "pointer" }}>
        Deactivate
      </button>
    </form>
  );
}
