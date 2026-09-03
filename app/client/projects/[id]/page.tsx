import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentAppUser } from "@/lib/services/auth";
import { getById, ProjectServiceError } from "@/lib/services/projects";
import { listRoster } from "@/lib/services/teams";
import { InviteExpertForm } from "./InviteExpertForm";

function formatINR(n: number | null) {
  if (n == null) return "—";
  return "₹" + n.toLocaleString("en-IN");
}

const STATUS_META: Record<string, string> = {
  invited: "#C97F1E",
  active: "#3B8365",
  declined: "#9AA0AF",
  removed: "#9AA0AF",
};

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");

  let project;
  try {
    project = await getById(user.id, id);
  } catch (err) {
    if (err instanceof ProjectServiceError) notFound();
    throw err;
  }

  const roster = await listRoster(user.id, id);

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 640 }}>
      <Link href="/client/dashboard" style={{ fontSize: 13, color: "#9AA0AF", textDecoration: "none" }}>← Back to dashboard</Link>
      <div style={{ fontSize: 11, textTransform: "uppercase", color: "#3454D1", margin: "16px 0 6px" }}>{project.status}</div>
      <h1 style={{ margin: 0 }}>{project.title}</h1>
      <p style={{ color: "#5B6172", marginTop: 8 }}>{project.description}</p>
      <div style={{ fontFamily: "monospace", fontSize: 13, marginTop: 16 }}>
        {formatINR(project.budget_min)} – {formatINR(project.budget_max)}
        {project.deadline ? ` · due ${project.deadline}` : ""}
      </div>

      <h2 style={{ fontSize: 15, marginTop: 32, marginBottom: 8 }}>Team ({roster.length})</h2>
      {roster.length === 0 ? (
        <p style={{ color: "#9AA0AF", fontSize: 13 }}>No one invited yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {roster.map((m) => {
            // @ts-expect-error — joined-table typing gap, closes once generated types are wired in
            const expertEmail = m.expert_profiles?.users?.email ?? "unknown";
            // @ts-expect-error — see above
            const headline = m.expert_profiles?.headline ?? "";
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #E2E4EA", borderRadius: 12, padding: "12px 16px" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{expertEmail} {m.is_lead && <span style={{ fontSize: 10, color: "#3454D1" }}>· LEAD</span>}</div>
                  <div style={{ fontSize: 12, color: "#5B6172" }}>{headline || m.responsibilities}</div>
                </div>
                <span style={{ fontSize: 11, textTransform: "uppercase", color: STATUS_META[m.status] ?? "#9AA0AF" }}>{m.status}</span>
              </div>
            );
          })}
        </div>
      )}

      <InviteExpertForm projectId={id} />

      <p style={{ marginTop: 24, fontSize: 12, color: "#9AA0AF" }}>
        Reads and writes on this page all pass through <code>AuthzService.can()</code> —
        the roster query is gated by <code>team:view_roster</code>, invitations by{" "}
        <code>team:invite_expert</code>. Tasks, milestones, chat, and payments from the
        Project Room mockup are the next things to port here.
      </p>
    </main>
  );
}
