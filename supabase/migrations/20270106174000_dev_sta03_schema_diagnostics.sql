/*
  DEV-STA-03 — Diagnóstico de schema/RPC (drift, migrations, cache)

  Motivo
  - Quando ocorre drift ou migrations pendentes, o app quebra com 404/300 em RPCs e "schema cache".
  - Precisamos de uma tela interna (Dev) para ver rapidamente o estado do banco e forçar um reload do cache do PostgREST.

  Impacto
  - Adiciona 2 RPCs internas (ops) e não altera dados de negócio.

  Reversibilidade
  - Reversível removendo as funções.
*/

BEGIN;

DROP FUNCTION IF EXISTS public.dev_schema_diagnostics(integer);
CREATE OR REPLACE FUNCTION public.dev_schema_diagnostics(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
BEGIN
  PERFORM public.require_permission_for_current_user('ops','view');

  RETURN jsonb_build_object(
    'now', now(),
    'db', current_database(),
    'migrations', COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(x) ORDER BY x.version DESC)
        FROM (
          SELECT sm.version
          FROM supabase_migrations.schema_migrations sm
          ORDER BY sm.version DESC
          LIMIT v_limit
        ) x
      ),
      '[]'::jsonb
    ),
    'functions_public', (
      SELECT COUNT(*)::int
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
    ),
    'views_public', (
      SELECT COUNT(*)::int
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'v'
    ),
    'overloaded_public', COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(x) ORDER BY x.proname)
        FROM (
          SELECT p.proname, COUNT(*)::int AS overloads
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
          GROUP BY p.proname
          HAVING COUNT(*) > 1
          ORDER BY p.proname
          LIMIT 50
        ) x
      ),
      '[]'::jsonb
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dev_schema_diagnostics(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dev_schema_diagnostics(integer) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.dev_postgrest_reload();
CREATE OR REPLACE FUNCTION public.dev_postgrest_reload()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('ops','manage');
  -- PostgREST listens to NOTIFY pgrst, 'reload schema' (and 'reload config').
  PERFORM pg_notify('pgrst', 'reload schema');
  PERFORM pg_notify('pgrst', 'reload config');
END;
$$;

REVOKE ALL ON FUNCTION public.dev_postgrest_reload() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dev_postgrest_reload() TO authenticated, service_role;

COMMIT;

