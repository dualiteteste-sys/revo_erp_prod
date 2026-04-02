-- Migration: Add produto_sku to industria_faturamento_listar_elegiveis
-- Allows FaturamentoBeneficiamentoPage to display the product code (SKU).
-- NOTE: Must DROP first because PostgreSQL cannot change RETURNS TABLE via CREATE OR REPLACE.

DROP FUNCTION IF EXISTS public.industria_faturamento_listar_elegiveis(uuid, date, date, text, int, int);

CREATE FUNCTION public.industria_faturamento_listar_elegiveis(
  p_cliente_id uuid    DEFAULT NULL,
  p_data_inicio date   DEFAULT NULL,
  p_data_fim    date   DEFAULT NULL,
  p_search      text   DEFAULT NULL,
  p_limit       int    DEFAULT 200,
  p_offset      int    DEFAULT 0
)
RETURNS TABLE (
  entrega_id          uuid,
  ordem_id            uuid,
  ordem_numero        int,
  produto_id          uuid,
  produto_nome        text,
  produto_sku         text,
  produto_ncm         text,
  produto_unidade     text,
  produto_preco_venda numeric,
  cliente_id          uuid,
  cliente_nome        text,
  data_entrega        date,
  quantidade_entregue numeric,
  quantidade_ja_faturada  numeric,
  quantidade_disponivel   numeric,
  documento_ref       text,
  observacoes         text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_search  text := nullif(trim(p_search), '');
BEGIN
  RETURN QUERY
  SELECT
    e.id                    AS entrega_id,
    o.id                    AS ordem_id,
    o.numero                AS ordem_numero,
    p.id                    AS produto_id,
    p.nome                  AS produto_nome,
    p.sku                   AS produto_sku,
    p.ncm                   AS produto_ncm,
    coalesce(p.unidade, o.unidade, 'un') AS produto_unidade,
    coalesce(p.preco_venda, 0)           AS produto_preco_venda,
    cli.id                  AS cliente_id,
    cli.nome                AS cliente_nome,
    e.data_entrega,
    e.quantidade_entregue,
    coalesce(fat_agg.total_faturada, 0)  AS quantidade_ja_faturada,
    (e.quantidade_entregue - coalesce(fat_agg.total_faturada, 0)) AS quantidade_disponivel,
    e.documento_ref,
    e.observacoes
  FROM public.industria_ordens_entregas e
  JOIN public.industria_ordens o
    ON o.id = e.ordem_id AND o.empresa_id = v_empresa
  JOIN public.produtos p
    ON p.id = o.produto_final_id AND p.empresa_id = v_empresa
  LEFT JOIN public.pessoas cli
    ON cli.id = o.cliente_id AND cli.empresa_id = v_empresa
  LEFT JOIN LATERAL (
    SELECT sum(fe.quantidade_faturada) AS total_faturada
    FROM public.industria_faturamento_entregas fe
    WHERE fe.entrega_id = e.id AND fe.empresa_id = v_empresa
  ) fat_agg ON true
  WHERE e.empresa_id = v_empresa
    AND e.status_faturamento = 'pronto_para_faturar'
    AND (e.quantidade_entregue - coalesce(fat_agg.total_faturada, 0)) > 0
    AND (p_cliente_id IS NULL OR o.cliente_id = p_cliente_id)
    AND (p_data_inicio IS NULL OR e.data_entrega >= p_data_inicio)
    AND (p_data_fim    IS NULL OR e.data_entrega <= p_data_fim)
    AND (
      v_search IS NULL
      OR p.nome   ILIKE '%' || v_search || '%'
      OR p.sku    ILIKE '%' || v_search || '%'
      OR cli.nome ILIKE '%' || v_search || '%'
      OR o.numero::text = v_search
    )
  ORDER BY e.data_entrega DESC, o.numero DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.industria_faturamento_listar_elegiveis TO authenticated;
REVOKE ALL ON FUNCTION public.industria_faturamento_listar_elegiveis FROM anon;
