import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/services/auth";
import { listOpenProjects, listMine } from "@/lib/services/applications";
import { ApplyForm } from "./ApplyForm";

function formatINR(n: number | null) {
  if (n == null) return "—";
  return "₹" + n.toLocaleString("en-IN");
}

export default async function BrowseProjectsPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (user.user_type !== "expert") redirect("/login");

  const [projects, myApplications] = await Promise.all([listOpenProjects(), listMine(user.id)]);

  const appliedProjectIds = new Set(
    myApplications.filter((a) => a.status !== "withdrawn").map((a) =>
      // @ts-expect-error — joined-table typing gap, closes once generated types are wired in
      a.projects?.id
    )
  );

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 720 }}>
      <h1 style={{ margin: 0 }}>Browse projects</h1>
      <p style={{ color: "#5B6172", marginTop: 8 }}>Open projects looking for team members right now.</p>

      {projects.length === 0 ? (
        <p style={{ color: "#9AA0AF", marginTop: 20 }}>No open projects at the moment.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
          {projects.map((p) => (
            <div key={p.id} style={{ border: "1px solid #E2E4EA", borderRadius: 16, padding: 20 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", color: "#3454D1", marginBottom: 6 }}>{p.status}</div>
              <div style={{ fontSize: 17, fontWeight: 600 }}>{p.title}</div>
              <div style={{ fontSize: 13, color: "#5B6172", margin: "6px 0" }}>{p.description}</div>
              <div style={{ fontFamily: "monospace", fontSize: 13 }}>
                {formatINR(p.budget_min)} – {formatINR(p.budget_max)}
                {p.deadline ? ` · due ${p.deadline}` : ""}
              </div>

              {appliedProjectIds.has(p.id) ? (
                <p style={{ fontSize: 12, color: "#9AA0AF", marginTop: 10 }}>You've already applied to this project.</p>
              ) : (
                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: "pointer", fontSize: 13, color: "#3454D1" }}>Apply to this project</summary>
                  <ApplyForm projectId={p.id} />
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
