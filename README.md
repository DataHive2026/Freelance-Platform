# DataHive — Phase 1 through 14 Scaffold

This is the first real code for the platform, following the architecture in
`phase0-database-and-lifecycle.md` and `permission-matrix.md`. It's not a
finished app — it's a verified, buildable foundation the rest of the
platform gets built onto. Phase 1 (project setup) and Phase 2
(authentication) are both real and building clean.

## What's actually implemented (not just scaffolded)

- **Full database schema** (`database/migrations/0001_init.sql`) — every
  table, enum, constraint, and index from the Phase 0 ERD. Ready to run
  against a Supabase Postgres instance.
- **AuthzService** (`lib/services/authz/`) — `can(userId, action, resourceId)`,
  the real evaluator for the rule table in `permission-matrix.md`. Deny by
  default; admin overrides are logged, never silent.
- **ProjectService** (`lib/services/projects/`) — `transitionStatus()` is the
  only code path in the app allowed to write `projects.status`. It checks
  the state machine's allow-list, calls `AuthzService.can()`, and writes an
  audit log row atomically.
- **Commission resolution** (`lib/config/commission.ts`) — resolves the
  applicable `commission_rules` row by precedence (promotional > category >
  global). No commission percentage is hardcoded anywhere else.
- **Supabase client factories** for server, browser, and middleware contexts.
- **Zod validation** for project creation, matching the Post Project flow
  from the frontend mockups.

Both `npx tsc --noEmit` and `npm run build` pass clean.

## Phase 2 — Authentication (new)

- **`database/migrations/0002_auth_integration.sql`** — a trigger on
  `auth.users` that creates the matching `public.users` row in the same
  transaction Supabase Auth commits, plus baseline RLS policies for the
  tables a browser client might touch directly (chat, notifications).
- **`lib/services/auth/`** — `signUp()`, `signIn()`, `signOut()`,
  `getCurrentAppUser()`. `signUp()` creates the `client_profiles` or
  `expert_profiles` row right after the trigger-created `users` row exists,
  so a signed-up user always has a complete profile, never a dangling one.
- **Real pages**: `/login`, `/signup` (role-select → client or expert form),
  and a protected `/dashboard` demonstrating the route-guard pattern every
  `app/(client)/`, `app/(expert)/`, `app/(admin)/` page will follow —
  resolve the session server-side via `getCurrentAppUser()`, redirect if
  absent or wrong role.
- All of it uses **Server Actions** (`actions.ts` next to each `page.tsx`),
  `useActionState` for pending/error UI — no client-side fetch calls.

`npm run build` produces real routes: `/`, `/login`, `/signup`, `/dashboard`.

## Phase 3 — Profiles & first real end-to-end flow (new)

- **`lib/services/profiles/`** — `getMyClientProfile()`, `updateClientProfile()`,
  `getMyExpertProfile()`, `updateExpertProfile()`. All implicitly scoped to
  "your own row" (looked up by `user_id`), so there's nothing for
  `AuthzService` to gate here — you can only ever touch your own profile.
- **`ProjectService.listForClient()` and `getById()`** — real reads,
  the latter gated by `can(userId, "project:view", projectId)`.
- **The client dashboard is real now** — `/dashboard` queries the actual
  `projects` table for the signed-in client's `client_profiles.id` and
  renders it. No mock data, no `useState`.
- **`/projects/new`** — a real form, Zod-validated, that calls
  `ProjectService.createProject()` and redirects to the new project's
  real detail page on success.
- **`/projects/[id]`** — reads a single project through
  `can(userId, "project:view", projectId)` before returning anything.

This is the first fully real loop: sign up as a client → land on a
dashboard backed by an actual query → post a project → see it persisted
and rendered back from the database. Everything after this point is the
same pattern repeated for teams, tasks, milestones, and payments.

## Route structure — a real fix, not just an addition

`(client)/dashboard` and `(expert)/dashboard` both resolved to the URL
`/dashboard` — Next.js route groups (parens) don't add a path segment,
they're organizational only. This built clean in isolation each time but
broke the instant both existed together (`next build` catches it: "You
cannot have two parallel pages that resolve to the same path"). Fixed by
moving client/expert/admin into real path segments — `/client/*`,
`/expert/*`, `/admin/*` — instead of relying on route groups for role
separation. `(auth)/login` and `(auth)/signup` keep the route-group form
since they don't collide with anything.

## Phase 4 — Team Formation (new)

The spec's own "most important feature." Also fixes a real correctness bug
found while building it (see below).

- **`lib/services/teams/`** — `inviteExpert()`, `acceptInvitation()`,
  `declineInvitation()`, `removeMember()`, `listRoster()`,
  `listMyInvitations()`. Team creation (`project_teams`) is lazy — the row
  gets created the first time anyone is invited, not at project-creation
  time.
- **Bug fix in `AuthzService.resolveScope()`**: the original version
  queried `team_members` using the *project id* as `project_team_id` —
  but `project_team_id` references `project_teams.id`, not the project
  directly. That meant every non-owner scope check silently resolved to
  "not a member," even for actual team members. Fixed to resolve through
  `project_teams` first, then match the caller's own `expert_profiles.id`.
  Also added a `team_members`-id fallback so `team:accept_invitation` /
  `team:decline_invitation` can resolve "self" scope (the invitation
  itself is the resource being acted on, not a project).
- **Real pages**: `/client/projects/[id]` now shows the actual team
  roster and a working "invite an expert" form (looks up by email — a
  stand-in for real directory search); `/expert/invitations` lists real
  pending invitations with working Accept/Decline forms that update the
  database and redirect back.
- **First-pass auto-confirm**: accepting an invitation checks whether the
  team has no more pending invites and at least one active member, and if
  so marks `project_teams.status = confirmed`. Deliberately not yet wired
  to `project_roles.seats_available` (needs role-assignment UI first) or
  to `ProjectService.transitionStatus()` (needs a system actor identity
  threaded through) — both flagged inline as TODOs in the code.

## Phase 5 — Tasks & Milestones (new)

Two more real bugs surfaced and got fixed while building this — flagged
plainly rather than smoothed over, since a scaffold with silently-wrong
authz is worse than no scaffold.

- **`AuthzService.resolveScope()` was refactored**, not just extended.
  The old version only ever loaded `{ status: project.status }` onto
  `ctx.resource` — so any rule whose condition needed something else (a
  task's `assigned_expert_id`, a milestone's own status) could never
  actually pass. Split into a shared `resolveProjectMembership()` helper
  plus dedicated branches for milestone ids and task ids, each of which
  now loads what its own condition actually needs.
- **`isAssignee` is its own field on `AuthzContext`**, not jammed into
  `resource`. The first draft tried to compare `assigned_expert_id`
  (an `expert_profiles.id`) directly against `ctx.userId` (a `users.id`)
  — two different id spaces that would never match. Fixed with a proper
  boolean resolved server-side against the caller's own expert profile.
- **Status-string case bug**: `milestone:approve`'s condition checked for
  `"SUBMITTED"` (uppercase) while the actual Postgres enum in
  `0001_init.sql` is lowercase (`'submitted'`) — every approval attempt
  would have silently failed authorization. Fixed to match the schema.
- **Routing bug avoided proactively**: task/milestone actions were
  originally drafted under both `app/client/projects/[id]/` and a
  duplicate `app/expert/projects/[id]/` tree — which would have hit the
  exact same route-collision problem as the client/expert dashboards did
  in Phase 4. Fixed *before* it broke the build, not after: project
  detail now lives at a single shared `/projects/[id]`, with the client
  vs. expert view differing by which forms render (`isClient` check), not
  by URL.
- **`lib/services/tasks/`** — `createTask()`, `updateTaskStatus()`
  (assignee-or-lead-or-client gated), `addComment()`, `listForProject()`.
- **`lib/services/milestones/`** — `createMilestone()`,
  `submitDeliverable()` (any active team member), `approve()` and
  `requestRevision()` (client-only, no admin path — see the doc comment
  in the code for why that's deliberate, tracing back to
  permission-matrix.md §3.3).
- **`/projects/[id]` is now the real, shared Project Room** — team
  roster, a task board grouped by status with a working move-task
  control, and milestones with a submit-deliverable form (experts) or
  approve/request-revision buttons (clients) that actually update the
  database.
- **Honest gap, not a fake one**: `MilestoneService.approve()` does NOT
  release payment. `PaymentService` doesn't exist yet (Phase 6). Rather
  than insert a fire-and-forget fake transaction row, there's a clearly
  marked `TODO(payments)` comment at the exact call site — a
  half-implemented money-movement path is worse than an honest gap.

## Phase 6 — Payments (new)

This phase found and fixed the single biggest gap in the whole scaffold
so far.

- **`ProjectService.transitionStatus()` had been non-functional since
  Phase 1.** It called `can(actorId, "project:transition_status", projectId)`
  — a rule name that never existed anywhere in `rules.ts`. Deny-by-default
  means every call to it would have thrown "not authorized," silently,
  for every actor, always. Nothing exercised this path until Payments
  needed it. Fixed by splitting it properly: `transitionStatus()` now
  maps each (current → target) edge to the specific AuthzService action
  that actually governs it (`project:post`, `project:complete`,
  `payment:fund_project`, `dispute:open`, `dispute:resolve` — see the
  `HUMAN_TRANSITION_ACTIONS` map in `lib/services/projects/index.ts`),
  and a new `systemTransition()` handles the edges the state machine
  marks "System (automatic)" — those skip `can()` entirely, since the
  authorization already happened at whatever triggered them.
- **`TeamService.maybeConfirmTeam()`'s Phase 5 TODO is closed** — it now
  actually calls `systemTransition(projectId, "TEAM_CONFIRMED", ...)`
  instead of only flipping the `project_teams` row.
- **`lib/services/payments/`** — a real provider-adapter split:
  `provider.ts` (the interface), `razorpay-adapter.ts` (calls Razorpay's
  REST API directly via `fetch`, no SDK dependency), `mock-adapter.ts`
  (used automatically when no Razorpay keys are set, logs loudly so a
  "successful" local payment is never mistaken for a real one).
- **A financial math bug caught before it shipped**: the first draft of
  `confirmFunding()` tried to re-derive the commission amount from the
  total charged using an algebraically wrong formula. Fixed properly —
  not by fixing the formula, but by not needing one: added
  `0003_project_funding_breakdown.sql` to store `base_amount`,
  `commission_amount`, and `gst_amount` directly at funding time, so
  confirmation reads real stored numbers instead of reconstructing them.
- **Checkout-signature vs. webhook-signature are correctly NOT the same
  code path.** Razorpay's checkout completion (`order_id|payment_id`
  HMAC) and its server-to-server webhook (HMAC over the raw request body
  with a separate secret) are different schemes entirely. `confirmFunding()`
  (checkout path) and `confirmFundingFromWebhook()` (webhook path,
  `app/api/webhooks/razorpay/route.ts`) share the actual ledger-writing
  logic via a private `finalizeFunding()`, but each verifies authenticity
  its own correct way rather than being merged into one function that
  would verify the wrong signature on one of the two paths.
- **`payout:initiate` still has no rule in `rules.ts` — deliberately.**
  `PaymentService.releaseMilestone()` is only ever called from inside
  `MilestoneService.approve()`, which is where the real authorization
  (client-only, status must be `submitted`) already happened.
- **Known, flagged approximation**: milestone payout splits evenly
  across active team members, not weighted by `team_members.contribution_pct`
  (present in the schema, not yet consulted). `payouts.status` is
  optimistically set to `"paid"` — there's no real payout-API integration
  yet, only the escrow-side ledger entry.
- **The funding UI is real but explicitly mock-mode**: `/projects/[id]`'s
  "Fund this milestone" flow shows the actual commission/GST breakdown
  and calls the real `PaymentService`, but confirms via the mock provider
  since there are no live Razorpay keys in this environment — the UI
  says so outright rather than pretending.

## Phase 7 — Meetings (new)

Same pattern as Payments: a provider adapter (Zoom this time, real REST
calls + Server-to-Server OAuth, no SDK dependency), and — again — a real
authorization bug caught before it shipped rather than after.

- **`meeting:cancel` had the exact same class of bug as the Phase 5
  task/milestone issue.** Its condition checked `ctx.resource?.created_by`,
  but `resolveScope()` had no branch for meeting ids — any meeting id
  passed to `can()` fell through every branch with `resource` left
  `undefined`, meaning the rule could never actually pass for anyone,
  including a meeting's own creator. Fixed the same way as before: added
  a dedicated meeting branch to `resolveScope()` that loads
  `created_by` before the condition needs it. Also added proper
  `meeting:view` and `meeting:respond_rsvp` rules rather than reusing
  the deliberately-public `project:view`, continuing the Phase 5
  precedent.
- **`lib/services/meetings/`** — `provider.ts` (interface),
  `zoom-adapter.ts` (Server-to-Server OAuth token exchange, then real
  create/cancel calls against Zoom's REST API), `mock-adapter.ts`
  (used automatically without Zoom credentials, logs loudly).
- **`scheduleMeeting()` creates with the provider FIRST**, then persists
  — a failed Zoom call never leaves a half-created database row pointing
  at a meeting that doesn't exist.
- **Participants are auto-invited**, not left as an empty picker: every
  active team member plus the project's client get a
  `meeting_participants` row automatically, matching how Section 13
  describes the scheduling workflow.
- **`/projects/[id]` now has a real Meetings section** — schedule a
  meeting (mock-mode join link, clearly not a real Zoom URL without
  credentials), accept/decline RSVP, join link shown for scheduled
  meetings.
- **Known gaps, flagged rather than hidden**: no meeting-edit/reschedule
  path yet (only schedule + cancel), notes/action-items have service
  functions (`addNotes`, `addActionItem`, `toggleActionItem`) but aren't
  wired into the UI yet — the Project Room mockup's post-meeting notes
  flow is the next thing to port over.

## Phase 8 — Applications & Proposals (new)

The self-service counterpart to Team Formation (Phase 4) — an expert
applying to a publicly posted project, rather than being invited
directly. Both were part of the original brief from the start
(`project_applications` and `proposals` have existed in the schema since
Phase 1), but only the invite path got built until now.

- **Caught the same bug class proactively, before shipping it.**
  `application:withdraw` uses `scope: "self"` with a `project_applications`
  id as the resource — exactly the shape that broke `meeting:cancel` in
  Phase 7 (no `resolveScope()` branch to resolve it). Added the
  applications branch to `resolveScope()` *before* writing
  `ApplicationService`, not after finding it broken. Four entities
  (team_members, tasks, milestones, meetings) hit this same pattern
  before it stopped being a surprise — worth naming plainly: any new
  entity with its own per-row condition needs its own `resolveScope()`
  branch, full stop.
- **`lib/services/applications/`** — `submitApplication()`,
  `withdrawApplication()`, `shortlist()`, `reject()`, `accept()`,
  `listForProject()` (client's incoming applications),
  `listMine()` (expert's own), `listOpenProjects()`.
- **`accept()` deliberately reuses `TeamService.inviteExpert()`** rather
  than duplicating team-creation logic — an accepted application and a
  sent invitation converge on the exact same `team_members` row shape,
  so there's one function that creates them, not two.
- **First application on a project fires `POSTED → REVIEWING`** via
  `systemTransition()` — the state machine's own automatic edge from
  `phase0-database-and-lifecycle.md` §3, finally has a real trigger.
- **Real pages**: `/expert/browse` (open projects, apply inline),
  `/expert/proposals` (status of everything you've applied to, withdraw
  while still `submitted`), and `/projects/[id]` now shows the client a
  live queue of incoming applications with Accept / Shortlist / Reject —
  accepting immediately shows up in the Team section above it.

## Phase 9 — Files (new)

Real Supabase Storage, not a database row pretending to be a file.

- **Caught the recurring bug class proactively again.** `file:delete`'s
  condition needs `uploaded_by`, same shape as every entity before it —
  added the `resolveScope()` branch before writing `FileService`. Fifth
  time this exact pattern has come up (team_members, tasks, milestones,
  meetings, now files); it's a checklist item now, not a surprise.
- **A new, deliberate architectural decision**: `SUPABASE_SERVICE_ROLE_KEY`
  had sat unused in `.env.example` since Phase 1. `lib/supabase/service-role.ts`
  finally uses it — Storage operations bypass RLS entirely, and
  `FileService` calls `AuthzService.can()` itself before ever reaching for
  it. The alternative (writing `storage.objects` RLS policies keyed to
  project membership) would mean maintaining the same authorization rule
  in SQL and TypeScript at once, with no guarantee they'd stay in sync.
  One source of truth was worth the tradeoff — documented explicitly in
  both the migration and the client file, including a direct warning
  against reaching for the service-role client to "just get something
  working" instead of adding the missing authz check.
- **Uploads are two-step, not one**: `createUploadUrl()` hands the
  browser a signed PUT URL; the file's bytes go straight from browser to
  Storage, never through a Server Action (which would base64-bloat them
  through the request body). `confirmUpload()` — called only after the
  PUT actually succeeds — re-runs the authz check rather than trusting
  the first one still holds, since a signed URL could in principle be
  reused later by someone who's since lost project access.
- **Downloads are short-lived signed URLs (60s)**, generated fresh per
  request — this is the literal implementation of the original spec's
  "a user should never be able to access files belonging to projects
  they are not authorized to access," not just a comment saying so.
- **`/projects/[id]` has a real Files section** — upload with a category
  picker, download opens a fresh signed URL, delete removes both the
  Storage object and the database row.

## Phase 10 — Chat (new)

The one entity in this whole build that DIDN'T need a `resolveScope()`
fix — worth noting plainly, since Phases 5 through 9 all found the same
bug class. `message:send` and `message:read` have no per-row condition
in `rules.ts`, so `scope: "member"` resolves fine against a plain
project id through the branch that's existed since Phase 4. Not every
entity hits that pattern — only ones whose rule needs something beyond
"are you on this project," which chat doesn't.

- **This is the first genuinely real-time feature in the scaffold.**
  Everything through Phase 9 was request/response — click something,
  `revalidatePath()`, see the update on next render. Chat needed actual
  Supabase Realtime: a new migration (`0005_realtime_messages.sql`)
  explicitly adds `messages` to the `supabase_realtime` publication
  (Realtime broadcasts nothing for a table until you do this — RLS
  alone, which was already written back in Phase 2, only controls WHO
  can subscribe, not WHETHER the table broadcasts at all).
- **The browser client (anon key, respects RLS) is used here for the
  first time for something other than session refresh** — this is
  exactly the scenario `lib/supabase/client.ts` and the
  "messages_read_if_participant" policy were built for back in Phase 2,
  finally connected to something.
- **`lib/services/chat/`** — `sendMessage()`, `listMessages()`,
  `markRead()`, plus a private `ensureParticipants()` shared with the
  lazy conversation-creation logic, mirroring `TeamService`'s and
  `MeetingService`'s "create the container the first time it's needed"
  pattern.
- **Optimistic send + de-duped Realtime echo**: `ChatPanel` appends a
  message locally the instant you hit send, then the same row arrives
  moments later via the Realtime subscription and gets recognized by id
  rather than appended twice.
- **Known gap, flagged rather than hidden**: only team-wide conversations
  are wired up — the schema supports `direct` conversations between two
  specific people (Section 9's "expert ↔ expert" case), but nothing
  creates or lists those yet.

## Phase 11 — Reviews & Reputation (new)

A sixth flavor of the same underlying lesson, and — for once — an
outright typo rather than a missing branch.

- **`review:submit`'s condition checked `ctx.resource?.project_status`
  — a field that has never existed.** `resolveScope()`'s project branch
  has always set the key as `status`, not `project_status` (every other
  project-scoped condition in `rules.ts` gets this right; this one
  didn't). The effect was identical to every prior instance: the
  condition could never be true, so no review could ever be submitted,
  by anyone, on any completed project, since the rule was first written
  back in Phase 0's planning. Fixed to match the actual key. Six
  entities now (team_members, tasks, milestones, meetings, files, and
  this one) have hit some variant of "the condition references a shape
  `resolveScope()` doesn't actually produce" — sometimes a missing
  branch, this time a plain field-name mismatch. Same root cause either
  way: nothing type-checks a condition closure against what
  `resolveScope()` actually populates, so a typo here is invisible to
  the compiler and only surfaces at the exact moment someone tries to
  use the feature.
- **`lib/services/reviews/`** — `submitReview()` (validates all six
  1-5 ratings, rejects self-review, and validates the reviewee is
  actually the client or an active team member on THIS project — a
  business rule AuthzService's scope check doesn't and shouldn't cover),
  `listForUser()`, `listForProject()`, `removeReview()` (admin-only).
- **Manipulation prevention is the database's job, not this service's**:
  `reviews.unique(project_id, reviewer_id, reviewee_id)` from
  `0001_init.sql` turns a duplicate review into a Postgres
  `23505 unique_violation`, which the service catches and turns into a
  clear message rather than a generic 500.
- **The cached rating columns finally get written to.**
  `expert_profiles.avg_rating` and `total_projects_completed` have sat
  as schema comments ("cached, recomputed by ReviewService") since
  Phase 1 — `recomputeExpertRatingCache()` is that recomputation,
  running after every submit and every admin removal.
- **`/projects/[id]` shows the review form only once a project is
  `COMPLETED`**, one form per eligible party not yet reviewed by the
  current user (a client sees one per active/completed team member; an
  expert sees one for the client).
- **Known gap, flagged rather than hidden**: only `expert_profiles` has
  a cached rating column in the current schema — a client being
  reviewed by an expert has no equivalent cache to update. The review
  itself still gets stored correctly either direction; only the
  cheap-read aggregate is one-sided.

## Phase 12 — Disputes (new)

Closes a gap that's been visible in the code since Phase 6: the project
state machine's DISPUTED edges (`IN_PROGRESS/MILESTONE_REVIEW → DISPUTED`,
`DISPUTED → IN_PROGRESS/CANCELLED`) have been mapped to `dispute:open`
and `dispute:resolve` in `ProjectService`'s `HUMAN_TRANSITION_ACTIONS`
since Payments — correctly, as it turns out — but nothing ever called
them, because `DisputeService` didn't exist until now.

- **For once, no `resolveScope()` fix was needed.** The dispute-party
  fallback branch (resolving `raised_by`/`against` for `scope: "party"`)
  has been in `resolveScope()` since Phase 1's original scaffold, before
  any of the five bugs in Phases 5–11 were found. It was just sitting
  there, correct, waiting for a service to use it. Two out of twelve
  phases (this one and Chat) didn't need a fix — worth keeping that
  ratio honest rather than implying every phase finds a bug.
- **A borrowed-rule mistake caught during review, not after shipping**:
  the admin dispute-listing function first used `admin:view_reports` as
  its authorization check — the wrong rule semantically, since viewing
  reports and managing disputes are different capabilities that happen
  to both be admin-only. Added a proper `admin:manage_disputes` rule
  instead of reusing an unrelated one, continuing the precedent from
  Phase 5 (task:view / milestone:view, not borrowing project:view).
- **`lib/services/disputes/`** — `openDispute()` (creates the dispute
  AND transitions the project to `DISPUTED` via `transitionStatus()`,
  the established single gate on `projects.status` since Phase 6),
  `submitEvidence()` (doubles as the dispute "message" mechanism — the
  schema's `dispute_evidence` table already has both a `file_id` and a
  `message` column on one row, so text and file evidence don't need
  separate tables), `resolveDispute()` (admin-only, no exception,
  requires a stored `resolution` explanation — Section 24's "admins do
  not automatically make legal conclusions" as an actual required field,
  not just a comment saying so).
- **First real admin pages in the scaffold**: `/admin/dashboard`,
  `/admin/disputes`, `/admin/disputes/[id]` — the `user.user_type ===
  "admin"` redirect in `login/actions.ts` has pointed here since Phase 2
  with nothing to land on until now.
- **`/projects/[id]` lets a client or expert open a dispute** directly
  (only while `IN_PROGRESS`/`MILESTONE_REVIEW`, one open dispute per
  project at a time), and the same detail page at `/admin/disputes/[id]`
  serves both the admin resolving it and the two parties following the
  thread — gated by `dispute:view`'s party-or-admin scope, not two
  separate pages for the same data.

## Phase 13 — Categories & Commission Rules (new)

Real admin CRUD, no `resolveScope()` fix needed (both rules are
`scope: "none"`), but the most valuable find this phase wasn't a bug in
the new code — it was a gap in code from Phase 3 that this phase's own
purpose made impossible to ignore.

- **The Post Project form has never captured a category — since Phase 3.**
  `createProjectSchema` had `categoryId` as an optional field from the
  start, `ProjectService.createProject()` has accepted it since Phase 3,
  but the actual form never rendered a category field and the Server
  Action never read one from `formData`. Every project ever created
  through this scaffold has `category_id = null`. That's not a bug that
  breaks anything on its own — but it means a category-scoped commission
  rule, which this exact phase exists to let an admin create, could
  never have taken effect on a single project, ever, because nothing
  upstream ever set the field that rule matches against. Fixed in the
  same pass: the post-project page is now a Server Component that fetches
  real categories, and the form actually submits `categoryId`.
- **`lib/services/categories/`** — `listCategories()` (public, no authz
  — matches `project:view`'s own public scope), `createCategory()`,
  `toggleCategoryActive()`, `deleteCategory()`. Deletion relies on
  Postgres's own foreign-key `RESTRICT` (no `ON DELETE` clause on
  `projects.category_id` in `0001_init.sql`) rather than an app-side
  reference check — caught and turned into a clear "deactivate instead"
  message rather than a raw constraint-violation error.
- **Commission rules are append-only, not edited in place** — extended
  `lib/config/commission.ts` (kept resolution and mutation together
  rather than splitting into a separate service) with
  `createCommissionRule()` and `deactivateCommissionRule()`. A new rule
  in a given scope automatically closes out the previous open-ended one
  in that same scope, so `resolveCommission()`'s date-range filter never
  sees two active candidates and has to guess. History stays queryable
  rather than being overwritten — same append-only philosophy as
  `transactions`.
- **A real safety rail**: `deactivateCommissionRule()` refuses to
  deactivate the only active global rule, since `resolveCommission()`
  throws — breaking funding platform-wide — if none exists.
- **`/admin/categories` and `/admin/commission`** are real pages now;
  `/admin/dashboard` links to both alongside Disputes.

## Phase 14 — User Management (new)

The last piece of the admin console, and a nice callback rather than a
new mechanism: suspension enforcement has already existed since Phase
2, this just gives it a UI.

- **`lib/services/users/`** — `listUsers()` (search by email, filter by
  role), `suspendUser()`, `restoreUser()`. Suspending someone takes
  effect immediately for any already-issued session — not because of
  anything new here, but because `getCurrentAppUser()` has checked
  `status !== "active"` and returned `null` since Phase 2, and every
  protected page's `if (!user) redirect("/login")` guard already covers
  it. This function only has to flip one column; the enforcement was
  already load-bearing everywhere else in the app.
- **Two real safety rails, not just a feature**: an admin can't suspend
  their own account (would lock them out with no recovery path through
  the UI), and can't suspend another admin through this panel at all —
  a compromised or careless admin session shouldn't be able to disable
  the rest of the admin team. Both throw a clear `UserServiceError`
  rather than silently no-op'ing.
- **`/admin/users`** — search by email (plain GET query param, no client
  JS needed for that part), suspend/restore per row.

## What's still a stub

Everything past this point in the phased plan (Sections 2-9 of the original
brief) - auth UI wired to Supabase Auth, the actual page components under
`app/(client)`, `app/(expert)`, `app/(admin)`, the remaining services
(`teams`, `tasks`, `milestones`, `payments`, `meetings`, `files`,
`notifications`, `reviews`), and the Zoom/Razorpay provider adapters. The
folder structure for all of it already exists (see below) so each piece has
an obvious home.

## Folder structure

```
app/
  (auth)/login  (auth)/signup
  (client)/dashboard  (client)/projects/[id]  (client)/projects/new
  (expert)/dashboard  (expert)/browse  (expert)/proposals
  (admin)/dashboard  (admin)/users  (admin)/disputes  (admin)/settings
  api/webhooks/razorpay  api/webhooks/zoom
components/
  ui/  project-room/  team/  shared/
lib/
  services/
    authz/      implemented
    projects/   implemented (transitionStatus, createProject)
    teams/ tasks/ milestones/ payments/ meetings/ files/ notifications/ reviews/  - stubs
  validation/   createProjectSchema (zod)
  supabase/     client.ts, server.ts, middleware.ts
  config/       brand.ts, commission.ts
types/
  domain.ts     hand-written enums + the project state machine
  database.ts   - run `supabase gen types typescript` once a project exists
database/
  migrations/0001_init.sql
  seed/         - empty, next step
hooks/          - empty, next step
```

## Running this

```bash
cp .env.example .env.local   # fill in Supabase project credentials
npm install
npm run build                # verified passing
npm run dev
```

To apply the schema, run `database/migrations/0001_init.sql` against a
Supabase project via the SQL editor or `supabase db push`.

## Next steps, in order

1. Wire Supabase Auth to the `(auth)/login` and `(auth)/signup` routes
   (Phase 2 from the original brief).
2. Build out `client_profiles`/`expert_profiles` CRUD (Phase 3).
3. Port the frontend mockups (`client-dashboard.jsx`, `project-room.jsx`,
   etc. from the design phase) into real Server/Client Components under
   `app/(client)/` and `app/(expert)/`, calling the services here instead
   of using local `useState`.
4. Fill in `TeamService`, `TaskService`, `MilestoneService` the same way
   `ProjectService` is built - one file, one clear responsibility, `can()`
   called first in every exported function.
