"use client";

import { useActionState } from "react";
import { applyAction, type ApplyState } from "./actions";

export function ApplyForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState<ApplyState, FormData>(applyAction, {});

  if (state.success) {
    return <p style={{ fontSize: 12, color: "#3B8365", marginTop: 8 }}>Applied — see your proposal status under My Proposals.</p>;
  }

  return (
    <form action={formAction} style={{ marginTop: 10, padding: 12, background: "#F2F3F6", borderRadius: 10 }}>
      <input type="hidden" name="projectId" value={projectId} />
      {state.error && <div style={{ color: "#B4432F", fontSize: 12, marginBottom: 6 }}>{state.error}</div>}
      <textarea
        name="coverLetter"
        placeholder="Cover letter — why you're a fit for this project..."
        rows={3}
        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13, marginBottom: 6, resize: "vertical" }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <input
          name="proposedRate"
          type="number"
          placeholder="Proposed rate (₹)"
          style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13, fontFamily: "monospace" }}
        />
        <button
          type="submit"
          disabled={pending}
          style={{ background: "#3454D1", color: "white", padding: "8px 16px", borderRadius: 8, border: "none", fontSize: 13 }}
        >
          {pending ? "Submitting..." : "Submit application"}
        </button>
      </div>
    </form>
  );
}
