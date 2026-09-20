"use client";

import { useActionState } from "react";
import Link from "next/link";
import { openDisputeAction, type OpenDisputeState } from "./actions";

export function OpenDisputeForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState<OpenDisputeState, FormData>(openDisputeAction, {});

  if (state.disputeId) {
    return (
      <p style={{ fontSize: 13, color: "#B4432F", marginTop: 8 }}>
        Dispute opened. <Link href={`/admin/disputes/${state.disputeId}`} style={{ color: "#3454D1" }}>View it →</Link>
      </p>
    );
  }

  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: "pointer", fontSize: 13, color: "#B4432F" }}>Something's wrong — open a dispute</summary>
      <form action={formAction} style={{ marginTop: 8, padding: 12, background: "#FBEAE6", borderRadius: 10 }}>
        <input type="hidden" name="projectId" value={projectId} />
        {state.error && <div style={{ color: "#B4432F", fontSize: 12, marginBottom: 6 }}>{state.error}</div>}
        <textarea
          name="reason"
          placeholder="What happened?"
          required
          rows={2}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13, marginBottom: 8, resize: "vertical" }}
        />
        <button
          type="submit"
          disabled={pending}
          style={{ background: "#B4432F", color: "white", padding: "8px 14px", borderRadius: 8, border: "none", fontSize: 13 }}
        >
          {pending ? "Opening..." : "Open dispute"}
        </button>
      </form>
    </details>
  );
}
