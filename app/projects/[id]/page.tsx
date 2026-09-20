import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentAppUser } from "@/lib/services/auth";
import { getById, ProjectServiceError } from "@/lib/services/projects";
import { listRoster } from "@/lib/services/teams";
import { listForProject as listTasks } from "@/lib/services/tasks";
import { listForProject as listMilestones } from "@/lib/services/milestones";
import { listForProject as listMeetings } from "@/lib/services/meetings";
import { listForProject as listApplications } from "@/lib/services/applications";
import { listForProject as listFiles } from "@/lib/services/files";
import { listMessages } from "@/lib/services/chat";
import { listForProject as listReviews, getProjectClientUser } from "@/lib/services/reviews";
import { listForProject as listDisputes } from "@/lib/services/disputes";
import { UploadFileForm, FileRow } from "./FileForms";
import { ChatPanel } from "./ChatPanel";
import { ReviewForm } from "./ReviewForm";
import { OpenDisputeForm } from "./OpenDisputeForm";
import { InviteExpertForm } from "./InviteExpertForm";
import { CreateTaskForm, SubmitDeliverableForm, TaskStatusSelect, FundMilestoneForm, ScheduleMeetingForm, RsvpButtons } from "./ProjectRoomForms";
import { approveMilestoneAction, requestRevisionAction, shortlistApplicationAction, rejectApplicationAction, acceptApplicationAction } from "./actions";

function formatINR(n: number | null) {
  if (n == null) return "—";
  return "₹" + n.toLocaleString("en-IN");
}

const TEAM_STATUS_COLOR: Record<string, string> = {
  invited: "#C97F1E",
  active: "#3B8365",
  declined: "#9AA0AF",
  removed: "#9AA0AF",
};

const TASK_COLUMNS: { key: string; label: string }[] = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "in_review", label: "In review" },
  { key: "blocked", label: "Blocked" },
  { key: "completed", label: "Completed" },
];

const MILESTONE_COLOR: Record<string, string> = {
  pending: "#9AA0AF",
  in_progress: "#3454D1",
  submitted: "#C97F1E",
  approved: "#3B8365",
  rejected: "#B4432F",
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

  const isClient = user.user_type === "client";

  const [roster, tasks, milestones, meetings, applications, files, chat, reviews, disputes] = await Promise.all([
    listRoster(user.id, id),
    listTasks(user.id, id).catch(() => []),
    listMilestones(user.id, id).catch(() => []),
    listMeetings(user.id, id).catch(() => []),
    isClient ? listApplications(user.id, id).catch(() => []) : Promise.resolve([]),
    listFiles(user.id, id).catch(() => []),
    listMessages(user.id, id).catch(() => ({ conversationId: null, messages: [] })),
    listReviews(user.id, id).catch(() => []),
    listDisputes(user.id, id).catch(() => []),
  ]);

  const projectClientUser = !isClient && project.status === "COMPLETED" ? await getProjectClientUser(id) : null;
  const myReviewedIds = new Set(reviews.filter((r) => r.reviewer_id === user.id).map((r) => r.reviewee_id));

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 920 }}>
      <Link href={user.user_type === "expert" ? "/expert/dashboard" : "/client/dashboard"} style={{ fontSize: 13, color: "#9AA0AF", textDecoration: "none" }}>← Back to dashboard</Link>
      <div style={{ fontSize: 11, textTransform: "uppercase", color: "#3454D1", margin: "16px 0 6px" }}>{project.status}</div>
      <h1 style={{ margin: 0 }}>{project.title}</h1>
      <p style={{ color: "#5B6172", marginTop: 8 }}>{project.description}</p>
      <div style={{ fontFamily: "monospace", fontSize: 13, marginTop: 16 }}>
        {formatINR(project.budget_min)} – {formatINR(project.budget_max)}
        {project.deadline ? ` · due ${project.deadline}` : ""}
      </div>

      {/* --- APPLICATIONS (client only) --- */}
      {isClient && applications.filter((a) => a.status === "submitted" || a.status === "shortlisted").length > 0 && (
        <>
          <h2 style={{ fontSize: 15, marginTop: 32, marginBottom: 8 }}>
            Applications ({applications.filter((a) => a.status === "submitted" || a.status === "shortlisted").length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {applications
              .filter((a) => a.status === "submitted" || a.status === "shortlisted")
              .map((a) => {
                // @ts-expect-error — joined-table typing gap, closes once generated types are wired in
                const expertEmail = a.expert_profiles?.users?.email ?? "unknown";
                // @ts-expect-error — see above
                const headline = a.expert_profiles?.headline ?? "";
                const proposal = a.proposals?.[0];
                return (
                  <div key={a.id} style={{ border: "1px solid #E2E4EA", borderRadius: 12, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{expertEmail}</div>
                        <div style={{ fontSize: 12, color: "#5B6172" }}>{headline}</div>
                        {proposal?.cover_letter && <p style={{ fontSize: 12, color: "#5B6172", marginTop: 6, maxWidth: 480 }}>{proposal.cover_letter}</p>}
                      </div>
                      <span style={{ fontSize: 10, textTransform: "uppercase", color: a.status === "shortlisted" ? "#C97F1E" : "#3454D1" }}>{a.status}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                      <form action={acceptApplicationAction}>
                        <input type="hidden" name="applicationId" value={a.id} />
                        <input type="hidden" name="projectId" value={id} />
                        <button type="submit" style={{ background: "#3B8365", color: "white", padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 12 }}>
                          Accept → add to team
                        </button>
                      </form>
                      {a.status === "submitted" && (
                        <form action={shortlistApplicationAction}>
                          <input type="hidden" name="applicationId" value={a.id} />
                          <input type="hidden" name="projectId" value={id} />
                          <button type="submit" style={{ background: "#FBF0DD", color: "#C97F1E", padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 12 }}>
                            Shortlist
                          </button>
                        </form>
                      )}
                      <form action={rejectApplicationAction}>
                        <input type="hidden" name="applicationId" value={a.id} />
                        <input type="hidden" name="projectId" value={id} />
                        <button type="submit" style={{ background: "#F2F3F6", color: "#B4432F", padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 12 }}>
                          Reject
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
          </div>
        </>
      )}

      {/* --- TEAM --- */}
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
                <span style={{ fontSize: 11, textTransform: "uppercase", color: TEAM_STATUS_COLOR[m.status] ?? "#9AA0AF" }}>{m.status}</span>
              </div>
            );
          })}
        </div>
      )}

      {isClient && <InviteExpertForm projectId={id} />}

      {/* --- TASKS --- */}
      <h2 style={{ fontSize: 15, marginTop: 32, marginBottom: 8 }}>Tasks ({tasks.length})</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        {TASK_COLUMNS.map((col) => (
          <div key={col.key}>
            <div style={{ fontSize: 10, textTransform: "uppercase", color: "#9AA0AF", marginBottom: 6 }}>
              {col.label} · {tasks.filter((t) => t.status === col.key).length}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {tasks.filter((t) => t.status === col.key).map((t) => (
                <div key={t.id} style={{ border: "1px solid #E2E4EA", borderRadius: 10, padding: 10 }}>
                  <div style={{ fontSize: 12, marginBottom: 6 }}>{t.title}</div>
                  <TaskStatusSelect taskId={t.id} projectId={id} currentStatus={t.status} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <CreateTaskForm projectId={id} />

      {/* --- MILESTONES --- */}
      <h2 style={{ fontSize: 15, marginTop: 32, marginBottom: 8 }}>Milestones ({milestones.length})</h2>
      {milestones.length === 0 ? (
        <p style={{ color: "#9AA0AF", fontSize: 13 }}>No milestones yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {milestones.map((m) => (
            <div key={m.id} style={{ border: "1px solid #E2E4EA", borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: 10, textTransform: "uppercase", color: MILESTONE_COLOR[m.status] ?? "#9AA0AF" }}>{m.status}</span>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{m.title}</div>
                </div>
                <span style={{ fontFamily: "monospace", fontSize: 13 }}>{formatINR(m.budget_allocation)}</span>
              </div>

              {isClient && (m.status === "pending" || m.status === "in_progress") && (
                <FundMilestoneForm projectId={id} milestoneId={m.id} budgetAllocation={m.budget_allocation} />
              )}

              {!isClient && (m.status === "pending" || m.status === "in_progress") && (
                <SubmitDeliverableForm projectId={id} milestoneId={m.id} />
              )}

              {isClient && m.status === "submitted" && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <form action={approveMilestoneAction}>
                    <input type="hidden" name="milestoneId" value={m.id} />
                    <input type="hidden" name="projectId" value={id} />
                    <button type="submit" style={{ background: "#3B8365", color: "white", padding: "8px 14px", borderRadius: 8, border: "none", fontSize: 13 }}>
                      Approve — release {formatINR(m.budget_allocation)}
                    </button>
                  </form>
                  <form action={requestRevisionAction}>
                    <input type="hidden" name="milestoneId" value={m.id} />
                    <input type="hidden" name="projectId" value={id} />
                    <input type="hidden" name="note" value="Please revise and resubmit." />
                    <button type="submit" style={{ background: "#FBF0DD", color: "#C97F1E", padding: "8px 14px", borderRadius: 8, border: "none", fontSize: 13 }}>
                      Request revision
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* --- FILES --- */}
      <h2 style={{ fontSize: 15, marginTop: 32, marginBottom: 8 }}>Files ({files.length})</h2>
      {files.length === 0 ? (
        <p style={{ color: "#9AA0AF", fontSize: 13 }}>No files uploaded yet.</p>
      ) : (
        <div>
          {files.map((f) => (
            <FileRow key={f.id} id={f.id} fileName={f.file_name} category={f.category} projectId={id} />
          ))}
        </div>
      )}
      <UploadFileForm projectId={id} />

      {/* --- CHAT --- */}
      <h2 style={{ fontSize: 15, marginTop: 32, marginBottom: 8 }}>Chat</h2>
      {chat.conversationId ? (
        <ChatPanel
          projectId={id}
          conversationId={chat.conversationId}
          currentUserId={user.id}
          initialMessages={chat.messages.map((m) => ({
            id: m.id,
            content: m.content,
            created_at: m.created_at,
            sender_id: m.sender_id,
            // @ts-expect-error — joined-table typing gap, closes once generated types are wired in
            senderEmail: m.users?.email ?? "unknown",
          }))}
        />
      ) : (
        <p style={{ color: "#9AA0AF", fontSize: 13 }}>Chat isn&apos;t available yet.</p>
      )}

      {/* --- MEETINGS --- */}
      <h2 style={{ fontSize: 15, marginTop: 32, marginBottom: 8 }}>Meetings ({meetings.length})</h2>
      {meetings.length === 0 ? (
        <p style={{ color: "#9AA0AF", fontSize: 13 }}>No meetings scheduled yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {meetings.map((m) => (
            <div key={m.id} style={{ border: "1px solid #E2E4EA", borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div>
                  <span style={{ fontSize: 10, textTransform: "uppercase", color: m.status === "cancelled" ? "#B4432F" : m.status === "completed" ? "#3B8365" : "#3454D1" }}>
                    {m.status}
                  </span>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{m.title}</div>
                  <div style={{ fontSize: 12, color: "#5B6172" }}>{new Date(m.scheduled_start).toLocaleString()}</div>
                </div>
                {m.status === "scheduled" && m.provider_join_url && (
                  <a href={m.provider_join_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#3454D1", textDecoration: "none" }}>
                    Join →
                  </a>
                )}
              </div>
              {m.notes && <p style={{ fontSize: 12, color: "#5B6172", marginTop: 8 }}>{m.notes}</p>}
              {m.status === "scheduled" && <RsvpButtons meetingId={m.id} projectId={id} />}
            </div>
          ))}
        </div>
      )}
      <ScheduleMeetingForm projectId={id} />

      {/* --- REVIEWS (completed projects only) --- */}
      {project.status === "COMPLETED" && (
        <>
          <h2 style={{ fontSize: 15, marginTop: 32, marginBottom: 8 }}>Reviews</h2>
          {isClient
            ? roster
                .filter((m) => m.status === "active" || m.status === "completed")
                .map((m) => {
                  // @ts-expect-error — joined-table typing gap, closes once generated types are wired in
                  const revieweeUserId = m.expert_profiles?.user_id;
                  // @ts-expect-error — see above
                  const name = m.expert_profiles?.headline ?? "Team member";
                  if (!revieweeUserId || myReviewedIds.has(revieweeUserId)) return null;
                  return <ReviewForm key={m.id} projectId={id} revieweeUserId={revieweeUserId} revieweeName={name} />;
                })
            : projectClientUser && !myReviewedIds.has(projectClientUser.userId) && (
                <ReviewForm projectId={id} revieweeUserId={projectClientUser.userId} revieweeName={projectClientUser.name} />
              )}
          {reviews.length === 0 && <p style={{ color: "#9AA0AF", fontSize: 13 }}>No reviews yet.</p>}
        </>
      )}

      {/* --- DISPUTES --- */}
      <h2 style={{ fontSize: 15, marginTop: 32, marginBottom: 8 }}>Disputes</h2>
      {disputes.length === 0 ? (
        <>
          <p style={{ color: "#9AA0AF", fontSize: 13 }}>No disputes on this project.</p>
          {(project.status === "IN_PROGRESS" || project.status === "MILESTONE_REVIEW") && <OpenDisputeForm projectId={id} />}
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {disputes.map((d) => (
            <Link
              key={d.id}
              href={`/admin/disputes/${d.id}`}
              style={{ display: "block", border: "1px solid #E2E4EA", borderRadius: 10, padding: 12, textDecoration: "none", color: "inherit" }}
            >
              <span style={{ fontSize: 10, textTransform: "uppercase", color: d.status === "resolved" ? "#3B8365" : "#B4432F" }}>{d.status.replace(/_/g, " ")}</span>
              <div style={{ fontSize: 13, marginTop: 2 }}>{d.reason}</div>
            </Link>
          ))}
        </div>
      )}

      <p style={{ marginTop: 32, fontSize: 12, color: "#9AA0AF" }}>
        Every action on this page — inviting, moving a task, submitting a deliverable,
        funding a milestone, approving it — passes through <code>AuthzService.can()</code> before
        touching the database. Approving a submitted milestone now actually releases
        payment via <code>PaymentService.releaseMilestone()</code>, split evenly across
        active team members (not yet weighted by contribution_pct — see README).
      </p>
    </main>
  );
}
