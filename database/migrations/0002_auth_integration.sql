-- ============================================================================
-- DataHive — Auth integration
-- Bridges Supabase Auth (auth.users) to our application-level users table.
-- Standard Supabase pattern: a trigger on auth.users creates the matching
-- public.users row in the same transaction, so it's guaranteed to exist
-- by the time signUp()/signInWithPassword() resolves in application code.
-- ============================================================================

create or replace function public.handle_new_auth_user()
returns trigger
security definer set search_path = public
as $$
begin
  insert into public.users (email, user_type, auth_provider_id, status)
  values (
    new.email,
    coalesce(new.raw_user_meta_data->>'user_type', 'client')::user_type,
    new.id,
    'active'
  );
  return new;
end;
$$ language plpgsql;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Row Level Security — Supabase Postgres defaults to RLS-off for tables
-- created via SQL editor, but every table touched by the browser client
-- (chat/Realtime) needs it on. Server-side access goes through the
-- service-role key in lib/supabase/server.ts and bypasses RLS entirely,
-- which is fine — AuthzService.can() is the real gate for server-side
-- access. RLS here is a second, coarser backstop specifically for any
-- future direct-from-browser Realtime subscription (e.g. chat).
alter table public.users enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

create policy "users_read_own" on public.users
  for select using (auth_provider_id = auth.uid());

create policy "notifications_read_own" on public.notifications
  for select using (
    user_id = (select id from public.users where auth_provider_id = auth.uid())
  );

create policy "messages_read_if_participant" on public.messages
  for select using (
    exists (
      select 1 from public.conversation_participants cp
      join public.users u on u.id = cp.user_id
      where cp.conversation_id = messages.conversation_id
        and u.auth_provider_id = auth.uid()
    )
  );
