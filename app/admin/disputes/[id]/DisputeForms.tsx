"use client";

import { useActionState } from "react";
import { submitEvidenceAction, resolveDisputeAction, type DisputeActionState } from "./actions";

export function EvidenceForm({ disputeId }: { disputeId: string }) {
  const [state, formAction, pending] = useActionState<DisputeActionState, FormData>(submitEvidenceAction, {});

  return (
    <form action={formAction} style={{ marginTop: 10 }}>
      <input type="hidden" name="disputeId" value={disputeId} />
      {state.error && <div style={{ color: "#B4432F", fontSize: 12, marginBottom: 6 }}>{state.error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          name="message"
          placeholder="Add a message or piece of evidence..."
          style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13 }}
        />
        <button
          type="submit"
          disabled={pending}
          style={{ background: "#3454D1", color: "white", padding: "8px 14px", borderRadius: 8, border: "none", fontSize: 13 }}
        >
          {pending ? "Sending..." : "Send"}
        </button>
      </div>
    </form>
  );
}

export function ResolveForm({ disputeId }: { disputeId: string }) {
  const [state, formAction, pending] = useActionState<DisputeActionState, FormData>(resolveDisputeAction, {});

  if (state.success) {
    return <p style={{ fontSize: 13, color: "#3B8365", marginTop: 10 }}>Dispute resolved.</p>;
  }

  return (
    <form action={formAction} style={{ marginTop: 10, padding: 14, background: "#F2F3F6", borderRadius: 10 }}>
      <input type="hidden" name="disputeId" value={disputeId} />
      {state.error && <div style={{ color: "#B4432F", fontSize: 12, marginBottom: 6 }}>{state.error}</div>}
      <textarea
        name="resolution"
        placeholder="Explain the resolution — this is stored and visible to both parties."
        required
        rows={3}
        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13, marginBottom: 8, resize: "vertical" }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="submit"
          name="outcome"
          value="reopen"
          disabled={pending}
          style={{ background: "#3B8365", color: "white", padding: "8px 14px", borderRadius: 8, border: "none", fontSize: 13 }}
        >
          Resolve — reopen project
        </button>
        <button
          type="submit"
          name="outcome"
          value="cancel"
          disabled={pending}
          style={{ background: "#FBEAE6", color: "#B4432F", padding: "8px 14px", borderRadius: 8, border: "none", fontSize: 13 }}
        >
          Resolve — cancel project
        </button>
      </div>
    </form>
  );
}
