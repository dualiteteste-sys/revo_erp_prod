-- =============================================================================
-- Serviços: listagem v2 + contagem (paginação real)
-- - Mantém RPC legada `list_services_for_current_user(...)`
-- - Adiciona:
--   - `list_services_for_current_user_v2(p_search, p_status, p_limit, p_offset, p_order_by, p_order_dir)`
--   - `count_services_for_current_user(p_search, p_status)`
-- =============================================================================

BEGIN;

-- LIST v2 (com filtro de status e busca ampliada)
DROP FUNCTION IF EXISTS public.list_services_for_current_user_v2(text, public.status_servico, int, int, text, text);
CREATE OR REPLACE FUNCTION public.list_services_for_current_user_v2(
  p_search text default null,
  p_status public.status_servico default null,
  p_limit  int  default 50,
  p_offset int  default 0,
  p_order_by text default 'descricao',
  p_order_dir text default 'asc'
)
RETURNS SETOF public.servicos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_sql text;
  v_order_by text := lower(coalesce(p_order_by, 'descricao'));
  v_order_dir text := case when lower(p_order_dir) = 'desc' then 'desc' else 'asc' end;
  v_order_col text;
BEGIN
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION '[RPC][LIST_SERVICES_V2] Nenhuma empresa ativa encontrada' USING errcode = '42501';
  END IF;

  v_order_col := CASE
    WHEN v_order_by IN ('descricao','codigo','preco_venda','unidade','status','created_at','updated_at') THEN v_order_by
    ELSE 'descricao'
  END;

  v_sql := format($q$
    SELECT *
    FROM public.servicos
    WHERE empresa_id = $1
      %s
      %s
    ORDER BY %I %s
    LIMIT $2 OFFSET $3
  $q$,
    CASE
      WHEN p_search IS NULL OR btrim(p_search) = '' THEN ''
      ELSE 'AND (descricao ILIKE ''%''||$4||''%'' OR coalesce(codigo, '''') ILIKE ''%''||$4||''%'' OR coalesce(codigo_servico, '''') ILIKE ''%''||$4||''%'' OR coalesce(nbs, '''') ILIKE ''%''||$4||''%'')'
    END,
    CASE
      WHEN p_status IS NULL THEN ''
      ELSE 'AND status = $5'
    END,
    v_order_col,
    v_order_dir
  );

  RETURN QUERY EXECUTE v_sql USING
    v_empresa_id, greatest(p_limit, 0), greatest(p_offset, 0),
    CASE WHEN p_search IS NULL THEN NULL ELSE p_search END,
    p_status;
END;
$$;

REVOKE ALL ON FUNCTION public.list_services_for_current_user_v2(text, public.status_servico, int, int, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.list_services_for_current_user_v2(text, public.status_servico, int, int, text, text) TO authenticated, service_role;

-- COUNT (paginação real)
DROP FUNCTION IF EXISTS public.count_services_for_current_user(text, public.status_servico);
CREATE OR REPLACE FUNCTION public.count_services_for_current_user(
  p_search text default null,
  p_status public.status_servico default null
)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT count(*)
  FROM public.servicos s
  WHERE s.empresa_id = public.current_empresa_id()
    AND (
      p_search IS NULL OR btrim(p_search) = ''
      OR s.descricao ILIKE '%' || p_search || '%'
      OR coalesce(s.codigo, '') ILIKE '%' || p_search || '%'
      OR coalesce(s.codigo_servico, '') ILIKE '%' || p_search || '%'
      OR coalesce(s.nbs, '') ILIKE '%' || p_search || '%'
    )
    AND (
      p_status IS NULL OR s.status = p_status
    );
$$;

REVOKE ALL ON FUNCTION public.count_services_for_current_user(text, public.status_servico) FROM public;
GRANT EXECUTE ON FUNCTION public.count_services_for_current_user(text, public.status_servico) TO authenticated, service_role;

COMMIT;

