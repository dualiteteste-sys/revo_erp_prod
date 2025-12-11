BEGIN;

-- Fix RPC: industria_producao_apontar_producao
-- The table 'industria_producao_apontamentos' has 'quantidade_boa', not 'quantidade_produzida'.
-- We map p_quantidade_produzida -> quantidade_boa.

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
    v_produto_id uuid;
    v_empresa_id uuid;
    v_usuario_id uuid := auth.uid();
BEGIN
    -- Get Operation Context
    SELECT o.ordem_id, op.produto_final_id, o.empresa_id
    INTO v_ordem_id, v_produto_id, v_empresa_id
    FROM public.industria_producao_operacoes o
    JOIN public.industria_producao_ordens op ON op.id = o.ordem_id
    WHERE o.id = p_operacao_id;

    IF v_ordem_id IS NULL THEN
        RAISE EXCEPTION 'Operação não encontrada.';
    END IF;

    -- Validate RLS
    IF v_empresa_id != public.current_empresa_id() THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    -- Insert Apontamento
    INSERT INTO public.industria_producao_apontamentos (
        operacao_id,
        usuario_id,
        tipo,
        quantidade_boa, -- FIXED: Was quantidade_produzida
        quantidade_refugo,
        motivo_refugo,
        motivo_refugo_id,
        observacoes,
        created_at
    ) VALUES (
        p_operacao_id,
        v_usuario_id,
        'producao',
        p_quantidade_produzida,
        p_quantidade_refugo,
        p_motivo_refugo,
        p_motivo_refugo_id,
        p_observacoes,
        now()
    );

    -- Update Operation Totals
    -- Note: 'quantidade_produzida' in 'operacoes' table DOES exist (it's the sum of good items), so this is correct.
    UPDATE public.industria_producao_operacoes
    SET quantidade_produzida = quantidade_produzida + p_quantidade_produzida,
        quantidade_refugo = quantidade_refugo + p_quantidade_refugo,
        status = CASE WHEN p_finalizar THEN 'concluida' ELSE status END,
        updated_at = now()
    WHERE id = p_operacao_id;

END;
$$;

COMMIT;
