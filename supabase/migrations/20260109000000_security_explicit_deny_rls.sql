/*
  # Security: Explicit Deny-All Policies
  
  Creates explicit "deny_all" policies for tables that have RLS enabled but no policies defined.
  This addresses the Supabase Security Advisory "[INFO] RLS Enabled No Policy".
  
  ## Query Description:
  Scans all tables in the 'public' schema. If a table has Row Level Security (RLS) enabled
  but has zero policies associated with it, this script creates a policy named "deny_all_explicit"
  that rejects all operations (SELECT, INSERT, UPDATE, DELETE) for everyone.
  
  ## Metadata:
  - Schema-Category: "Security"
  - Impact-Level: "Low" (Formalizes existing default behavior)
  - Requires-Backup: false
  - Reversible: true (DROP POLICY ...)
  
  ## Security Implications:
  - RLS Status: Remains Enabled
  - Policy Changes: Adds policies to tables currently without them.
  - Auth Requirements: None (Applies to all roles)
*/

DO $$
DECLARE
  row record;
BEGIN
  FOR row IN
    SELECT
      n.nspname,
      c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r' -- tables only
      AND c.relrowsecurity = true -- RLS enabled
      AND NOT EXISTS (
        SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
      )
  LOOP
    EXECUTE format('CREATE POLICY "deny_all_explicit" ON %I.%I FOR ALL USING (false);', row.nspname, row.relname);
    RAISE NOTICE 'Created deny_all_explicit policy for %.%', row.nspname, row.relname;
  END LOOP;
END;
$$;
