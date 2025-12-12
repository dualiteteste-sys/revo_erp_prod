-- =============================================================================
-- Lista de lotes com status QA e última inspeção
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.qualidade_list_lotes(text, public.status_lote_qa);
CREATE OR REPLACE FUNCTION public.qualidade_list_lotes(
    p_search text DEFAULT NULL,
    p_status public.status_lote_qa DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    produto_id uuid,
    produto_nome text,
    lote text,
    validade date,
    saldo numeric,
    status_qa public.status_lote_qa,
    ultima_inspecao_data timestamptz,
    ultima_inspecao_tipo text,
    ultima_inspecao_resultado public.status_inspecao_qa,
    total_inspecoes integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    WITH lotes AS (
        SELECT el.id,
               el.produto_id,
               prod.nome AS produto_nome,
               el.lote,
               el.validade,
               el.saldo,
               el.status_qa
        FROM public.estoque_lotes el
        JOIN public.produtos prod ON prod.id = el.produto_id
        WHERE el.empresa_id = public.current_empresa_id()
          AND (p_status IS NULL OR el.status_qa = p_status)
          AND (
                p_search IS NULL
             OR prod.nome ILIKE '%' || p_search || '%'
             OR el.lote ILIKE '%' || p_search || '%'
          )
    )
    SELECT
        l.id,
        l.produto_id,
        l.produto_nome,
        l.lote,
        l.validade,
        l.saldo,
        l.status_qa,
        insp.created_at AS ultima_inspecao_data,
        insp.tipo AS ultima_inspecao_tipo,
        insp.resultado AS ultima_inspecao_resultado,
        COALESCE(cnt.total, 0) AS total_inspecoes
    FROM lotes l
    LEFT JOIN LATERAL (
        SELECT iq.tipo, iq.resultado, iq.created_at
        FROM public.industria_qualidade_inspecoes iq
        WHERE iq.lote_id = l.id
          AND iq.empresa_id = public.current_empresa_id()
        ORDER BY iq.created_at DESC
        LIMIT 1
    ) insp ON TRUE
    LEFT JOIN LATERAL (
        SELECT COUNT(*)::integer AS total
        FROM public.industria_qualidade_inspecoes iq
        WHERE iq.lote_id = l.id
          AND iq.empresa_id = public.current_empresa_id()
    ) cnt ON TRUE
    ORDER BY
        CASE l.status_qa
            WHEN 'bloqueado' THEN 1
            WHEN 'reprovado' THEN 2
            WHEN 'em_analise' THEN 3
            ELSE 4
        END,
        l.produto_nome,
        l.lote;
$$;

COMMIT;
