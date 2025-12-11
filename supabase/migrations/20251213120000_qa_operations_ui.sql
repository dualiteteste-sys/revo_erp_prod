-- =============================================================================
-- QA Enhancements for Operations Grid (requirements toggles & status exposure)
-- =============================================================================

BEGIN;

-- 1) Extend operations listing RPC with QA requirements and latest inspection status
DROP FUNCTION IF EXISTS public.industria_producao_get_operacoes(uuid);
CREATE OR REPLACE FUNCTION public.industria_producao_get_operacoes(p_ordem_id uuid)
RETURNS TABLE (
    id uuid,
    ordem_id uuid,
    sequencia integer,
    centro_trabalho_id uuid,
    centro_trabalho_nome text,
    descricao text,
    tempo_planejado_minutos numeric,
    tempo_real_minutos numeric,
    quantidade_planejada numeric,
    quantidade_produzida numeric,
    quantidade_refugo numeric,
    quantidade_transferida numeric,
    status text,
    permite_overlap boolean,
    require_ip boolean,
    require_if boolean,
    ip_status public.status_inspecao_qa,
    if_status public.status_inspecao_qa,
    ip_last_inspecao timestamptz,
    if_last_inspecao timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id,
        o.ordem_id,
        o.sequencia,
        o.centro_trabalho_id,
        o.centro_trabalho_nome,
        o.descricao,
        o.tempo_planejado_minutos,
        o.tempo_real_minutos,
        o.quantidade_planejada,
        COALESCE(o.quantidade_produzida, o.quantidade_realizada, 0) AS quantidade_produzida,
        COALESCE(o.quantidade_refugo, 0) AS quantidade_refugo,
        COALESCE(o.quantidade_transferida, 0) AS quantidade_transferida,
        o.status,
        COALESCE(o.permite_overlap, false) AS permite_overlap,
        COALESCE(o.require_ip, false) AS require_ip,
        COALESCE(o.require_if, false) AS require_if,
        ip_info.resultado AS ip_status,
        if_info.resultado AS if_status,
        ip_info.created_at AS ip_last_inspecao,
        if_info.created_at AS if_last_inspecao
    FROM public.industria_producao_operacoes o
    LEFT JOIN LATERAL (
        SELECT iq.resultado, iq.created_at
        FROM public.industria_qualidade_inspecoes iq
        WHERE iq.operacao_id = o.id
          AND iq.tipo = 'IP'
          AND iq.empresa_id = public.current_empresa_id()
        ORDER BY iq.created_at DESC
        LIMIT 1
    ) ip_info ON TRUE
    LEFT JOIN LATERAL (
        SELECT iq.resultado, iq.created_at
        FROM public.industria_qualidade_inspecoes iq
        WHERE iq.operacao_id = o.id
          AND iq.tipo = 'IF'
          AND iq.empresa_id = public.current_empresa_id()
        ORDER BY iq.created_at DESC
        LIMIT 1
    ) if_info ON TRUE
    WHERE o.ordem_id = p_ordem_id
      AND o.empresa_id = public.current_empresa_id()
    ORDER BY o.sequencia ASC;
END;
$$;

-- 2) RPC to toggle QA requirements on operations
CREATE OR REPLACE FUNCTION public.industria_producao_set_qa_requirements(
    p_operacao_id uuid,
    p_require_ip boolean,
    p_require_if boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid;
BEGIN
    SELECT empresa_id
    INTO v_empresa_id
    FROM public.industria_producao_operacoes
    WHERE id = p_operacao_id;

    IF v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Operação não encontrada.';
    END IF;

    IF v_empresa_id IS DISTINCT FROM public.current_empresa_id() THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    UPDATE public.industria_producao_operacoes
    SET require_ip = COALESCE(p_require_ip, require_ip),
        require_if = COALESCE(p_require_if, require_if),
        updated_at = now()
    WHERE id = p_operacao_id;
END;
$$;

COMMIT;
