-- prelude mínimo para rodar baseline no VERIFY
create schema if not exists audit;

-- Stub para current_empresa_id caso seja necessário por defaults
create or replace function public.current_empresa_id()
returns uuid
language sql
stable
set search_path = pg_catalog, public
as $$ select null::uuid $$;

-- Stub para current_user_id caso seja necessário por defaults
create or replace function public.current_user_id()
returns uuid
language sql
stable
set search_path = pg_catalog, public
as $$ select null::uuid $$;

-- Mock para audit.events e função relacionada para evitar erro no baseline
create table if not exists audit.events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id uuid,
  empresa_id uuid,
  source text,
  table_name text,
  record_id text,
  operation text,
  old_data jsonb,
  new_data jsonb,
  changed_fields text[]
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'audit' 
        AND p.proname = 'list_events_for_current_user'
    ) THEN
        EXECUTE '
            create function audit.list_events_for_current_user(
              p_from timestamptz,
              p_to timestamptz,
              p_source text[],
              p_table text[],
              p_op text[],
              p_q text,
              p_after timestamptz,
              p_limit int
            ) returns setof audit.events
            language sql stable
            as $func$
              select * from audit.events limit p_limit;
            $func$;
        ';
    END IF;
END $$;
