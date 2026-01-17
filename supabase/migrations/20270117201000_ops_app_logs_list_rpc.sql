/*
  P1 (boot sem 403): remover acesso direto a public.app_logs do frontend.
  - Cria RPC best-effort que retorna [] sem erro para usuários sem permissão.
  - Evita 403 no dashboard (console limpo) e mantém o isolamento por empresa.
*/

BEGIN;

DROP FUNCTION IF EXISTS public.ops_app_logs_list(int);
CREATE OR REPLACE FUNCTION public.ops_app_logs_list(
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
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 12), 0), 100);
BEGIN
  -- Se não houver empresa ativa, não falhar o dashboard.
  IF v_empresa_id IS NULL THEN
    RETURN;
  END IF;

  -- Best-effort: logs são recurso de suporte/ops. Se não tiver permissão, retorna vazio.
  IF NOT public.has_permission_for_current_user('logs', 'view') THEN
    RETURN;
  END IF;

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

REVOKE ALL ON FUNCTION public.ops_app_logs_list(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_app_logs_list(int) TO authenticated, service_role;

COMMIT;

