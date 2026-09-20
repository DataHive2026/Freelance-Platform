"use client";

import { useActionState } from "react";
import { suspendUserAction, restoreUserAction, type UserActionState } from "./actions";

export function UserRow({
  id, email, userType, status, displayName,
}: { id: string; email: string; userType: string; status: string; displayName: string }) {
  const [state, formAction, pending] = useActionState<UserActionState, FormData>(suspendUserAction, {});

  return (
    <div style={{ borderBottom: "1px solid #E2E4EA", padding: "12px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{displayName}</div>
          <div style={{ fontSize: 12, color: "#5B6172" }}>{email} · {userType}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 10, textTransform: "uppercase", color: status === "active" ? "#3B8365" : status === "suspended" ? "#B4432F" : "#9AA0AF" }}>
            {status}
          </span>
          {status === "active" && userType !== "admin" && (
            <form action={formAction}>
              <input type="hidden" name="targetUserId" value={id} />
              <button type="submit" disabled={pending} style={{ fontSize: 12, color: "#B4432F", background: "none", border: "none", cursor: "pointer" }}>
                Suspend
              </button>
            </form>
          )}
          {status === "suspended" && (
            <form action={restoreUserAction}>
              <input type="hidden" name="targetUserId" value={id} />
              <button type="submit" style={{ fontSize: 12, color: "#3B8365", background: "none", border: "none", cursor: "pointer" }}>
                Restore
              </button>
            </form>
          )}
        </div>
      </div>
      {state.error && <div style={{ color: "#B4432F", fontSize: 12, marginTop: 4 }}>{state.error}</div>}
    </div>
  );
}
