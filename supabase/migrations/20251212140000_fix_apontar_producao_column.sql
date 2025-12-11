-- =============================================================================
-- Ensure industria_producao_apontar_producao writes into quantidade_boa column
-- =============================================================================

BEGIN;

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
    SET quantidade_produzida = quantidade_produzida + p_quantidade_produzida,
        quantidade_refugo = quantidade_refugo + p_quantidade_refugo,
        status = CASE WHEN p_finalizar THEN 'concluida' ELSE status END,
        updated_at = now()
    WHERE id = p_operacao_id;
END;
$$;

COMMIT;
