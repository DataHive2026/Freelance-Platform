import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAppUser } from "@/lib/services/auth";
import { listMine } from "@/lib/services/applications";
import { withdrawApplicationAction } from "./actions";

const STATUS_COLOR: Record<string, string> = {
  submitted: "#3454D1",
  shortlisted: "#C97F1E",
  accepted: "#3B8365",
  rejected: "#B4432F",
  withdrawn: "#9AA0AF",
};

export default async function MyProposalsPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (user.user_type !== "expert") redirect("/login");

  const applications = await listMine(user.id);

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 640 }}>
      <Link href="/expert/dashboard" style={{ fontSize: 13, color: "#9AA0AF", textDecoration: "none" }}>← Back to dashboard</Link>
      <h1 style={{ marginTop: 12 }}>My proposals</h1>
      <p style={{ color: "#5B6172" }}>Every project you've applied to, and where it stands.</p>

      {applications.length === 0 ? (
        <p style={{ color: "#9AA0AF", marginTop: 20 }}>No applications yet — browse open projects to apply.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
          {applications.map((a) => {
            // @ts-expect-error — joined-table typing gap, closes once generated types are wired in
            const projectTitle = a.projects?.title ?? "Untitled project";
            // @ts-expect-error — see above
            const clientName = a.projects?.client_profiles?.company_name ?? "Unknown client";
            return (
              <div key={a.id} style={{ border: "1px solid #E2E4EA", borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div>
                    <div style={{ fontSize: 10, textTransform: "uppercase", color: STATUS_COLOR[a.status] ?? "#9AA0AF" }}>{a.status}</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{projectTitle}</div>
                    <div style={{ fontSize: 12, color: "#5B6172" }}>{clientName}</div>
                  </div>
                  {a.status === "submitted" && (
                    <form action={withdrawApplicationAction}>
                      <input type="hidden" name="applicationId" value={a.id} />
                      <button type="submit" style={{ background: "#F2F3F6", color: "#B4432F", padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 12 }}>
                        Withdraw
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
