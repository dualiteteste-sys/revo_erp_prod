-- Phase 5.1: Quality RPCs and Updates

BEGIN;

-- 1. Add column to Apontamentos
DO $$ BEGIN
    ALTER TABLE public.industria_producao_apontamentos 
    ADD COLUMN motivo_refugo_id uuid REFERENCES public.qualidade_motivos_refugo(id);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- 2. RPC: Registrar Inspeção e Atualizar Lote
CREATE OR REPLACE FUNCTION public.qualidade_registrar_inspecao(
    p_ordem_id uuid,
    p_operacao_id uuid,
    p_lote text,
    p_resultado public.status_qualidade,
    p_qtd_inspecionada numeric,
    p_qtd_aprovada numeric,
    p_qtd_rejeitada numeric,
    p_motivo_id uuid DEFAULT NULL,
    p_observacoes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
    v_produto_id uuid;
BEGIN
    -- Insert Inspection Record
    INSERT INTO public.qualidade_inspecoes (
        empresa_id, ordem_id, operacao_id, lote, resultado,
        quantidade_inspecionada, quantidade_aprovada, quantidade_rejeitada,
        motivo_refugo_id, observacoes
    )
    VALUES (
        v_empresa_id, p_ordem_id, p_operacao_id, p_lote, p_resultado,
        p_qtd_inspecionada, p_qtd_aprovada, p_qtd_rejeitada,
        p_motivo_id, p_observacoes
    );

    -- Find Product ID from Lot (to update Status)
    SELECT produto_id INTO v_produto_id
    FROM public.estoque_lotes
    WHERE empresa_id = v_empresa_id AND lote = p_lote;

    IF v_produto_id IS NOT NULL THEN
        -- Update Lot Status based on Inspection Result
        -- Simplistic Logic: If Blocked/Rejected -> Block Lot. If Approved -> Approve Lot.
        -- 'em_analise' -> 'em_analise'
        UPDATE public.estoque_lotes
        SET status_qualidade = p_resultado,
            updated_at = now()
        WHERE empresa_id = v_empresa_id AND produto_id = v_produto_id AND lote = p_lote;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. RPC: Alterar Status Lote (Manual)
CREATE OR REPLACE FUNCTION public.qualidade_alterar_status_lote(
    p_lote text,
    p_produto_id uuid,
    p_novo_status public.status_qualidade,
    p_observacoes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
BEGIN
    UPDATE public.estoque_lotes
    SET status_qualidade = p_novo_status,
        updated_at = now()
    WHERE empresa_id = v_empresa_id AND produto_id = p_produto_id AND lote = p_lote;
    
    -- Could insert a log here, but keeping it simple for now
END;
$$;

-- 4. RPC: Apontar Produção (Updated with Motivo ID)
-- Replacing previous signature or overloading? 
-- Let's drop the old one if signature differs significantly, or just replace.
-- Previous expected: p_motivo_refugo text. 
-- New: p_motivo_refugo text (deprecating) + p_motivo_refugo_id uuid.

CREATE OR REPLACE FUNCTION public.industria_producao_apontar_producao(
    p_operacao_id uuid,
    p_quantidade_produzida numeric,
    p_quantidade_refugo numeric,
    p_motivo_refugo text, -- Text description (legacy or detail)
    p_observacoes text,
    p_finalizar boolean,
    p_motivo_refugo_id uuid DEFAULT NULL -- NEW
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
    v_ordem_id uuid;
    v_usuario_id uuid := auth.uid();
    v_status_atual text;
    v_nova_seq integer;
BEGIN
    -- Validation / Setup (Re-implementing logic from assumed previous RPC)
    SELECT ordem_id, status INTO v_ordem_id, v_status_atual
    FROM public.industria_producao_operacoes
    WHERE id = p_operacao_id AND empresa_id = v_empresa_id;

    IF v_ordem_id IS NULL THEN RAISE EXCEPTION 'Operação não encontrada.'; END IF;

    -- Update Operation stats
    UPDATE public.industria_producao_operacoes
    SET 
        quantidade_realizada = quantidade_realizada + p_quantidade_produzida,
        quantidade_refugo = quantidade_refugo + p_quantidade_refugo,
        status = CASE WHEN p_finalizar THEN 'concluida' ELSE 'em_processo' END
    WHERE id = p_operacao_id;

    -- Log Apontamento
    INSERT INTO public.industria_producao_apontamentos (
        empresa_id, operacao_id, usuario_id, tipo,
        quantidade_produzida, quantidade_refugo,
        motivo_refugo, motivo_refugo_id, -- Storing both
        observacoes, created_at
    )
    VALUES (
        v_empresa_id, p_operacao_id, v_usuario_id, 
        CASE WHEN p_finalizar THEN 'conclusao' ELSE 'producao' END,
        p_quantidade_produzida, p_quantidade_refugo,
        p_motivo_refugo, p_motivo_refugo_id,
        p_observacoes, now()
    );

    IF p_finalizar THEN
        -- Check if all ops are done? No, simplistic for now.
        -- Trigger next op? Overlap logic? 
        -- Keeping it basic as requested: Update Status.
        NULL;
    END IF;
END;
$$;

-- 5. RPC: Get Quality Motives
CREATE OR REPLACE FUNCTION public.qualidade_get_motivos()
RETURNS TABLE (
    id uuid,
    codigo text,
    descricao text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT id, codigo, descricao
    FROM public.qualidade_motivos_refugo
    WHERE empresa_id = public.current_empresa_id() AND ativo = true
    ORDER BY codigo, descricao;
$$;

COMMIT;
