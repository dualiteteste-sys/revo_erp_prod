-- Placeholder migration to reconcile remote migration history.
--
-- Context:
-- - The DEV database has an entry for migration version 20270127120001 in
--   supabase_migrations.schema_migrations.
-- - This repo previously did not contain the corresponding migration file,
--   causing `supabase db push` (and CI "Verify Migrations") to fail with:
--     "Remote migration versions not found in local migrations directory."
--
-- This migration is intentionally a NO-OP.
select 1;

