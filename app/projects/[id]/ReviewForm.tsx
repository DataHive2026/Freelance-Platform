"use client";

import { Fragment } from "react";
import { useActionState } from "react";
import { submitReviewAction, type SubmitReviewState } from "./actions";

const DIMENSIONS = [
  { key: "qualityRating", label: "Quality" },
  { key: "communicationRating", label: "Communication" },
  { key: "reliabilityRating", label: "Reliability" },
  { key: "technicalRating", label: "Technical expertise" },
  { key: "collaborationRating", label: "Collaboration" },
  { key: "timelinessRating", label: "Timeliness" },
];

export function ReviewForm({ projectId, revieweeUserId, revieweeName }: { projectId: string; revieweeUserId: string; revieweeName: string }) {
  const [state, formAction, pending] = useActionState<SubmitReviewState, FormData>(submitReviewAction, {});

  if (state.success) {
    return <p style={{ fontSize: 12, color: "#3B8365", marginTop: 6 }}>Review submitted for {revieweeName}.</p>;
  }

  return (
    <details style={{ marginTop: 8, border: "1px solid #E2E4EA", borderRadius: 10, padding: 12 }}>
      <summary style={{ cursor: "pointer", fontSize: 13, color: "#3454D1" }}>Leave a review for {revieweeName}</summary>
      <form action={formAction} style={{ marginTop: 10 }}>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="revieweeUserId" value={revieweeUserId} />
        {state.error && <div style={{ color: "#B4432F", fontSize: 12, marginBottom: 8 }}>{state.error}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 12px", marginBottom: 10, alignItems: "center" }}>
          {DIMENSIONS.map((d) => (
            <Fragment key={d.key}>
              <label style={{ fontSize: 12, color: "#5B6172" }}>{d.label}</label>
              <select name={d.key} defaultValue="5" required style={{ fontSize: 12, padding: "4px 6px", borderRadius: 6, border: "1px solid #E2E4EA" }}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Fragment>
          ))}
        </div>

        <textarea
          name="comment"
          placeholder="Optional comment..."
          rows={2}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13, marginBottom: 8, resize: "vertical" }}
        />
        <button
          type="submit"
          disabled={pending}
          style={{ background: "#3454D1", color: "white", padding: "8px 14px", borderRadius: 8, border: "none", fontSize: 13 }}
        >
          {pending ? "Submitting..." : "Submit review"}
        </button>
      </form>
    </details>
  );
}
