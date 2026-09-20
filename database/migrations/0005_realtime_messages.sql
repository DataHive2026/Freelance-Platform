-- ============================================================================
-- DataHive — enable Realtime on messages
-- Supabase requires a table to be explicitly added to the
-- supabase_realtime publication before postgres_changes subscriptions
-- work on it — RLS alone (see 0002_auth_integration.sql's
-- "messages_read_if_participant" policy) controls WHO can subscribe,
-- this controls WHETHER the table broadcasts changes at all.
-- ============================================================================

alter publication supabase_realtime add table messages;
