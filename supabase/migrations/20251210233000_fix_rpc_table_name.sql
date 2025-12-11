-- Fix Table Name Typo in generation RPC

BEGIN;

CREATE OR REPLACE FUNCTION public.industria_producao_gerar_operacoes(p_ordem_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
    v_roteiro_id uuid;
    v_qtd_planejada numeric;
    v_exists boolean;
BEGIN
    -- Get Order info
    SELECT roteiro_aplicado_id, quantidade_planejada INTO v_roteiro_id, v_qtd_planejada
    FROM public.industria_producao_ordens
    WHERE id = p_ordem_id AND empresa_id = v_empresa_id;

    IF v_roteiro_id IS NULL THEN
        RAISE EXCEPTION 'A ordem não possui um roteiro aplicado.';
    END IF;

    -- Check if operations already exist
    SELECT EXISTS(SELECT 1 FROM public.industria_producao_operacoes WHERE ordem_id = p_ordem_id) INTO v_exists;
    IF v_exists THEN
        RAISE EXCEPTION 'Operações já foram geradas para esta ordem.';
    END IF;

    -- Insert Operations based on Roteiro Etapas (PLURAL TABLE NAME FIX)
    INSERT INTO public.industria_producao_operacoes (
        empresa_id, ordem_id, sequencia, centro_trabalho_id, centro_trabalho_nome,
        descricao, tempo_planejado_minutos, quantidade_planejada, status, permite_overlap
    )
    SELECT 
        v_empresa_id,
        p_ordem_id,
        e.sequencia,
        e.centro_trabalho_id,
        ct.nome as centro_trabalho_nome,
        COALESCE(e.observacoes, 'Operação Padrão') as descricao, -- Map observacoes to descricao
        -- Simple logic: (Setup + (Tempo/Un * Qtd))
        (COALESCE(e.tempo_setup_min, 0) + (COALESCE(e.tempo_ciclo_min_por_unidade, 0) * v_qtd_planejada)),
        v_qtd_planejada,
        'pendente',
        e.permitir_overlap
    FROM public.industria_roteiros_etapas e -- FIXED: Plural
    LEFT JOIN public.industria_centros_trabalho ct ON ct.id = e.centro_trabalho_id
    WHERE e.roteiro_id = v_roteiro_id AND e.empresa_id = v_empresa_id
    ORDER BY e.sequencia ASC;

    -- Update Order Status
    UPDATE public.industria_producao_ordens 
    SET status = 'em_producao'
    WHERE id = p_ordem_id;

END;
$$;

COMMIT;
