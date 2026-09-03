# DataHive — Phase 1 + 2 + 3 + 4 Scaffold

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
