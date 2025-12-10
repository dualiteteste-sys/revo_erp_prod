-- Fix Missing Columns in Operations Table and RPCs

BEGIN;

-- 1. Add missing columns safely
DO $$
BEGIN
    -- Add descricao if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'industria_producao_operacoes' AND column_name = 'descricao') THEN
        ALTER TABLE public.industria_producao_operacoes ADD COLUMN descricao text;
    END IF;

    -- Add permite_overlap if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'industria_producao_operacoes' AND column_name = 'permite_overlap') THEN
        ALTER TABLE public.industria_producao_operacoes ADD COLUMN permite_overlap boolean DEFAULT false;
    END IF;
    
    -- Add quantidade_transferida if missing (used in frontend)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'industria_producao_operacoes' AND column_name = 'quantidade_transferida') THEN
        ALTER TABLE public.industria_producao_operacoes ADD COLUMN quantidade_transferida numeric DEFAULT 0;
    END IF;
END $$;


-- 2. Update RPC: Gerar Operacoes (to include new columns)
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

    -- Insert Operations based on Roteiro Etapas
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
        e.descricao,
        -- Simple logic: (Setup + (Tempo/Un * Qtd))
        (e.tempo_setup_minutos + (e.tempo_producao_minutos * v_qtd_planejada)),
        v_qtd_planejada,
        'pendente',
        e.permitir_overlap
    FROM public.industria_roteiro_etapas e
    LEFT JOIN public.industria_centros_trabalho ct ON ct.id = e.centro_trabalho_id
    WHERE e.roteiro_id = v_roteiro_id AND e.empresa_id = v_empresa_id
    ORDER BY e.sequencia ASC;

    -- Update Order Status
    UPDATE public.industria_producao_ordens 
    SET status = 'em_programacao' -- Changed from 'planejada' to 'em_programacao' or 'em_producao' as per logic. Let's keep consistent with frontend 'Liberar' usually implies ready or WIP.
    WHERE id = p_ordem_id;

END;
$$;


-- 3. Update RPC: Get Operacoes (Drop first to allow return type change)
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
    quantidade_realizada numeric,
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
        o.id, o.ordem_id, o.sequencia, 
        o.centro_trabalho_id, o.centro_trabalho_nome, 
        o.descricao, 
        o.tempo_planejado_minutos, o.tempo_real_minutos,
        o.quantidade_planejada, o.quantidade_realizada, o.quantidade_refugo,
        o.quantidade_transferida,
        o.status,
        o.permite_overlap
    FROM public.industria_producao_operacoes o
    WHERE o.ordem_id = p_ordem_id AND o.empresa_id = public.current_empresa_id()
    ORDER BY o.sequencia ASC;
END;
$$;

COMMIT;
