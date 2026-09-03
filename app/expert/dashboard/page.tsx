import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAppUser, signOut } from "@/lib/services/auth";
import { getMyExpertProfile } from "@/lib/services/profiles";
import { listMyInvitations } from "@/lib/services/teams";

export default async function ExpertDashboardPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (user.user_type !== "expert") redirect("/login");

  const profile = await getMyExpertProfile(user.id);
  const invitations = await listMyInvitations(user.id);
  const pendingCount = invitations.filter((i) => i.status === "invited").length;

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 720 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0 }}>{profile.headline}</h1>
          <p style={{ color: "#5B6172", margin: "4px 0 0" }}>{user.email}</p>
        </div>
        <form action={async () => { "use server"; await signOut(); redirect("/login"); }}>
          <button type="submit" style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #E2E4EA", background: "white" }}>Sign out</button>
        </form>
      </div>

      <Link
        href="/expert/invitations"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #E2E4EA", borderRadius: 16, padding: 20, textDecoration: "none", color: "inherit" }}
      >
        <div>
          <div style={{ fontWeight: 600 }}>Team invitations</div>
          <div style={{ fontSize: 13, color: "#5B6172" }}>Clients and leads can invite you directly to a role.</div>
        </div>
        {pendingCount > 0 && (
          <span style={{ background: "#FBF0DD", color: "#C97F1E", borderRadius: 999, padding: "4px 10px", fontSize: 12, fontFamily: "monospace" }}>
            {pendingCount} pending
          </span>
        )}
      </Link>
    </main>
  );
}
