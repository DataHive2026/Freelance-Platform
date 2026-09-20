"use client";

import { useActionState } from "react";
import {
  createTaskAction, submitDeliverableAction, moveTaskAction,
  initiateFundingAction, confirmFundingAction,
  scheduleMeetingAction, respondRsvpAction,
  type CreateTaskState, type SubmitDeliverableState,
  type InitiateFundingState, type ConfirmFundingState,
  type ScheduleMeetingState,
} from "./actions";

const TASK_COLUMNS = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "in_review", label: "In review" },
  { key: "blocked", label: "Blocked" },
  { key: "completed", label: "Completed" },
];

/**
 * Server Actions imported into a Client Component are directly callable
 * as async functions (Next.js turns the "use server" export into an RPC
 * call) — no <form> needed for this one, since we want submit-on-change
 * rather than an explicit submit button.
 */
export function FundMilestoneForm({ projectId, milestoneId, budgetAllocation }: { projectId: string; milestoneId: string; budgetAllocation: number | null }) {
  const [initState, initAction, initPending] = useActionState<InitiateFundingState, FormData>(initiateFundingAction, {});
  const [confirmState, confirmAction, confirmPending] = useActionState<ConfirmFundingState, FormData>(confirmFundingAction, {});

  if (confirmState.success) {
    return <p style={{ fontSize: 12, color: "#3B8365", marginTop: 8 }}>Funded — held in escrow, releases on approval.</p>;
  }

  if (initState.breakdown) {
    const b = initState.breakdown;
    return (
      <form action={confirmAction} style={{ marginTop: 8, padding: 12, background: "#EEF1FC", borderRadius: 10, fontSize: 12 }}>
        <input type="hidden" name="fundingId" value={b.fundingId} />
        <input type="hidden" name="projectId" value={projectId} />
        {confirmState.error && <div style={{ color: "#B4432F", marginBottom: 6 }}>{confirmState.error}</div>}
        <div>Milestone amount: ₹{b.baseAmount.toLocaleString("en-IN")}</div>
        <div>Platform commission ({b.commissionPct}%): ₹{b.commission.toLocaleString("en-IN")}</div>
        <div>GST on commission (18%): ₹{b.gst.toLocaleString("en-IN")}</div>
        <div style={{ fontWeight: 600, marginTop: 4 }}>Total due: ₹{b.totalDue.toLocaleString("en-IN")}</div>
        <button
          type="submit"
          disabled={confirmPending}
          style={{ marginTop: 8, background: "#3454D1", color: "white", padding: "8px 14px", borderRadius: 8, border: "none", fontSize: 13 }}
        >
          {confirmPending ? "Confirming..." : "Confirm payment (mock provider)"}
        </button>
        <p style={{ marginTop: 6, color: "#5B6172" }}>
          No real Razorpay keys are configured, so this uses the mock provider
          — see lib/services/payments/mock-adapter.ts. Nothing is actually charged.
        </p>
      </form>
    );
  }

  return (
    <form action={initAction} style={{ marginTop: 8 }}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="milestoneId" value={milestoneId} />
      {initState.error && <div style={{ color: "#B4432F", fontSize: 12, marginBottom: 6 }}>{initState.error}</div>}
      <button
        type="submit"
        disabled={initPending || !budgetAllocation}
        style={{ background: "#F2F3F6", color: "#14171F", padding: "8px 14px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13 }}
      >
        {initPending ? "Starting..." : "Fund this milestone"}
      </button>
    </form>
  );
}

/**
 * Server Actions imported into a Client Component are directly callable
 * as async functions (Next.js turns the "use server" export into an RPC
 * call) — no <form> needed for this one, since we want submit-on-change
 * rather than an explicit submit button.
 */
export function TaskStatusSelect({ taskId, projectId, currentStatus }: { taskId: string; projectId: string; currentStatus: string }) {
  return (
    <select
      defaultValue={currentStatus}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("taskId", taskId);
        fd.set("projectId", projectId);
        fd.set("status", e.target.value);
        moveTaskAction(fd);
      }}
      style={{ fontSize: 10, textTransform: "uppercase", border: "none", background: "transparent", color: "#3454D1" }}
    >
      {TASK_COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
    </select>
  );
}

export function CreateTaskForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState<CreateTaskState, FormData>(createTaskAction, {});

  return (
    <form action={formAction} style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <input type="hidden" name="projectId" value={projectId} />
      <input
        name="title"
        placeholder="New task title"
        required
        style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13 }}
      />
      <button
        type="submit"
        disabled={pending}
        style={{ background: "#3454D1", color: "white", padding: "8px 14px", borderRadius: 8, border: "none", fontSize: 13 }}
      >
        {pending ? "Adding..." : "Add"}
      </button>
      {state.error && <span style={{ color: "#B4432F", fontSize: 12, alignSelf: "center" }}>{state.error}</span>}
    </form>
  );
}

export function SubmitDeliverableForm({ projectId, milestoneId }: { projectId: string; milestoneId: string }) {
  const [state, formAction, pending] = useActionState<SubmitDeliverableState, FormData>(submitDeliverableAction, {});

  if (state.success) {
    return <p style={{ fontSize: 12, color: "#3B8365", marginTop: 8 }}>Submitted — awaiting client review.</p>;
  }

  return (
    <form action={formAction} style={{ marginTop: 8, padding: 12, background: "#F2F3F6", borderRadius: 10 }}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="milestoneId" value={milestoneId} />
      {state.error && <div style={{ color: "#B4432F", fontSize: 12, marginBottom: 6 }}>{state.error}</div>}
      <input
        name="title"
        placeholder="Deliverable title"
        required
        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13, marginBottom: 6 }}
      />
      <textarea
        name="description"
        placeholder="Notes for the client..."
        rows={3}
        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13, marginBottom: 6, resize: "vertical" }}
      />
      <button
        type="submit"
        disabled={pending}
        style={{ background: "#3454D1", color: "white", padding: "8px 14px", borderRadius: 8, border: "none", fontSize: 13 }}
      >
        {pending ? "Submitting..." : "Submit deliverable"}
      </button>
    </form>
  );
}

export function ScheduleMeetingForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState<ScheduleMeetingState, FormData>(scheduleMeetingAction, {});

  return (
    <form action={formAction} style={{ marginTop: 8, padding: 12, background: "#F2F3F6", borderRadius: 10 }}>
      <input type="hidden" name="projectId" value={projectId} />
      {state.error && <div style={{ color: "#B4432F", fontSize: 12, marginBottom: 6 }}>{state.error}</div>}
      {state.success && <div style={{ color: "#3B8365", fontSize: 12, marginBottom: 6 }}>Meeting scheduled.</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
        <input
          name="title"
          placeholder="Meeting title"
          required
          style={{ flex: 2, padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13 }}
        />
        <input
          name="startTime"
          type="datetime-local"
          required
          style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13 }}
        />
        <input
          name="duration"
          type="number"
          placeholder="Minutes"
          defaultValue={30}
          style={{ width: 90, padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13 }}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        style={{ background: "#3454D1", color: "white", padding: "8px 14px", borderRadius: 8, border: "none", fontSize: 13 }}
      >
        {pending ? "Scheduling..." : "Schedule meeting"}
      </button>
    </form>
  );
}

export function RsvpButtons({ meetingId, projectId }: { meetingId: string; projectId: string }) {
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
      <form action={respondRsvpAction}>
        <input type="hidden" name="meetingId" value={meetingId} />
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="status" value="accepted" />
        <button type="submit" style={{ background: "#E9F5EF", color: "#3B8365", padding: "4px 10px", borderRadius: 6, border: "none", fontSize: 11 }}>
          Accept
        </button>
      </form>
      <form action={respondRsvpAction}>
        <input type="hidden" name="meetingId" value={meetingId} />
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="status" value="declined" />
        <button type="submit" style={{ background: "#FBF0DD", color: "#C97F1E", padding: "4px 10px", borderRadius: 6, border: "none", fontSize: 11 }}>
          Decline
        </button>
      </form>
    </div>
  );
}
