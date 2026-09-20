"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/services/auth";
import { inviteExpert, TeamServiceError } from "@/lib/services/teams";
import { updateTaskStatus, createTask, TaskServiceError } from "@/lib/services/tasks";
import { submitDeliverable, approve, requestRevision, MilestoneServiceError } from "@/lib/services/milestones";
import { initiateFunding, confirmFunding, PaymentServiceError } from "@/lib/services/payments";
import { scheduleMeeting, respondRsvp, MeetingServiceError } from "@/lib/services/meetings";
import { shortlist, reject, accept as acceptApplication } from "@/lib/services/applications";
import { createUploadUrl, confirmUpload, getDownloadUrl, deleteFile, FileServiceError } from "@/lib/services/files";
import { sendMessage, ChatServiceError } from "@/lib/services/chat";
import { submitReview, ReviewServiceError } from "@/lib/services/reviews";
import { openDispute, DisputeServiceError } from "@/lib/services/disputes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TaskStatus } from "@/types/domain";

export interface InviteExpertState {
  error?: string;
  success?: boolean;
}

/**
 * Looks up an expert by email — a stand-in for a proper expert-directory
 * search (the Community/Directory screens from the design phase). Real
 * search wiring is a Phase 4b item; this proves the invite → accept loop
 * works end to end in the meantime.
 */
export async function inviteExpertAction(_prev: InviteExpertState, formData: FormData): Promise<InviteExpertState> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Not signed in" };

  const projectId = formData.get("projectId");
  const email = formData.get("expertEmail");
  const roleTitle = formData.get("roleTitle");
  const compensation = formData.get("compensation");
  const isLead = formData.get("isLead") === "on";

  if (typeof projectId !== "string" || typeof email !== "string" || !email.trim()) {
    return { error: "Missing project or expert email" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: expertUser } = await supabase
    .from("users")
    .select("id, user_type")
    .eq("email", email.trim())
    .maybeSingle();

  if (!expertUser || expertUser.user_type !== "expert") {
    return { error: `No expert account found for ${email}` };
  }

  const { data: expertProfile } = await supabase
    .from("expert_profiles")
    .select("id")
    .eq("user_id", expertUser.id)
    .single();

  if (!expertProfile) {
    return { error: `Found a user for ${email}, but no expert profile exists for them.` };
  }

  try {
    await inviteExpert(user.id, {
      projectId,
      expertId: expertProfile.id,
      isLead,
      responsibilities: typeof roleTitle === "string" ? roleTitle : undefined,
      compensationAmount: compensation ? Number(compensation) : undefined,
    });
  } catch (err) {
    return { error: err instanceof TeamServiceError ? err.message : "Failed to send invitation" };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}

/* ---------------------------------------------------------------------------
 * Tasks
 * ------------------------------------------------------------------------- */
export async function moveTaskAction(formData: FormData): Promise<void> {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("Not signed in");

  const taskId = formData.get("taskId");
  const status = formData.get("status");
  const projectId = formData.get("projectId");
  if (typeof taskId !== "string" || typeof status !== "string" || typeof projectId !== "string") {
    throw new Error("Missing fields");
  }

  await updateTaskStatus(user.id, taskId, status as TaskStatus);
  revalidatePath(`/projects/${projectId}`);
}

export interface CreateTaskState {
  error?: string;
}

export async function createTaskAction(_prev: CreateTaskState, formData: FormData): Promise<CreateTaskState> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Not signed in" };

  const projectId = formData.get("projectId");
  const title = formData.get("title");
  if (typeof projectId !== "string" || typeof title !== "string" || !title.trim()) {
    return { error: "Missing project or title" };
  }

  try {
    await createTask(user.id, { projectId, title: title.trim() });
  } catch (err) {
    return { error: err instanceof TaskServiceError ? err.message : "Failed to create task" };
  }

  revalidatePath(`/projects/${projectId}`);
  return {};
}

/* ---------------------------------------------------------------------------
 * Payments
 * ------------------------------------------------------------------------- */
export interface InitiateFundingState {
  error?: string;
  breakdown?: {
    fundingId: string;
    providerOrderId: string;
    baseAmount: number;
    commissionPct: number;
    commission: number;
    gst: number;
    totalDue: number;
    currency: string;
  };
}

export async function initiateFundingAction(_prev: InitiateFundingState, formData: FormData): Promise<InitiateFundingState> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Not signed in" };

  const projectId = formData.get("projectId");
  const milestoneId = formData.get("milestoneId");
  if (typeof projectId !== "string" || typeof milestoneId !== "string") return { error: "Missing project or milestone" };

  try {
    const breakdown = await initiateFunding(user.id, { projectId, scope: "milestone", milestoneId });
    return { breakdown };
  } catch (err) {
    return { error: err instanceof PaymentServiceError ? err.message : "Failed to start funding" };
  }
}

export interface ConfirmFundingState {
  error?: string;
  success?: boolean;
}

/**
 * Mock-mode confirmation: MockPaymentProvider.verifyPayment() ignores
 * its inputs and always returns true, so the fake paymentId/signature
 * below are just placeholders that satisfy the function signature — see
 * lib/services/payments/mock-adapter.ts. Once real Razorpay keys are
 * set, this needs to be replaced with the actual values Checkout.js's
 * handler callback provides (razorpay_payment_id, razorpay_signature),
 * not called eagerly like this.
 */
export async function confirmFundingAction(_prev: ConfirmFundingState, formData: FormData): Promise<ConfirmFundingState> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Not signed in" };

  const fundingId = formData.get("fundingId");
  const projectId = formData.get("projectId");
  if (typeof fundingId !== "string" || typeof projectId !== "string") return { error: "Missing funding id" };

  try {
    await confirmFunding(fundingId, `mock_payment_${Date.now()}`, "mock_signature_ignored_by_mock_provider");
  } catch (err) {
    return { error: err instanceof PaymentServiceError ? err.message : "Failed to confirm payment" };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}
export interface SubmitDeliverableState {
  error?: string;
  success?: boolean;
}

export async function submitDeliverableAction(_prev: SubmitDeliverableState, formData: FormData): Promise<SubmitDeliverableState> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Not signed in" };

  const milestoneId = formData.get("milestoneId");
  const projectId = formData.get("projectId");
  const title = formData.get("title");
  const description = formData.get("description");

  if (typeof milestoneId !== "string" || typeof projectId !== "string" || typeof title !== "string" || !title.trim()) {
    return { error: "Missing required fields" };
  }

  try {
    await submitDeliverable(user.id, {
      milestoneId,
      title: title.trim(),
      description: typeof description === "string" ? description : undefined,
    });
  } catch (err) {
    return { error: err instanceof MilestoneServiceError ? err.message : "Failed to submit deliverable" };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}

export async function approveMilestoneAction(formData: FormData): Promise<void> {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("Not signed in");

  const milestoneId = formData.get("milestoneId");
  const projectId = formData.get("projectId");
  if (typeof milestoneId !== "string" || typeof projectId !== "string") throw new Error("Missing fields");

  await approve(user.id, milestoneId);
  revalidatePath(`/projects/${projectId}`);
}

export async function requestRevisionAction(formData: FormData): Promise<void> {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("Not signed in");

  const milestoneId = formData.get("milestoneId");
  const projectId = formData.get("projectId");
  const note = formData.get("note");
  if (typeof milestoneId !== "string" || typeof projectId !== "string") throw new Error("Missing fields");

  await requestRevision(user.id, milestoneId, typeof note === "string" ? note : "");
  revalidatePath(`/projects/${projectId}`);
}

/* ---------------------------------------------------------------------------
 * Meetings
 * ------------------------------------------------------------------------- */
export interface ScheduleMeetingState {
  error?: string;
  success?: boolean;
}

export async function scheduleMeetingAction(_prev: ScheduleMeetingState, formData: FormData): Promise<ScheduleMeetingState> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Not signed in" };

  const projectId = formData.get("projectId");
  const title = formData.get("title");
  const startTime = formData.get("startTime");
  const duration = formData.get("duration");

  if (typeof projectId !== "string" || typeof title !== "string" || !title.trim() || typeof startTime !== "string" || !startTime) {
    return { error: "Missing required fields" };
  }

  try {
    await scheduleMeeting(user.id, {
      projectId,
      title: title.trim(),
      startTime: new Date(startTime).toISOString(),
      durationMinutes: duration ? Number(duration) : 30,
    });
  } catch (err) {
    return { error: err instanceof MeetingServiceError ? err.message : "Failed to schedule meeting" };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}

export async function respondRsvpAction(formData: FormData): Promise<void> {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("Not signed in");

  const meetingId = formData.get("meetingId");
  const projectId = formData.get("projectId");
  const status = formData.get("status");
  if (typeof meetingId !== "string" || typeof projectId !== "string" || (status !== "accepted" && status !== "declined")) {
    throw new Error("Missing fields");
  }

  await respondRsvp(user.id, meetingId, status);
  revalidatePath(`/projects/${projectId}`);
}

/* ---------------------------------------------------------------------------
 * Applications (client reviewing incoming proposals)
 * ------------------------------------------------------------------------- */
export async function shortlistApplicationAction(formData: FormData): Promise<void> {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("Not signed in");

  const applicationId = formData.get("applicationId");
  const projectId = formData.get("projectId");
  if (typeof applicationId !== "string" || typeof projectId !== "string") throw new Error("Missing fields");

  await shortlist(user.id, applicationId);
  revalidatePath(`/projects/${projectId}`);
}

export async function rejectApplicationAction(formData: FormData): Promise<void> {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("Not signed in");

  const applicationId = formData.get("applicationId");
  const projectId = formData.get("projectId");
  if (typeof applicationId !== "string" || typeof projectId !== "string") throw new Error("Missing fields");

  await reject(user.id, applicationId);
  revalidatePath(`/projects/${projectId}`);
}

export async function acceptApplicationAction(formData: FormData): Promise<void> {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("Not signed in");

  const applicationId = formData.get("applicationId");
  const projectId = formData.get("projectId");
  if (typeof applicationId !== "string" || typeof projectId !== "string") throw new Error("Missing fields");

  await acceptApplication(user.id, applicationId);
  revalidatePath(`/projects/${projectId}`);
}

/* ---------------------------------------------------------------------------
 * Files
 * ------------------------------------------------------------------------- */
export interface CreateUploadUrlState {
  error?: string;
  data?: { storagePath: string; signedUrl: string; token: string };
}

export async function createUploadUrlServerAction(
  projectId: string,
  fileName: string,
  category: string
): Promise<CreateUploadUrlState> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Not signed in" };

  try {
    const data = await createUploadUrl(user.id, { projectId, fileName, category: category as Parameters<typeof createUploadUrl>[1]["category"] });
    return { data };
  } catch (err) {
    return { error: err instanceof FileServiceError ? err.message : "Failed to prepare upload" };
  }
}

export async function confirmUploadServerAction(input: {
  projectId: string;
  storagePath: string;
  fileName: string;
  category: string;
  mimeType?: string;
  sizeBytes?: number;
}): Promise<{ error?: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Not signed in" };

  try {
    await confirmUpload(user.id, { ...input, category: input.category as Parameters<typeof confirmUpload>[1]["category"] });
  } catch (err) {
    return { error: err instanceof FileServiceError ? err.message : "Failed to record upload" };
  }

  revalidatePath(`/projects/${input.projectId}`);
  return {};
}

export async function getDownloadUrlServerAction(fileId: string): Promise<{ url?: string; fileName?: string; error?: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Not signed in" };

  try {
    const result = await getDownloadUrl(user.id, fileId);
    return result;
  } catch (err) {
    return { error: err instanceof FileServiceError ? err.message : "Failed to get download link" };
  }
}

export async function deleteFileServerAction(fileId: string, projectId: string): Promise<{ error?: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Not signed in" };

  try {
    await deleteFile(user.id, fileId);
  } catch (err) {
    return { error: err instanceof FileServiceError ? err.message : "Failed to delete file" };
  }

  revalidatePath(`/projects/${projectId}`);
  return {};
}

/* ---------------------------------------------------------------------------
 * Chat
 * ------------------------------------------------------------------------- */
export async function sendMessageServerAction(projectId: string, content: string): Promise<{ error?: string }> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Not signed in" };

  try {
    await sendMessage(user.id, projectId, content);
  } catch (err) {
    return { error: err instanceof ChatServiceError ? err.message : "Failed to send message" };
  }

  return {};
}

/* ---------------------------------------------------------------------------
 * Reviews
 * ------------------------------------------------------------------------- */
export interface SubmitReviewState {
  error?: string;
  success?: boolean;
}

export async function submitReviewAction(_prev: SubmitReviewState, formData: FormData): Promise<SubmitReviewState> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Not signed in" };

  const projectId = formData.get("projectId");
  const revieweeUserId = formData.get("revieweeUserId");
  const comment = formData.get("comment");
  const ratingFields = ["qualityRating", "communicationRating", "reliabilityRating", "technicalRating", "collaborationRating", "timelinessRating"] as const;

  if (typeof projectId !== "string" || typeof revieweeUserId !== "string") {
    return { error: "Missing project or reviewee" };
  }

  const ratings: Record<string, number> = {};
  for (const field of ratingFields) {
    const raw = formData.get(field);
    ratings[field] = raw ? Number(raw) : 0;
  }

  try {
    await submitReview(user.id, {
      projectId,
      revieweeUserId,
      qualityRating: ratings.qualityRating,
      communicationRating: ratings.communicationRating,
      reliabilityRating: ratings.reliabilityRating,
      technicalRating: ratings.technicalRating,
      collaborationRating: ratings.collaborationRating,
      timelinessRating: ratings.timelinessRating,
      comment: typeof comment === "string" ? comment : undefined,
    });
  } catch (err) {
    return { error: err instanceof ReviewServiceError ? err.message : "Failed to submit review" };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}

/* ---------------------------------------------------------------------------
 * Disputes
 * ------------------------------------------------------------------------- */
export interface OpenDisputeState {
  error?: string;
  disputeId?: string;
}

export async function openDisputeAction(_prev: OpenDisputeState, formData: FormData): Promise<OpenDisputeState> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Not signed in" };

  const projectId = formData.get("projectId");
  const reason = formData.get("reason");
  if (typeof projectId !== "string" || typeof reason !== "string" || !reason.trim()) {
    return { error: "A reason is required" };
  }

  try {
    const dispute = await openDispute(user.id, projectId, reason);
    revalidatePath(`/projects/${projectId}`);
    return { disputeId: dispute.id };
  } catch (err) {
    return { error: err instanceof DisputeServiceError ? err.message : "Failed to open dispute" };
  }
}
