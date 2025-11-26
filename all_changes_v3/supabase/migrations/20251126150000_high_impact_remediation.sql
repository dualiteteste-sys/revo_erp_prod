-- Migration: High-Impact Remediation
-- Description: Standardizes RLS policies, enforces FK constraints, fixes function search paths, and adds compound indexes.
-- Author: Antigravity
-- Date: 2025-11-26

-- 1. RLS Standardization: Create missing policies for tenant-aware tables
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
        -- Check if policies exist (simplistic check: if 0 policies, create defaults)
        IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = (quote_ident(r.tablename))::regclass) THEN
            
            -- Enable RLS just in case
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);

            -- SELECT
            EXECUTE format('CREATE POLICY "policy_select" ON public.%I FOR SELECT USING (empresa_id = public.current_empresa_id());', r.tablename);
            
            -- INSERT
            EXECUTE format('CREATE POLICY "policy_insert" ON public.%I FOR INSERT WITH CHECK (empresa_id = public.current_empresa_id());', r.tablename);
            
            -- UPDATE
            EXECUTE format('CREATE POLICY "policy_update" ON public.%I FOR UPDATE USING (empresa_id = public.current_empresa_id()) WITH CHECK (empresa_id = public.current_empresa_id());', r.tablename);
            
            -- DELETE
            EXECUTE format('CREATE POLICY "policy_delete" ON public.%I FOR DELETE USING (empresa_id = public.current_empresa_id());', r.tablename);
            
            RAISE NOTICE 'Created standard RLS policies for %', r.tablename;
        END IF;
    END LOOP;
END;
$$;

-- 2. Function Search Path: Fix SECURITY DEFINER functions
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT p.proname, oidvectortypes(p.proargtypes) as args, p.prokind
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef = true -- SECURITY DEFINER only
    LOOP
        -- Set search_path to safe default
        IF r.prokind = 'p' THEN
            EXECUTE format('ALTER PROCEDURE public.%I(%s) SET search_path = pg_catalog, public;', r.proname, r.args);
        ELSIF r.prokind = 'f' OR r.prokind = 'w' THEN
            EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = pg_catalog, public;', r.proname, r.args);
        END IF;
    END LOOP;
END;
$$;

-- 3. Compound Indexes: (empresa_id, status, created_at)
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT t.tablename
        FROM pg_tables t
        JOIN information_schema.columns c1 ON c1.table_name = t.tablename AND c1.column_name = 'empresa_id'
        JOIN information_schema.columns c2 ON c2.table_name = t.tablename AND c2.column_name = 'status'
        JOIN information_schema.columns c3 ON c3.table_name = t.tablename AND c3.column_name = 'created_at'
        WHERE t.schemaname = 'public'
    LOOP
        -- Create index if not exists
        EXECUTE format('CREATE INDEX IF NOT EXISTS "idx_%s_empresa_status_created" ON public.%I (empresa_id, status, created_at);', r.tablename, r.tablename);
        RAISE NOTICE 'Created compound index for %', r.tablename;
    END LOOP;
END;
$$;

-- 4. FK Constraints: Enforce ON DELETE RESTRICT (Safe Default)
-- Note: This is invasive. We only target FKs with NO ACTION (default) and change them to RESTRICT.
-- We skip CASCADE candidates to avoid accidental data loss; those should be manual.
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
          AND rc.delete_rule = 'NO ACTION' -- Target only default behavior
          AND tc.table_schema = 'public'
    LOOP
        -- Drop and Recreate with ON DELETE RESTRICT
        -- This is safer than CASCADE but prevents orphans.
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I;', r.table_name, r.constraint_name);
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I (%I) ON DELETE RESTRICT;', 
            r.table_name, r.constraint_name, r.column_name, r.foreign_table_name, r.foreign_column_name);
            
        RAISE NOTICE 'Updated FK % on % to ON DELETE RESTRICT', r.constraint_name, r.table_name;
    END LOOP;
END;
$$;
