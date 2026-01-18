/*
  P0.2 (ops não pode vazar para telas de usuário final):
  - Cria um feed "seguro" de atividades do tenant para o dashboard (sem usar ops_*).
  - Evita 403/42501 por permissão de ops/logs e mantém console limpo.
*/

BEGIN;

DROP FUNCTION IF EXISTS public.dashboard_activity_feed(int);

CREATE OR REPLACE FUNCTION public.dashboard_activity_feed(
  p_limit int DEFAULT 12
)
RETURNS TABLE(
  id uuid,
  level text,
  source text,
  event text,
  message text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 12), 0), 50);
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode = '42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('member');

  RETURN QUERY
  SELECT
    a.id,
    a.level,
    a.source,
    a.event,
    a.message,
    a.created_at
  FROM public.app_logs a
  WHERE a.empresa_id = v_empresa_id
  ORDER BY a.created_at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_activity_feed(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_activity_feed(int) TO authenticated, service_role;

COMMIT;

