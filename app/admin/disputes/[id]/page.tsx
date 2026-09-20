import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentAppUser } from "@/lib/services/auth";
import { getDispute, DisputeServiceError } from "@/lib/services/disputes";
import { EvidenceForm, ResolveForm } from "./DisputeForms";

export default async function DisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");

  let result;
  try {
    result = await getDispute(user.id, id);
  } catch (err) {
    if (err instanceof DisputeServiceError) notFound();
    throw err;
  }
  const { dispute, evidence } = result;

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 640 }}>
      <Link href={user.user_type === "admin" ? "/admin/disputes" : "/projects/" + dispute.project_id} style={{ fontSize: 13, color: "#9AA0AF", textDecoration: "none" }}>
        ← Back
      </Link>
      <div style={{ fontSize: 11, textTransform: "uppercase", color: "#B4432F", margin: "16px 0 6px" }}>{dispute.status.replace(/_/g, " ")}</div>
      {/* @ts-expect-error — joined-table typing gap, closes once generated types are wired in */}
      <h1 style={{ margin: 0 }}>{dispute.projects?.title ?? "Dispute"}</h1>
      <p style={{ color: "#5B6172", marginTop: 8 }}>{dispute.reason}</p>

      {dispute.status === "resolved" && dispute.resolution && (
        <div style={{ background: "#E9F5EF", color: "#3B8365", padding: 12, borderRadius: 10, marginTop: 16, fontSize: 13 }}>
          <strong>Resolved:</strong> {dispute.resolution}
        </div>
      )}

      <h2 style={{ fontSize: 15, marginTop: 24, marginBottom: 8 }}>Thread</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {evidence.length === 0 && <p style={{ color: "#9AA0AF", fontSize: 13 }}>No messages yet.</p>}
        {evidence.map((e) => (
          <div key={e.id} style={{ border: "1px solid #E2E4EA", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11, color: "#9AA0AF" }}>
              {/* @ts-expect-error — joined-table typing gap, closes once generated types are wired in */}
              {e.users?.email ?? "unknown"}
            </div>
            {e.message && <p style={{ fontSize: 13, marginTop: 4 }}>{e.message}</p>}
          </div>
        ))}
      </div>

      {dispute.status !== "resolved" && dispute.status !== "closed" && <EvidenceForm disputeId={id} />}

      {user.user_type === "admin" && dispute.status !== "resolved" && dispute.status !== "closed" && (
        <>
          <h2 style={{ fontSize: 15, marginTop: 24, marginBottom: 0 }}>Admin resolution</h2>
          <ResolveForm disputeId={id} />
        </>
      )}
    </main>
  );
}
