-- Migration: Architectural Hardening
-- Description: Enables RLS on all tables, creates deny-all policies, ensures FK indexes, and locks down RPCs.
-- Author: Antigravity
-- Date: 2025-11-26

-- 1. Enable RLS on ALL public tables
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
    END LOOP;
END;
$$;

-- 2. Create deny_all_explicit policy for tables with RLS but no policies
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

-- 3. Ensure Leading FK Indexes (using existing helper)
-- This assumes public.ensure_leading_fk_indexes() exists from previous migrations.
-- If not, we could recreate it, but it should be there.
SELECT public.ensure_leading_fk_indexes();

-- 4. Lockdown RPCs (Revoke Public, Grant Authenticated)
-- This iterates over all functions in public and ensures they are not executable by PUBLIC (anon),
-- unless explicitly intended (which usually they aren't in this architecture).
-- We exclude standard PostGIS/Supabase functions if necessary, but usually 'public' schema functions are ours.
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT p.proname, oidvectortypes(p.proargtypes) as args, p.prokind
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
    LOOP
        -- Use ROUTINE to handle both FUNCTION and PROCEDURE
        -- Or dynamically switch based on prokind ('f' = function, 'p' = procedure, 'a' = aggregate, 'w' = window)
        -- We only care about 'f' and 'p' for EXECUTE permissions usually.
        
        IF r.prokind = 'p' THEN
            EXECUTE format('REVOKE EXECUTE ON PROCEDURE public.%I(%s) FROM PUBLIC;', r.proname, r.args);
            EXECUTE format('GRANT EXECUTE ON PROCEDURE public.%I(%s) TO authenticated, service_role;', r.proname, r.args);
        ELSIF r.prokind = 'f' OR r.prokind = 'w' THEN
            EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC;', r.proname, r.args);
            EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role;', r.proname, r.args);
        END IF;
        
    END LOOP;
END;
$$;
