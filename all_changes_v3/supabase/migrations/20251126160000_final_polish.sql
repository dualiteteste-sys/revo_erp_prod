-- Migration: Final Polish (User Feedback)
-- Description: Addresses remaining high-impact gaps: Search Path, Public Grants, FK Constraints, Strict RLS.
-- Author: Antigravity
-- Date: 2025-11-26

-- 1. Fix Search Path for SECURITY DEFINER functions (Targeting the ~39 missing ones)
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT p.proname, oidvectortypes(p.proargtypes) as args, p.prokind
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef = true -- SECURITY DEFINER
          AND (p.proconfig IS NULL OR NOT 'search_path=pg_catalog, public' = ANY(p.proconfig)) -- Missing safe search_path
    LOOP
        IF r.prokind = 'p' THEN
            EXECUTE format('ALTER PROCEDURE public.%I(%s) SET search_path = pg_catalog, public;', r.proname, r.args);
        ELSIF r.prokind = 'f' OR r.prokind = 'w' THEN
            EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = pg_catalog, public;', r.proname, r.args);
        END IF;
        RAISE NOTICE 'Fixed search_path for %', r.proname;
    END LOOP;
END;
$$;

-- 2. Revoke Public Grants (Targeting the ~5 remaining cases)
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
        -- Revoke ALL from PUBLIC to be sure
        IF r.prokind = 'p' THEN
            EXECUTE format('REVOKE ALL ON PROCEDURE public.%I(%s) FROM PUBLIC;', r.proname, r.args);
            EXECUTE format('GRANT EXECUTE ON PROCEDURE public.%I(%s) TO authenticated, service_role;', r.proname, r.args);
        ELSIF r.prokind = 'f' OR r.prokind = 'w' THEN
            EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC;', r.proname, r.args);
            EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role;', r.proname, r.args);
        END IF;
    END LOOP;
END;
$$;

-- 3. Fix FKs: Enforce ON DELETE RESTRICT (Targeting the ~14 NO ACTION)
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT
            tc.table_name, 
            kcu.column_name, 
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name,
            rc.constraint_name
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints AS rc
          ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND rc.delete_rule = 'NO ACTION' -- Target default behavior
          AND tc.table_schema = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I;', r.table_name, r.constraint_name);
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I (%I) ON DELETE RESTRICT;', 
            r.table_name, r.constraint_name, r.column_name, r.foreign_table_name, r.foreign_column_name);
            
        RAISE NOTICE 'Fixed FK % on % to ON DELETE RESTRICT', r.constraint_name, r.table_name;
    END LOOP;
END;
$$;

-- 4. Enforce Strict Deny-All Policies
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname = 'deny_all_explicit'
    LOOP
        -- Drop existing loose deny_all
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', r.policyname, r.tablename);
        
        -- Recreate strict deny_all
        EXECUTE format('CREATE POLICY "deny_all_explicit" ON public.%I FOR ALL USING (false) WITH CHECK (false);', r.tablename);
        RAISE NOTICE 'Enforced strict deny_all_explicit for %', r.tablename;
    END LOOP;
END;
$$;

-- 5. Ensure 100% Tenant Predicate Coverage (Re-run standardizer to catch any gaps)
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT t.tablename
        FROM pg_tables t
        JOIN information_schema.columns c ON c.table_name = t.tablename AND c.table_schema = 'public'
        WHERE t.schemaname = 'public'
          AND c.column_name = 'empresa_id'
    LOOP
        -- If policies are missing, create them (same logic as before, but ensures 100% coverage)
        IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = (quote_ident(r.tablename))::regclass AND polname = 'policy_select') THEN
             EXECUTE format('CREATE POLICY "policy_select" ON public.%I FOR SELECT USING (empresa_id = public.current_empresa_id());', r.tablename);
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = (quote_ident(r.tablename))::regclass AND polname = 'policy_insert') THEN
             EXECUTE format('CREATE POLICY "policy_insert" ON public.%I FOR INSERT WITH CHECK (empresa_id = public.current_empresa_id());', r.tablename);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = (quote_ident(r.tablename))::regclass AND polname = 'policy_update') THEN
             EXECUTE format('CREATE POLICY "policy_update" ON public.%I FOR UPDATE USING (empresa_id = public.current_empresa_id()) WITH CHECK (empresa_id = public.current_empresa_id());', r.tablename);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = (quote_ident(r.tablename))::regclass AND polname = 'policy_delete') THEN
             EXECUTE format('CREATE POLICY "policy_delete" ON public.%I FOR DELETE USING (empresa_id = public.current_empresa_id());', r.tablename);
        END IF;
    END LOOP;
END;
$$;
