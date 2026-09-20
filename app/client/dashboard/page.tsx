import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAppUser, signOut } from "@/lib/services/auth";
import { getMyClientProfile } from "@/lib/services/profiles";
import { listForClient } from "@/lib/services/projects";
import { brand } from "@/lib/config/brand";

function formatINR(n: number | null) {
  if (n == null) return "—";
  return "₹" + n.toLocaleString("en-IN");
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  REVIEWING: "Reviewing",
  TEAM_FORMING: "Forming team",
  TEAM_CONFIRMED: "Team confirmed",
  FUNDED: "Funded",
  IN_PROGRESS: "In progress",
  MILESTONE_REVIEW: "Milestone review",
  DELIVERABLE_REVIEW: "Deliverable review",
  COMPLETED: "Completed",
  DISPUTED: "Disputed",
  CANCELLED: "Cancelled",
};

/**
 * Real data, not mock — this queries the actual `projects` table for the
 * signed-in client via ProjectService.listForClient(). This is the ported
 * version of client-dashboard.jsx from the design phase; local useState
 * for the project list is gone, replaced by a server-side fetch through
 * the service layer.
 */
export default async function ClientDashboardPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (user.user_type !== "client") redirect("/login");

  const profile = await getMyClientProfile(user.id);
  const projects = await listForClient(profile.id);

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 880 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0 }}>{profile.company_name}</h1>
          <p style={{ color: "#5B6172", margin: "4px 0 0" }}>{user.email} · {brand.name}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/client/projects/new" style={{ background: "#3454D1", color: "white", padding: "10px 16px", borderRadius: 8, textDecoration: "none", fontSize: 14 }}>
            + Post a project
          </Link>
          <form action={async () => { "use server"; await signOut(); redirect("/login"); }}>
            <button type="submit" style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #E2E4EA", background: "white" }}>Sign out</button>
          </form>
        </div>
      </div>

      <h2 style={{ fontSize: 16, color: "#5B6172", fontWeight: 500 }}>
        {projects.length} project{projects.length === 1 ? "" : "s"}
      </h2>

      {projects.length === 0 ? (
        <p style={{ color: "#9AA0AF" }}>No projects yet — post your first one above.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              style={{ display: "block", border: "1px solid #E2E4EA", borderRadius: 16, padding: 20, textDecoration: "none", color: "inherit" }}
            >
              <div style={{ fontSize: 11, textTransform: "uppercase", color: "#3454D1", marginBottom: 6 }}>
                {STATUS_LABEL[p.status] ?? p.status}
              </div>
              <div style={{ fontSize: 17, fontWeight: 600, color: "#14171F" }}>{p.title}</div>
              <div style={{ fontSize: 13, color: "#5B6172", margin: "6px 0" }}>{p.description}</div>
              <div style={{ fontSize: 13, fontFamily: "monospace", color: "#14171F" }}>
                {formatINR(p.budget_min)} – {formatINR(p.budget_max)}
                {p.deadline ? ` · due ${p.deadline}` : ""}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
