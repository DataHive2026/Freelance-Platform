-- ============================================================================
-- DataHive — project files storage bucket
-- ============================================================================
-- Deliberately private, and deliberately WITHOUT storage.objects RLS
-- policies matching project membership. Access control for this bucket
-- lives entirely in lib/services/files/index.ts, which calls
-- AuthzService.can() before ever touching Storage, then uses the
-- service-role client (lib/supabase/service-role.ts) to generate signed
-- URLs. Writing an equivalent RLS policy here would mean maintaining
-- the same authorization rule in two places — SQL and TypeScript —
-- that could drift apart silently. One source of truth (AuthzService)
-- is safer than two that are supposed to agree.

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;
