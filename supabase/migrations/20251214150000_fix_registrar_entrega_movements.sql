-- Allow multiple entregas per OP by upserting estoque_movimentos rows
BEGIN;

CREATE OR REPLACE FUNCTION public.industria_producao_registrar_entrega(
    p_ordem_id uuid,
    p_quantidade numeric,
    p_data_entrega date,
    p_lote text DEFAULT NULL,
    p_validade date DEFAULT NULL,
    p_documento_ref text DEFAULT NULL,
    p_observacoes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
    v_ordem record;
    v_novo_total numeric;
    v_mov_key record;
BEGIN
    SELECT * INTO v_ordem 
    FROM public.industria_producao_ordens 
    WHERE id = p_ordem_id AND empresa_id = v_empresa_id;

    IF v_ordem IS NULL THEN
        RAISE EXCEPTION 'Ordem não encontrada.';
    END IF;

    IF v_ordem.status NOT IN ('planejada', 'em_producao', 'parcialmente_concluida', 'em_inspecao') THEN
        RAISE EXCEPTION 'Status da ordem inválido para entrega: %', v_ordem.status;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.industria_producao_operacoes op
        WHERE op.ordem_id = p_ordem_id
          AND op.empresa_id = v_empresa_id
          AND COALESCE(op.require_if, false)
          AND NOT EXISTS (
              SELECT 1
              FROM public.industria_qualidade_inspecoes iq
              WHERE iq.operacao_id = op.id
                AND iq.tipo = 'IF'
                AND iq.resultado = 'aprovada'
                AND iq.empresa_id = v_empresa_id
          )
    ) THEN
        RAISE EXCEPTION 'Inspeção Final pendente. Libere a IF antes de registrar a entrega.';
    END IF;

    v_novo_total := COALESCE(v_ordem.total_entregue, 0) + p_quantidade;

    INSERT INTO public.industria_producao_entregas (
        empresa_id, ordem_id, data_entrega, quantidade_entregue, 
        documento_ref, observacoes
    ) VALUES (
        v_empresa_id, p_ordem_id, p_data_entrega, p_quantidade, 
        p_documento_ref, p_observacoes
    );

    UPDATE public.industria_producao_ordens
    SET 
        total_entregue = v_novo_total,
        percentual_concluido = CASE 
            WHEN COALESCE(quantidade_planejada, 0) = 0 THEN 0
            ELSE LEAST(100, (v_novo_total / NULLIF(quantidade_planejada, 0)) * 100)
        END,
        status = CASE 
                    WHEN v_novo_total >= quantidade_planejada THEN 'concluida' 
                    WHEN v_novo_total > 0 THEN 'parcialmente_concluida'
                    ELSE status 
                 END, 
        updated_at = now()
    WHERE id = p_ordem_id;

    INSERT INTO public.estoque_movimentos (
        empresa_id, produto_id, tipo, quantidade, 
        saldo_anterior, saldo_novo,
        origem_tipo, origem_id, tipo_mov, lote, observacoes
    )
    VALUES (
        v_empresa_id, v_ordem.produto_final_id, 'entrada', p_quantidade,
        0, 0,
        'ordem_producao', p_ordem_id, 'producao_acabada', p_lote, 
        COALESCE(p_observacoes, 'Entrega OP ' || v_ordem.numero)
    )
    ON CONFLICT (empresa_id, origem_tipo, origem_id, produto_id, tipo_mov)
    DO UPDATE SET
        quantidade = public.estoque_movimentos.quantidade + EXCLUDED.quantidade,
        updated_at = now(),
        observacoes = EXCLUDED.observacoes;

    INSERT INTO public.estoque_lotes (
        empresa_id, produto_id, lote, validade, saldo
    ) VALUES (
        v_empresa_id, v_ordem.produto_final_id, 
        COALESCE(p_lote, v_ordem.lote_producao, 'L-' || v_ordem.numero), 
        p_validade, 
        p_quantidade
    )
    ON CONFLICT (empresa_id, produto_id, lote)
    DO UPDATE SET 
        saldo = public.estoque_lotes.saldo + EXCLUDED.saldo,
        validade = COALESCE(EXCLUDED.validade, public.estoque_lotes.validade),
        updated_at = now();

    RETURN jsonb_build_object('success', true, 'novo_total', v_novo_total);
END;
$$;

COMMIT;
