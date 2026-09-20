"use client";

import { useActionState } from "react";
import { inviteExpertAction, type InviteExpertState } from "./actions";

const initialState: InviteExpertState = {};

export function InviteExpertForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(inviteExpertAction, initialState);

  return (
    <form action={formAction} style={{ border: "1px solid #E2E4EA", borderRadius: 16, padding: 20, marginTop: 16 }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", color: "#9AA0AF", marginBottom: 10 }}>Invite an expert</div>
      <input type="hidden" name="projectId" value={projectId} />

      {state.error && (
        <div style={{ background: "#FBEAE6", color: "#B4432F", padding: "8px 12px", borderRadius: 8, marginBottom: 10, fontSize: 13 }}>
          {state.error}
        </div>
      )}
      {state.success && (
        <div style={{ background: "#E9F5EF", color: "#3B8365", padding: "8px 12px", borderRadius: 8, marginBottom: 10, fontSize: 13 }}>
          Invitation sent.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          name="expertEmail"
          type="email"
          placeholder="expert@email.com"
          required
          style={{ flex: 2, padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13 }}
        />
        <input
          name="roleTitle"
          placeholder="Role (e.g. Statistician)"
          style={{ flex: 2, padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13 }}
        />
        <input
          name="compensation"
          type="number"
          placeholder="₹ compensation"
          style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13, fontFamily: "monospace" }}
        />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5B6172", marginBottom: 10 }}>
        <input type="checkbox" name="isLead" /> Invite as project lead
      </label>
      <button
        type="submit"
        disabled={pending}
        style={{ background: "#3454D1", color: "white", padding: "8px 16px", borderRadius: 8, border: "none", fontSize: 13 }}
      >
        {pending ? "Sending..." : "Send invitation"}
      </button>
      <p style={{ fontSize: 11, color: "#9AA0AF", marginTop: 8 }}>
        Looks up an existing expert account by email — full directory search comes later.
      </p>
    </form>
  );
}
