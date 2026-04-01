-- Migration: Add observacoes column to industria_list_ordens return
-- Needed for StatusBeneficiamentosPage to display OB observations.

DROP FUNCTION IF EXISTS public.industria_list_ordens(text, text, text, int, int);

CREATE OR REPLACE FUNCTION public.industria_list_ordens(
  p_search text DEFAULT NULL,
  p_tipo   text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit  int  DEFAULT 50,
  p_offset int  DEFAULT 0
)
RETURNS TABLE (
  id                   uuid,
  numero               int,
  tipo_ordem           text,
  produto_nome         text,
  cliente_nome         text,
  quantidade_planejada numeric,
  unidade              text,
  status               text,
  prioridade           int,
  data_prevista_entrega date,
  total_entregue       numeric,
  qtde_caixas          numeric,
  numero_nf            text,
  pedido_numero        text,
  created_at           timestamptz,
  status_faturamento   text,
  pedido_venda_id      uuid,
  observacoes          text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.numero,
    o.tipo_ordem,
    p.nome AS produto_nome,
    c.nome AS cliente_nome,
    o.quantidade_planejada,
    o.unidade,
    o.status,
    o.prioridade,
    o.data_prevista_entrega,
    COALESCE((
      SELECT SUM(e.quantidade_entregue)
      FROM public.industria_ordens_entregas e
      WHERE e.ordem_id = o.id
        AND e.empresa_id = v_empresa_id
    ), 0) AS total_entregue,
    o.qtde_caixas,
    o.numero_nf,
    o.pedido_numero,
    o.created_at,
    o.status_faturamento,
    o.pedido_venda_id,
    o.observacoes
  FROM public.industria_ordens o
  JOIN public.produtos p
    ON o.produto_final_id = p.id
  LEFT JOIN public.pessoas c
    ON o.cliente_id = c.id
  WHERE o.empresa_id = v_empresa_id
    AND (
      p_search IS NULL
      OR o.numero::text ILIKE '%' || p_search || '%'
      OR p.nome          ILIKE '%' || p_search || '%'
      OR c.nome          ILIKE '%' || p_search || '%'
    )
    AND (p_tipo   IS NULL OR o.tipo_ordem = p_tipo)
    AND (p_status IS NULL OR o.status     = p_status)
  ORDER BY o.prioridade DESC, o.data_prevista_entrega ASC NULLS LAST, o.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.industria_list_ordens(text, text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.industria_list_ordens(text, text, text, int, int)
  TO authenticated, service_role;
