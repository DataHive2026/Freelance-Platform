-- ============================================================================
-- DataHive — Initial schema
-- Implements the ERD from Phase 0 (phase0-database-and-lifecycle.md)
-- Target: Supabase Postgres
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
create type user_type as enum ('client', 'expert', 'admin');
create type user_status as enum ('active', 'suspended', 'deleted');
create type verification_level as enum ('unverified', 'profile_verified', 'identity_verified', 'expertise_verified', 'top_expert');
create type verification_status as enum ('pending', 'approved', 'rejected');
create type proficiency_level as enum ('beginner', 'intermediate', 'advanced', 'expert');
create type availability_status as enum ('available', 'busy', 'unavailable');

create type project_status as enum (
  'DRAFT', 'POSTED', 'REVIEWING', 'TEAM_FORMING', 'TEAM_CONFIRMED',
  'FUNDED', 'IN_PROGRESS', 'MILESTONE_REVIEW', 'DELIVERABLE_REVIEW',
  'COMPLETED', 'DISPUTED', 'CANCELLED'
);
create type project_visibility as enum ('public', 'invite_only');
create type application_status as enum ('submitted', 'shortlisted', 'rejected', 'withdrawn', 'accepted');
create type team_status as enum ('forming', 'confirmed', 'active', 'disbanded');
create type team_member_status as enum ('invited', 'accepted', 'declined', 'active', 'completed', 'removed');
create type task_status as enum ('todo', 'in_progress', 'in_review', 'completed', 'blocked');
create type task_priority as enum ('low', 'medium', 'high', 'urgent');
create type milestone_status as enum ('pending', 'in_progress', 'submitted', 'approved', 'rejected');
create type deliverable_status as enum ('submitted', 'under_review', 'approved', 'revision_requested');
create type file_category as enum ('requirements', 'dataset', 'documents', 'code', 'deliverables', 'reports', 'meeting_docs', 'other');
create type conversation_type as enum ('direct', 'team_wide');
create type meeting_provider as enum ('zoom');
create type meeting_status as enum ('scheduled', 'completed', 'cancelled');
create type rsvp_status as enum ('pending', 'accepted', 'declined');
create type action_item_status as enum ('open', 'done');

create type funding_status as enum ('pending', 'succeeded', 'failed', 'refunded');
create type transaction_type as enum ('funding', 'platform_fee', 'expert_payout', 'refund', 'adjustment');
create type transaction_status as enum ('pending', 'succeeded', 'failed');
create type payout_status as enum ('pending', 'processing', 'paid', 'failed');
create type payment_provider as enum ('razorpay', 'stripe');

create type notification_type as enum (
  'new_project', 'proposal_received', 'expert_selected', 'team_invitation',
  'task_assigned', 'milestone_approaching', 'message_received', 'meeting_scheduled',
  'meeting_changed', 'payment_received', 'deliverable_submitted', 'deliverable_approved',
  'project_completed'
);
create type dispute_status as enum ('open', 'under_review', 'waiting_for_client', 'waiting_for_expert', 'resolved', 'closed');
create type commission_scope as enum ('global', 'category', 'promotional');

-- ---------------------------------------------------------------------------
-- IDENTITY & PROFILES
-- ---------------------------------------------------------------------------
create table users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  user_type user_type not null,
  auth_provider_id uuid unique, -- maps to Supabase auth.users.id
  status user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table client_profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references users(id) on delete cascade,
  company_name text not null,
  company_size text,
  industry text,
  website text,
  billing_address jsonb,
  verification_status verification_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table expert_profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references users(id) on delete cascade,
  headline text,
  bio text,
  years_experience int,
  hourly_rate numeric(12,2),
  project_rate_min numeric(12,2),
  currency text not null default 'INR',
  availability_status availability_status not null default 'available',
  verification_level verification_level not null default 'unverified',
  avg_rating numeric(3,2),          -- cached, recomputed by ReviewService
  total_projects_completed int not null default 0, -- cached
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  parent_category_id uuid references categories(id),
  is_active boolean not null default true
);

create table skills (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  category_id uuid references categories(id)
);

create table expert_skills (
  expert_id uuid not null references expert_profiles(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete cascade,
  proficiency_level proficiency_level not null default 'intermediate',
  years_experience int,
  primary key (expert_id, skill_id)
);

create table portfolio_items (
  id uuid primary key default uuid_generate_v4(),
  expert_id uuid not null references expert_profiles(id) on delete cascade,
  title text not null,
  description text,
  file_urls jsonb default '[]',
  project_url text,
  created_at timestamptz not null default now()
);

create table certifications (
  id uuid primary key default uuid_generate_v4(),
  expert_id uuid not null references expert_profiles(id) on delete cascade,
  title text not null,
  issuer text,
  issue_date date,
  credential_url text,
  verified boolean not null default false
);

create table verification_records (
  id uuid primary key default uuid_generate_v4(),
  expert_id uuid not null references expert_profiles(id) on delete cascade,
  level verification_level not null,
  reviewed_by_admin_id uuid references users(id),
  evidence_file_id uuid, -- fk added after `files` table exists (see ALTER below)
  status verification_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- ---------------------------------------------------------------------------
-- COMMISSION CONFIG (Section 15 — never hardcoded)
-- ---------------------------------------------------------------------------
create table commission_rules (
  id uuid primary key default uuid_generate_v4(),
  scope commission_scope not null default 'global',
  category_id uuid references categories(id),
  client_fee_pct numeric(5,2) not null default 10.00,
  expert_fee_pct numeric(5,2) not null default 0.00,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_by_admin_id uuid references users(id)
);

-- ---------------------------------------------------------------------------
-- PROJECTS
-- ---------------------------------------------------------------------------
create table projects (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references client_profiles(id),
  title text not null,
  description text not null,
  category_id uuid references categories(id),
  subcategory_id uuid references categories(id),
  budget_min numeric(12,2),
  budget_max numeric(12,2),
  currency text not null default 'INR',
  deadline date,
  status project_status not null default 'DRAFT',
  visibility project_visibility not null default 'public',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index idx_projects_client on projects(client_id);
create index idx_projects_status on projects(status);
create index idx_projects_category on projects(category_id);

create table project_requirements (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  required_skill_id uuid references skills(id),
  required_role_title text not null,
  is_mandatory boolean not null default true
);

create table project_roles (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  seats_available int not null default 1,
  budget_allocation numeric(12,2),
  status text not null default 'open' check (status in ('open', 'filled', 'cancelled'))
);
create index idx_project_roles_project on project_roles(project_id);

-- ---------------------------------------------------------------------------
-- APPLICATIONS & TEAM FORMATION
-- ---------------------------------------------------------------------------
create table project_applications (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  project_role_id uuid references project_roles(id),
  expert_id uuid not null references expert_profiles(id),
  status application_status not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_applications_project on project_applications(project_id);
create index idx_applications_expert on project_applications(expert_id);

create table proposals (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid not null unique references project_applications(id) on delete cascade,
  cover_letter text,
  proposed_rate numeric(12,2),
  proposed_availability text,
  estimated_duration text
);

create table project_teams (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null unique references projects(id) on delete cascade,
  status team_status not null default 'forming',
  created_at timestamptz not null default now()
);

create table team_members (
  id uuid primary key default uuid_generate_v4(),
  project_team_id uuid not null references project_teams(id) on delete cascade,
  expert_id uuid not null references expert_profiles(id),
  project_role_id uuid references project_roles(id),
  is_lead boolean not null default false,
  responsibilities text,
  compensation_amount numeric(12,2),
  contribution_pct numeric(5,2),
  status team_member_status not null default 'invited',
  joined_at timestamptz,
  completed_at timestamptz
);
create index idx_team_members_team on team_members(project_team_id);
create index idx_team_members_expert on team_members(expert_id);

-- ---------------------------------------------------------------------------
-- COLLABORATION (Project Room)
-- ---------------------------------------------------------------------------
create table milestones (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  deadline date,
  budget_allocation numeric(12,2),
  status milestone_status not null default 'pending',
  sequence_order int not null default 0
);
create index idx_milestones_project on milestones(project_id);

create table tasks (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  milestone_id uuid references milestones(id),
  title text not null,
  description text,
  assigned_expert_id uuid references expert_profiles(id),
  priority task_priority not null default 'medium',
  status task_status not null default 'todo',
  due_date date,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_tasks_project on tasks(project_id);
create index idx_tasks_assignee on tasks(assigned_expert_id);

create table task_comments (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_id uuid not null references users(id),
  content text not null,
  created_at timestamptz not null default now()
);

create table files (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  uploaded_by uuid not null references users(id),
  category file_category not null default 'other',
  storage_path text not null, -- Supabase Storage key, never a public URL by default
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  version int not null default 1,
  parent_file_id uuid references files(id),
  created_at timestamptz not null default now()
);
create index idx_files_project on files(project_id);

alter table verification_records
  add constraint fk_verification_evidence_file foreign key (evidence_file_id) references files(id);

create table deliverables (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  milestone_id uuid references milestones(id),
  submitted_by uuid not null references expert_profiles(id),
  title text not null,
  description text,
  file_id uuid references files(id),
  status deliverable_status not null default 'submitted',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index idx_deliverables_milestone on deliverables(milestone_id);

create table conversations (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  type conversation_type not null default 'team_wide',
  created_at timestamptz not null default now()
);

create table conversation_participants (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (conversation_id, user_id)
);

create table messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references users(id),
  content text not null,
  attachment_file_id uuid references files(id),
  created_at timestamptz not null default now()
);
create index idx_messages_conversation on messages(conversation_id, created_at);

create table message_reads (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table meetings (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  meeting_provider meeting_provider not null default 'zoom',
  provider_meeting_id text,
  provider_join_url text,
  created_by uuid not null references users(id),
  status meeting_status not null default 'scheduled',
  notes text
);
create index idx_meetings_project on meetings(project_id);

create table meeting_participants (
  meeting_id uuid not null references meetings(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  rsvp_status rsvp_status not null default 'pending',
  primary key (meeting_id, user_id)
);

create table action_items (
  id uuid primary key default uuid_generate_v4(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  description text not null,
  assigned_to uuid references users(id),
  due_date date,
  status action_item_status not null default 'open'
);

-- ---------------------------------------------------------------------------
-- PAYMENTS (append-only ledger)
-- ---------------------------------------------------------------------------
create table project_funding (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id),
  amount numeric(12,2) not null,
  currency text not null default 'INR',
  funded_by uuid not null references client_profiles(id),
  payment_provider payment_provider not null default 'razorpay',
  provider_reference_id text,
  status funding_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id),
  milestone_id uuid references milestones(id),
  type transaction_type not null,
  amount numeric(12,2) not null,
  currency text not null default 'INR',
  from_party text,
  to_party text,
  related_transaction_id uuid references transactions(id),
  provider_reference_id text,
  status transaction_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index idx_transactions_project on transactions(project_id);

create table payouts (
  id uuid primary key default uuid_generate_v4(),
  expert_id uuid not null references expert_profiles(id),
  project_id uuid not null references projects(id),
  amount numeric(12,2) not null,
  currency text not null default 'INR',
  status payout_status not null default 'pending',
  provider_reference_id text,
  paid_at timestamptz
);

create table invoices (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id),
  issued_to uuid not null references users(id),
  amount numeric(12,2) not null,
  currency text not null default 'INR',
  pdf_file_id uuid references files(id),
  issued_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- REPUTATION, NOTIFICATIONS, ADMIN
-- ---------------------------------------------------------------------------
create table reviews (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id),
  reviewer_id uuid not null references users(id),
  reviewee_id uuid not null references users(id),
  quality_rating smallint check (quality_rating between 1 and 5),
  communication_rating smallint check (communication_rating between 1 and 5),
  reliability_rating smallint check (reliability_rating between 1 and 5),
  technical_rating smallint check (technical_rating between 1 and 5),
  collaboration_rating smallint check (collaboration_rating between 1 and 5),
  timeliness_rating smallint check (timeliness_rating between 1 and 5),
  overall_rating numeric(3,2), -- computed average, cached
  comment text,
  created_at timestamptz not null default now(),
  unique (project_id, reviewer_id, reviewee_id) -- prevents duplicate/manipulated reviews
);

create table notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  type notification_type not null,
  payload jsonb not null default '{}',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_notifications_user on notifications(user_id, read);

create table disputes (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id),
  raised_by uuid not null references users(id),
  against uuid references users(id),
  reason text not null,
  status dispute_status not null default 'open',
  resolution text,
  resolved_by_admin_id uuid references users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table dispute_evidence (
  id uuid primary key default uuid_generate_v4(),
  dispute_id uuid not null references disputes(id) on delete cascade,
  file_id uuid references files(id),
  message text,
  submitted_by uuid not null references users(id)
);

create table audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references users(id), -- null for system actions
  action text not null,               -- e.g. "project.status_changed"
  entity_type text not null,
  entity_id uuid,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);
create index idx_audit_logs_entity on audit_logs(entity_type, entity_id);
create index idx_audit_logs_actor on audit_logs(actor_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_users_updated before update on users for each row execute function set_updated_at();
create trigger trg_client_profiles_updated before update on client_profiles for each row execute function set_updated_at();
create trigger trg_expert_profiles_updated before update on expert_profiles for each row execute function set_updated_at();
create trigger trg_projects_updated before update on projects for each row execute function set_updated_at();
create trigger trg_applications_updated before update on project_applications for each row execute function set_updated_at();
create trigger trg_tasks_updated before update on tasks for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed: default global commission rule (Section 15)
-- ---------------------------------------------------------------------------
insert into commission_rules (scope, client_fee_pct, expert_fee_pct)
values ('global', 10.00, 0.00);
