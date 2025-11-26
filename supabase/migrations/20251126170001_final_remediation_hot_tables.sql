-- Migration: Final Remediation Part 2 (Hot Tables)
-- Description: Applies policies to hot tables (empresas, profiles). Separated to avoid deadlocks.
-- Author: Antigravity
-- Date: 2025-11-26

-- 1. Lock down Hot Global Tables (Restricted)
DO $$
DECLARE
    tbl text;
    restricted_tables text[] := ARRAY['empresas', 'profiles'];
BEGIN
    FOREACH tbl IN ARRAY restricted_tables
    LOOP
        -- Drop existing policies that might conflict
        EXECUTE format('DROP POLICY IF EXISTS "policy_deny_insert_delete" ON public.%I;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "policy_deny_insert" ON public.%I;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "policy_deny_delete" ON public.%I;', tbl);
        
        -- Enable RLS
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        
        -- Deny Insert/Delete
        EXECUTE format('CREATE POLICY "policy_deny_insert" ON public.%I FOR INSERT WITH CHECK (false);', tbl);
        EXECUTE format('CREATE POLICY "policy_deny_delete" ON public.%I FOR DELETE USING (false);', tbl);
        
        RAISE NOTICE 'Locked down global table (Restricted): %', tbl;
    END LOOP;
END;
$$;
