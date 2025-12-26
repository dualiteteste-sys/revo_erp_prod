/*
  RBAC: Enforcement de permissões no banco (Relatórios de Serviços / OS)
*/

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.os_relatorios_resumo(date, date)') IS NOT NULL
     AND to_regprocedure('public.os_relatorios_resumo__unsafe(date, date)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.os_relatorios_resumo(date, date) RENAME TO os_relatorios_resumo__unsafe';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.os_relatorios_resumo(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('relatorios_servicos','view');
  RETURN public.os_relatorios_resumo__unsafe(p_start_date, p_end_date);
END;
$$;

REVOKE ALL ON FUNCTION public.os_relatorios_resumo(date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.os_relatorios_resumo(date, date) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.os_relatorios_list(date, date, text, public.status_os[], uuid, int, int)') IS NOT NULL
     AND to_regprocedure('public.os_relatorios_list__unsafe(date, date, text, public.status_os[], uuid, int, int)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.os_relatorios_list(date, date, text, public.status_os[], uuid, int, int) RENAME TO os_relatorios_list__unsafe';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.os_relatorios_list(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_status public.status_os[] DEFAULT NULL,
  p_cliente_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  numero bigint,
  descricao text,
  status public.status_os,
  data_ref date,
  cliente_nome text,
  total_geral numeric,
  custo_real numeric,
  margem numeric,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('relatorios_servicos','view');
  RETURN QUERY
  SELECT *
  FROM public.os_relatorios_list__unsafe(p_start_date, p_end_date, p_search, p_status, p_cliente_id, p_limit, p_offset);
END;
$$;

REVOKE ALL ON FUNCTION public.os_relatorios_list(date, date, text, public.status_os[], uuid, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.os_relatorios_list(date, date, text, public.status_os[], uuid, int, int) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

