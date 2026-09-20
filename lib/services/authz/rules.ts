// The rule table is the single source of truth for authorization.
// Every row here corresponds to a row in permission-matrix.md.
// Deny-by-default: any action without a matching rule returns false.

import type { UserType } from "@/types/domain";

export type Scope = "none" | "owner" | "member" | "party" | "self";

export interface AuthzContext {
  userId: string;
  actorRole: UserType;
  // Resolved relationship of the actor to the resource's project, if scoped.
  isOwner: boolean;      // client who owns the project
  isMember: boolean;     // active team_members row on the project
  isLead: boolean;       // is_lead = true on an active team_members row
  isParty: boolean;      // is a named party on a dispute
  isAssignee: boolean;   // is the assigned_expert_id on a task (compares
                         // expert_profiles.id, not users.id — kept as its
                         // own boolean rather than jammed into `resource`
                         // to avoid comparing two different id spaces)
  // Resource state, loaded lazily per-action as needed.
  resource?: Record<string, unknown>;
}

export interface Rule {
  action: string;
  allowedRoles: UserType[];
  scope: Scope;
  // Optional state-dependent check, e.g. "milestone.status === 'SUBMITTED'"
  condition?: (ctx: AuthzContext) => boolean;
}

export const RULES: Rule[] = [
  // --- Projects ---------------------------------------------------------
  { action: "project:create", allowedRoles: ["client"], scope: "none" },
  { action: "project:post", allowedRoles: ["client"], scope: "owner",
    condition: (ctx) => ctx.resource?.status === "DRAFT" },
  { action: "project:edit_details", allowedRoles: ["client", "admin"], scope: "owner",
    condition: (ctx) => ["DRAFT", "POSTED"].includes(String(ctx.resource?.status)) },
  { action: "project:view", allowedRoles: ["client", "expert", "admin"], scope: "none" },
  { action: "project:cancel", allowedRoles: ["client", "admin"], scope: "owner",
    condition: (ctx) => ["DRAFT", "POSTED", "REVIEWING", "TEAM_FORMING"].includes(String(ctx.resource?.status)) },
  { action: "project:complete", allowedRoles: ["client"], scope: "owner",
    condition: (ctx) => ctx.resource?.status === "DELIVERABLE_REVIEW" },
  { action: "project:fund", allowedRoles: ["client"], scope: "owner",
    condition: (ctx) => ctx.resource?.status === "TEAM_CONFIRMED" },

  // --- Team & applications ------------------------------------------------
  { action: "application:submit", allowedRoles: ["expert"], scope: "none" },
  { action: "application:withdraw", allowedRoles: ["expert"], scope: "self" },
  { action: "application:review", allowedRoles: ["client", "admin"], scope: "owner" },
  { action: "team:invite_expert", allowedRoles: ["client", "expert", "admin"], scope: "owner",
    condition: (ctx) => ctx.actorRole === "client" || ctx.isLead || ctx.actorRole === "admin" },
  { action: "team:accept_invitation", allowedRoles: ["expert"], scope: "self" },
  { action: "team:decline_invitation", allowedRoles: ["expert"], scope: "self" },
  { action: "team:remove_member", allowedRoles: ["client", "expert", "admin"], scope: "owner",
    condition: (ctx) => ctx.actorRole === "client" || ctx.isLead || ctx.actorRole === "admin" },
  { action: "team:view_roster", allowedRoles: ["client", "expert", "admin"], scope: "member" },

  // --- Tasks & milestones --------------------------------------------------
  { action: "task:create", allowedRoles: ["client", "expert", "admin"], scope: "owner",
    condition: (ctx) => ctx.actorRole === "client" || ctx.isLead || ctx.actorRole === "admin" },
  { action: "task:view", allowedRoles: ["client", "expert", "admin"], scope: "member" },
  { action: "task:update_status", allowedRoles: ["client", "expert", "admin"], scope: "member",
    condition: (ctx) => ctx.actorRole === "client" || ctx.actorRole === "admin" || ctx.isLead || ctx.isAssignee },
  { action: "task:comment", allowedRoles: ["client", "expert", "admin"], scope: "member" },
  { action: "milestone:create", allowedRoles: ["client", "expert", "admin"], scope: "owner",
    condition: (ctx) => ctx.actorRole === "client" || ctx.isLead || ctx.actorRole === "admin" },
  { action: "milestone:view", allowedRoles: ["client", "expert", "admin"], scope: "member" },
  { action: "milestone:submit_deliverable", allowedRoles: ["expert"], scope: "member" },
  { action: "milestone:approve", allowedRoles: ["client"], scope: "owner",
    condition: (ctx) => ctx.resource?.status === "submitted" },
  { action: "milestone:request_revision", allowedRoles: ["client"], scope: "owner",
    condition: (ctx) => ctx.resource?.status === "submitted" },

  // --- Files, messages, meetings -------------------------------------------
  { action: "file:upload", allowedRoles: ["client", "expert", "admin"], scope: "member" },
  { action: "file:download", allowedRoles: ["client", "expert", "admin"], scope: "member" },
  { action: "file:delete", allowedRoles: ["client", "expert", "admin"], scope: "member",
    condition: (ctx) => ctx.actorRole === "client" || ctx.actorRole === "admin" || ctx.resource?.uploaded_by === ctx.userId },
  { action: "message:send", allowedRoles: ["client", "expert"], scope: "member" },
  { action: "message:read", allowedRoles: ["client", "expert", "admin"], scope: "member" },
  { action: "meeting:schedule", allowedRoles: ["client", "expert"], scope: "member" },
  { action: "meeting:view", allowedRoles: ["client", "expert", "admin"], scope: "member" },
  { action: "meeting:cancel", allowedRoles: ["client", "expert", "admin"], scope: "member",
    condition: (ctx) => ctx.actorRole === "admin" || ctx.resource?.created_by === ctx.userId },
  { action: "meeting:respond_rsvp", allowedRoles: ["client", "expert"], scope: "member" },

  // --- Payments -------------------------------------------------------------
  { action: "payment:fund_project", allowedRoles: ["client"], scope: "owner" },
  { action: "payment:view_transactions", allowedRoles: ["client", "expert", "admin"], scope: "member" },
  { action: "payment:view_invoice", allowedRoles: ["client", "expert", "admin"], scope: "member" },
  // payout:initiate is intentionally absent — no human role may call it directly.
  { action: "payout:reverse", allowedRoles: ["admin"], scope: "none" },

  // --- Disputes ---------------------------------------------------------------
  { action: "dispute:open", allowedRoles: ["client", "expert"], scope: "member" },
  { action: "dispute:view", allowedRoles: ["client", "expert", "admin"], scope: "party" },
  { action: "dispute:submit_evidence", allowedRoles: ["client", "expert", "admin"], scope: "party" },
  { action: "dispute:message", allowedRoles: ["client", "expert", "admin"], scope: "party" },
  { action: "dispute:resolve", allowedRoles: ["admin"], scope: "none" },

  // --- Verification & reviews ---------------------------------------------------
  { action: "verification:submit", allowedRoles: ["expert"], scope: "self" },
  { action: "verification:decide", allowedRoles: ["admin"], scope: "none" },
  { action: "review:submit", allowedRoles: ["client", "expert"], scope: "member",
    condition: (ctx) => ctx.resource?.status === "COMPLETED" },
  { action: "review:remove", allowedRoles: ["admin"], scope: "none" },

  // --- Admin & platform config -------------------------------------------------
  { action: "admin:manage_users", allowedRoles: ["admin"], scope: "none" },
  { action: "admin:manage_categories", allowedRoles: ["admin"], scope: "none" },
  { action: "admin:manage_commission_rules", allowedRoles: ["admin"], scope: "none" },
  { action: "admin:manage_disputes", allowedRoles: ["admin"], scope: "none" },
  { action: "admin:view_reports", allowedRoles: ["admin"], scope: "none" },
  { action: "admin:view_audit_log", allowedRoles: ["admin"], scope: "none" },
];

export function findRule(action: string): Rule | undefined {
  return RULES.find((r) => r.action === action);
}
