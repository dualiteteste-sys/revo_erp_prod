-- =============================================================================
-- Align operations RPC with quantidade_produzida expectations
-- =============================================================================

BEGIN;

-- 1) Ensure apontar RPC keeps quantidade_realizada in sync (legacy support)
CREATE OR REPLACE FUNCTION public.industria_producao_apontar_producao(
    p_operacao_id uuid,
    p_quantidade_produzida numeric,
    p_quantidade_refugo numeric,
    p_motivo_refugo text,
    p_observacoes text,
    p_finalizar boolean,
    p_motivo_refugo_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_ordem_id uuid;
    v_empresa_id uuid;
    v_usuario_id uuid := auth.uid();
    v_motivo_id uuid := NULL;
    v_has_industria boolean := to_regclass('public.industria_qualidade_motivos') IS NOT NULL;
    v_has_legacy boolean := to_regclass('public.qualidade_motivos_refugo') IS NOT NULL;
BEGIN
    SELECT o.ordem_id, o.empresa_id
    INTO v_ordem_id, v_empresa_id
    FROM public.industria_producao_operacoes o
    WHERE o.id = p_operacao_id;

    IF v_ordem_id IS NULL THEN
        RAISE EXCEPTION 'Operação não encontrada.';
    END IF;

    IF v_empresa_id IS DISTINCT FROM public.current_empresa_id() THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    IF p_motivo_refugo_id IS NOT NULL THEN
        IF v_has_industria THEN
            SELECT id
              INTO v_motivo_id
              FROM public.industria_qualidade_motivos
             WHERE id = p_motivo_refugo_id
               AND empresa_id = v_empresa_id;
        ELSIF v_has_legacy THEN
            SELECT id
              INTO v_motivo_id
              FROM public.qualidade_motivos_refugo
             WHERE id = p_motivo_refugo_id
               AND empresa_id = v_empresa_id;
        END IF;
    END IF;

    INSERT INTO public.industria_producao_apontamentos (
        empresa_id,
        operacao_id,
        usuario_id,
        tipo,
        quantidade_boa,
        quantidade_refugo,
        motivo_refugo,
        motivo_refugo_id,
        observacoes,
        created_at
    ) VALUES (
        v_empresa_id,
        p_operacao_id,
        v_usuario_id,
        'producao',
        p_quantidade_produzida,
        p_quantidade_refugo,
        p_motivo_refugo,
        v_motivo_id,
        p_observacoes,
        now()
    );

    UPDATE public.industria_producao_operacoes
    SET quantidade_produzida = COALESCE(quantidade_produzida, 0) + p_quantidade_produzida,
        quantidade_realizada = COALESCE(quantidade_realizada, 0) + p_quantidade_produzida,
        quantidade_refugo = COALESCE(quantidade_refugo, 0) + p_quantidade_refugo,
        status = CASE WHEN p_finalizar THEN 'concluida' ELSE status END,
        updated_at = now()
    WHERE id = p_operacao_id;
END;
$$;

-- 2) Rebuild operations listing RPC to expose quantidade_produzida/transferida
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
    permite_overlap boolean
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
        COALESCE(o.permite_overlap, false) AS permite_overlap
    FROM public.industria_producao_operacoes o
    WHERE o.ordem_id = p_ordem_id
      AND o.empresa_id = public.current_empresa_id()
    ORDER BY o.sequencia ASC;
END;
$$;

COMMIT;
