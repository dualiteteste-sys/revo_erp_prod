/*
  OPS-403: export sample (P0.1)
  - Retorna um JSONB com os últimos eventos 403 da empresa atual para colar no chat.
*/

BEGIN;

DROP FUNCTION IF EXISTS public.ops_403_events_export_sample(int, boolean);

CREATE OR REPLACE FUNCTION public.ops_403_events_export_sample(
  p_limit int DEFAULT 10,
  p_only_open boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('ops','view');

  RETURN COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT
          e.created_at,
          e.request_id,
          e.route,
          e.rpc_fn,
          e.http_status,
          e.code,
          e.kind,
          e.message,
          e.details,
          e.plano_mvp,
          e.role,
          e.recovery_attempted,
          e.recovery_ok,
          e.resolved
        FROM public.ops_403_events e
        WHERE e.empresa_id = public.current_empresa_id()
          AND (NOT p_only_open OR e.resolved = false)
        ORDER BY e.created_at DESC
        LIMIT GREATEST(p_limit, 1)
      ) x
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ops_403_events_export_sample(int, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_403_events_export_sample(int, boolean) TO authenticated, service_role;

COMMIT;

