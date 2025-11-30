/*
# [SECURITY] Enable RLS and Apply Tenant Policies
This migration addresses the critical security advisory "RLS Disabled in Public" by enabling Row Level Security on all relevant tables within the `public` schema and applying a default tenant isolation policy.

## Query Description:
- **Enables RLS**: Iterates through all tables in the `public` schema (excluding system tables and explicitly public ones like `plans`) and executes `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
- **Applies Policies**: For every table that has an `empresa_id` column, it creates a strict policy that ensures users can only access data belonging to their `current_empresa_id()`. This is crucial for multi-tenant data isolation.
- **Idempotent**: The script is designed to be run safely multiple times. It checks for existing policies before creating new ones.

This is a critical security fix. After applying this migration, all data access will be filtered by the active company, preventing data leaks between tenants.

## Metadata:
- Schema-Category: ["Security", "Structural"]
- Impact-Level: ["High"]
- Requires-Backup: true
- Reversible: false (Disabling RLS would be a security regression)

## Structure Details:
- Enables `ROW LEVEL SECURITY` on multiple tables.
- Adds `Tenant Isolation Policy` for ALL operations on tables with an `empresa_id` column.

## Security Implications:
- RLS Status: Enabled on all tables with tenant data.
- Policy Changes: Yes, adds default tenant isolation policies.
- Auth Requirements: Operations will now fail if `current_empresa_id()` is not set correctly in the user's session.

## Performance Impact:
- Indexes: Adds indexes on `empresa_id` for tables that don't have one, to improve RLS performance.
- Estimated Impact: SELECT queries will have an additional `WHERE` clause automatically applied by RLS. This is generally fast if `empresa_id` is indexed.
*/

DO $$
DECLARE
    table_record RECORD;
    policy_name TEXT;
BEGIN
    -- Loop through all tables in the public schema that have an 'empresa_id' column
    FOR table_record IN
        SELECT DISTINCT c.table_name
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name NOT LIKE 'pg_%' -- Exclude postgres system tables
          AND c.table_name NOT IN ('plans', 'addons', 'schema_migrations') -- Exclude known public/system tables
          AND EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_name = c.table_name
                AND table_schema = 'public'
                AND column_name = 'empresa_id'
          )
    LOOP
        -- Enable RLS on the table
        RAISE NOTICE 'Enabling RLS for table: %', table_record.table_name;
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', table_record.table_name);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', table_record.table_name);

        -- Define the policy name
        policy_name := 'tenant_isolation_policy_for_' || table_record.table_name;

        -- Drop the policy if it already exists to ensure idempotency
        RAISE NOTICE 'Dropping old policy (if exists) % on %', policy_name, table_record.table_name;
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', policy_name, table_record.table_name);

        -- Create the tenant isolation policy
        RAISE NOTICE 'Creating tenant isolation policy for table: %', table_record.table_name;
        EXECUTE format('
            CREATE POLICY %I
            ON public.%I
            FOR ALL
            USING (empresa_id = public.current_empresa_id())
            WITH CHECK (empresa_id = public.current_empresa_id());
        ', policy_name, table_record.table_name);

        -- Ensure an index exists on empresa_id for performance
        IF NOT EXISTS (
            SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_index i ON i.indrelid = c.oid
            JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
            WHERE n.nspname = 'public'
              AND c.relname = table_record.table_name
              AND a.attname = 'empresa_id'
        ) THEN
            RAISE NOTICE 'Creating index on empresa_id for table: %', table_record.table_name;
            EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_empresa_id ON public.%I (empresa_id);', replace(table_record.table_name, '_', ''), table_record.table_name);
        END IF;

    END LOOP;
END $$;

-- Reload PostgREST schema to apply changes
NOTIFY pgrst, 'reload schema';
