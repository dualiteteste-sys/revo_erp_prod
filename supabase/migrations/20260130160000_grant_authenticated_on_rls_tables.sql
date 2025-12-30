-- Description: Ensure authenticated has privileges on RLS-enabled objects (prevents HTTP 403 due to missing GRANT).
-- Safe: only grants on tables that already have RLS enabled.

DO $$
DECLARE
  r record;
BEGIN
  -- Schema usage (idempotent)
  EXECUTE 'GRANT USAGE ON SCHEMA public TO authenticated';

  -- Tables: grant only where RLS is enabled, so access still obeys policies.
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity IS TRUE
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I.%I TO authenticated',
      r.schema_name,
      r.table_name
    );
  END LOOP;

  -- Sequences (needed for inserts on serial/identity-backed columns)
  FOR r IN
    SELECT sequence_schema AS schema_name, sequence_name AS sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format(
      'GRANT USAGE, SELECT, UPDATE ON SEQUENCE %I.%I TO authenticated',
      r.schema_name,
      r.sequence_name
    );
  END LOOP;
END $$;

