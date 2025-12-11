-- Link Apontamentos to QA Motives and Update RPC

BEGIN;

-- 1. Add Foreign Key to Apontamentos Table
ALTER TABLE public.industria_producao_apontamentos
ADD COLUMN IF NOT EXISTS motivo_refugo_id uuid REFERENCES public.industria_qualidade_motivos(id) ON DELETE SET NULL;

-- 2. Update RPC to accept p_motivo_refugo_id
CREATE OR REPLACE FUNCTION public.industria_producao_apontar_producao(
    p_operacao_id uuid,
    p_quantidade_produzida numeric,
    p_quantidade_refugo numeric,
    p_motivo_refugo text,
    p_observacoes text,
    p_finalizar boolean,
    p_motivo_refugo_id uuid DEFAULT NULL -- New Parameter
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_ordem_id uuid;
    v_produto_id uuid;
    v_nova_seq integer;
    v_empresa_id uuid;
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
        quantidade_produzida,
        quantidade_refugo,
        motivo_refugo,
        motivo_refugo_id, -- New column
        observacoes,
        created_at
    ) VALUES (
        p_operacao_id,
        public.current_user_id(), -- Assuming helper exists, or auth.uid()
        'producao',
        p_quantidade_produzida,
        p_quantidade_refugo,
        p_motivo_refugo,
        p_motivo_refugo_id,
        p_observacoes,
        now()
    );

    -- Update Operation Totals
    UPDATE public.industria_producao_operacoes
    SET quantidade_produzida = quantidade_produzida + p_quantidade_produzida,
        quantidade_refugo = quantidade_refugo + p_quantidade_refugo,
        status = CASE WHEN p_finalizar THEN 'concluida' ELSE status END,
        updated_at = now()
    WHERE id = p_operacao_id;

    -- If finalizing, check if whole order should be closed?
    -- (Logic usually handled by separate closure RPC or trigger, keeping simple here)
    
    -- Future: If Scrap > 0, we might auto-move stock to 'scrapped' location or just log it.

END;
$$;


-- 3. RPC: Add Motive (For Frontend Management)
CREATE OR REPLACE FUNCTION public.qualidade_adicionar_motivo(
    p_codigo text,
    p_descricao text,
    p_tipo text DEFAULT 'refugo'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    INSERT INTO public.industria_qualidade_motivos (empresa_id, codigo, descricao, tipo)
    VALUES (public.current_empresa_id(), p_codigo, p_descricao, p_tipo);
END;
$$;

-- 4. RPC: Delete Motive
CREATE OR REPLACE FUNCTION public.qualidade_excluir_motivo(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    DELETE FROM public.industria_qualidade_motivos
    WHERE id = p_id AND empresa_id = public.current_empresa_id();
END;
$$;

COMMIT;
