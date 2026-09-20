import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAppUser } from "@/lib/services/auth";
import { listAllForAdmin } from "@/lib/services/disputes";

const STATUS_COLOR: Record<string, string> = {
  open: "#B4432F",
  under_review: "#C97F1E",
  waiting_for_client: "#3454D1",
  waiting_for_expert: "#3454D1",
  resolved: "#3B8365",
  closed: "#9AA0AF",
};

export default async function AdminDisputesPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (user.user_type !== "admin") redirect("/login");

  const disputes = await listAllForAdmin(user.id);

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 720 }}>
      <Link href="/admin/dashboard" style={{ fontSize: 13, color: "#9AA0AF", textDecoration: "none" }}>← Back to admin</Link>
      <h1 style={{ marginTop: 12 }}>Disputes</h1>
      <p style={{ color: "#5B6172" }}>{disputes.length} total.</p>

      {disputes.length === 0 ? (
        <p style={{ color: "#9AA0AF", marginTop: 20 }}>No disputes have been raised.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
          {disputes.map((d) => {
            // @ts-expect-error — joined-table typing gap, closes once generated types are wired in
            const projectTitle = d.projects?.title ?? "Untitled project";
            return (
              <Link
                key={d.id}
                href={`/admin/disputes/${d.id}`}
                style={{ display: "block", border: "1px solid #E2E4EA", borderRadius: 12, padding: 16, textDecoration: "none", color: "inherit" }}
              >
                <div style={{ fontSize: 10, textTransform: "uppercase", color: STATUS_COLOR[d.status] ?? "#9AA0AF" }}>{d.status.replace(/_/g, " ")}</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{projectTitle}</div>
                <div style={{ fontSize: 12, color: "#5B6172", marginTop: 4 }}>{d.reason}</div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
