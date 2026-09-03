// Hand-written domain types — mirror database/migrations/0001_init.sql.
// `types/database.ts` (generated via `supabase gen types typescript`) will
// carry the raw row shapes; these are the enums/unions app code imports.

export type UserType = "client" | "expert" | "admin";
export type UserStatus = "active" | "suspended" | "deleted";

export type VerificationLevel =
  | "unverified"
  | "profile_verified"
  | "identity_verified"
  | "expertise_verified"
  | "top_expert";

export type ProjectStatus =
  | "DRAFT"
  | "POSTED"
  | "REVIEWING"
  | "TEAM_FORMING"
  | "TEAM_CONFIRMED"
  | "FUNDED"
  | "IN_PROGRESS"
  | "MILESTONE_REVIEW"
  | "DELIVERABLE_REVIEW"
  | "COMPLETED"
  | "DISPUTED"
  | "CANCELLED";

export type TeamMemberStatus =
  | "invited"
  | "accepted"
  | "declined"
  | "active"
  | "completed"
  | "removed";

export type TaskStatus = "todo" | "in_progress" | "in_review" | "completed" | "blocked";
export type MilestoneStatus = "pending" | "in_progress" | "submitted" | "approved" | "rejected";
export type DisputeStatus =
  | "open"
  | "under_review"
  | "waiting_for_client"
  | "waiting_for_expert"
  | "resolved"
  | "closed";

// ---------------------------------------------------------------------------
// Project state machine — the single allow-list every status transition
// must pass through. Mirrors phase0-database-and-lifecycle.md Section 3.
// ---------------------------------------------------------------------------
export const ALLOWED_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  DRAFT: ["POSTED"],
  POSTED: ["REVIEWING", "CANCELLED"],
  REVIEWING: ["TEAM_FORMING", "CANCELLED"],
  TEAM_FORMING: ["TEAM_CONFIRMED", "CANCELLED"],
  TEAM_CONFIRMED: ["FUNDED"],
  FUNDED: ["IN_PROGRESS"],
  IN_PROGRESS: ["MILESTONE_REVIEW", "DISPUTED"],
  MILESTONE_REVIEW: ["IN_PROGRESS", "DELIVERABLE_REVIEW", "DISPUTED"],
  DELIVERABLE_REVIEW: ["COMPLETED", "DISPUTED"],
  DISPUTED: ["IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export interface AuthUser {
  id: string;
  userType: UserType;
  status: UserStatus;
}
