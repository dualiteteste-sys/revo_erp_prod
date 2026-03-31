/*
  MELI-PHASE5-ORDERS-RPC

  Nova RPC meli_orders_list: lista pedidos importados do Mercado Livre
  com dados da ecommerce_order_links (external_order_id, ml_status).
*/

BEGIN;

-- ---------------------------------------------------------------------------
-- meli_orders_list: pedidos ML com dados de origem
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.meli_orders_list(text, text, int, int);

CREATE FUNCTION public.meli_orders_list(
  p_q text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  pedido_id uuid,
  numero bigint,
  cliente_nome text,
  status text,
  total_geral numeric,
  data_emissao date,
  external_order_id text,
  ml_status text,
  imported_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_q text := nullif(trim(p_q), '');
  v_status text := nullif(trim(p_status), '');
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce', 'manage');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id                                AS pedido_id,
    p.numero,
    pe.nome                             AS cliente_nome,
    p.status,
    p.total_geral,
    p.data_emissao,
    l.external_order_id,
    l.payload ->> 'status'              AS ml_status,
    l.imported_at
  FROM public.ecommerce_order_links l
  JOIN public.vendas_pedidos p
    ON p.id = l.vendas_pedido_id
   AND p.empresa_id = v_empresa
  LEFT JOIN public.pessoas pe
    ON pe.id = p.cliente_id
   AND pe.empresa_id = v_empresa
  WHERE l.empresa_id = v_empresa
    AND l.provider = 'meli'
    AND (v_q IS NULL
         OR p.numero::text ILIKE '%' || v_q || '%'
         OR pe.nome ILIKE '%' || v_q || '%'
         OR l.external_order_id ILIKE '%' || v_q || '%')
    AND (v_status IS NULL OR p.status = v_status)
  ORDER BY l.imported_at DESC NULLS LAST
  LIMIT greatest(p_limit, 1)
  OFFSET greatest(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.meli_orders_list(text, text, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.meli_orders_list(text, text, int, int) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reload PostgREST schema cache
-- ---------------------------------------------------------------------------
SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
