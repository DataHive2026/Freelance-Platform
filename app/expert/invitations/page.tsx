import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAppUser } from "@/lib/services/auth";
import { listMyInvitations } from "@/lib/services/teams";
import { acceptInvitationAction, declineInvitationAction } from "./actions";

function formatINR(n: number | null) {
  if (n == null) return "—";
  return "₹" + n.toLocaleString("en-IN");
}

export default async function InvitationsPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (user.user_type !== "expert") redirect("/login");

  const invitations = await listMyInvitations(user.id);

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 640 }}>
      <Link href="/expert/dashboard" style={{ fontSize: 13, color: "#9AA0AF", textDecoration: "none" }}>← Back to dashboard</Link>
      <h1 style={{ marginTop: 12 }}>Team invitations</h1>
      <p style={{ color: "#5B6172" }}>Clients and leads can invite you directly to a role — no application needed.</p>

      {invitations.length === 0 ? (
        <p style={{ color: "#9AA0AF" }}>No invitations yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
          {invitations.map((inv) => {
            // @ts-expect-error — joined-table typing gap, same as authz/index.ts; generated types close this
            const projectTitle = inv.project_teams?.projects?.title ?? "Untitled project";
            // @ts-expect-error — see above
            const clientName = inv.project_teams?.projects?.client_profiles?.company_name ?? "Unknown client";

            return (
              <div key={inv.id} style={{ border: "1px solid #E2E4EA", borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", color: inv.status === "invited" ? "#C97F1E" : "#3B8365", marginBottom: 6 }}>
                  {inv.status}
                </div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{projectTitle}</div>
                <div style={{ fontSize: 13, color: "#5B6172", margin: "4px 0 12px" }}>
                  {clientName} · {inv.is_lead ? "Lead role" : "Team member"} · {formatINR(inv.compensation_amount)}
                </div>

                {inv.status === "invited" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <form action={acceptInvitationAction}>
                      <input type="hidden" name="teamMemberId" value={inv.id} />
                      <button type="submit" style={{ background: "#3B8365", color: "white", padding: "8px 16px", borderRadius: 8, border: "none", fontSize: 13 }}>
                        Accept
                      </button>
                    </form>
                    <form action={declineInvitationAction}>
                      <input type="hidden" name="teamMemberId" value={inv.id} />
                      <button type="submit" style={{ background: "#F2F3F6", color: "#5B6172", padding: "8px 16px", borderRadius: 8, border: "none", fontSize: 13 }}>
                        Decline
                      </button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
