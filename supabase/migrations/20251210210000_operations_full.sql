-- Phase X: Operations Schema (Missing Link)

BEGIN;

-- 1. Tables

CREATE TABLE IF NOT EXISTS public.industria_producao_operacoes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id(),
    ordem_id uuid REFERENCES public.industria_producao_ordens(id) ON DELETE CASCADE,
    sequencia integer NOT NULL,
    centro_trabalho_id uuid REFERENCES public.industria_centros_trabalho(id),
    centro_trabalho_nome text, -- Denormalized for speed
    descricao text NOT NULL,
    tempo_planejado_minutos numeric DEFAULT 0,
    tempo_real_minutos numeric DEFAULT 0,
    quantidade_planejada numeric DEFAULT 0,
    quantidade_realizada numeric DEFAULT 0,
    quantidade_refugo numeric DEFAULT 0,
    status text DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_preparacao', 'em_processo', 'interrompida', 'concluida')),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.industria_producao_apontamentos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id(),
    operacao_id uuid REFERENCES public.industria_producao_operacoes(id) ON DELETE CASCADE,
    usuario_id uuid DEFAULT auth.uid(),
    tipo text CHECK (tipo IN ('producao', 'setup', 'parada', 'retorno', 'conclusao')),
    quantidade_produzida numeric DEFAULT 0,
    quantidade_refugo numeric DEFAULT 0,
    motivo_refugo text,
    motivo_refugo_id uuid, -- Already added by Quality migration, but ensuring here
    tempo_apontado_minutos numeric DEFAULT 0,
    observacoes text,
    created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.industria_producao_operacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso por empresa" ON public.industria_producao_operacoes;
CREATE POLICY "Acesso por empresa" ON public.industria_producao_operacoes USING (empresa_id = public.current_empresa_id());

ALTER TABLE public.industria_producao_apontamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso por empresa" ON public.industria_producao_apontamentos;
CREATE POLICY "Acesso por empresa" ON public.industria_producao_apontamentos USING (empresa_id = public.current_empresa_id());


-- 2. RPCs

-- RPC: Get Operacoes
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
    status text
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
        o.status
    FROM public.industria_producao_operacoes o
    WHERE o.ordem_id = p_ordem_id AND o.empresa_id = public.current_empresa_id()
    ORDER BY o.sequencia ASC;
END;
$$;


-- RPC: Gerar Operacoes (a partir do Roteiro da Ordem)
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
        descricao, tempo_planejado_minutos, quantidade_planejada, status
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
        'pendente'
    FROM public.industria_roteiro_etapas e
    LEFT JOIN public.industria_centros_trabalho ct ON ct.id = e.centro_trabalho_id
    WHERE e.roteiro_id = v_roteiro_id AND e.empresa_id = v_empresa_id
    ORDER BY e.sequencia ASC;

    -- Update Order Status if needed
    UPDATE public.industria_producao_ordens 
    SET status = 'planejada' 
    WHERE id = p_ordem_id AND status = 'rascunho';

END;
$$;


-- RPC: Registrar Evento (Start/Stop/Setup)
CREATE OR REPLACE FUNCTION public.industria_producao_registrar_evento(
    p_operacao_id uuid,
    p_tipo text, -- inicio_setup, fim_setup, inicio_producao, parada, retomada, conclusao
    p_observacoes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
    v_new_status text;
    v_apontamento_tipo text;
BEGIN
    -- Determine New Status based on Event
    IF p_tipo = 'inicio_setup' THEN v_new_status := 'em_preparacao'; v_apontamento_tipo := 'setup';
    ELSIF p_tipo = 'fim_setup' THEN v_new_status := 'pendente'; v_apontamento_tipo := 'setup'; -- Ready for production
    ELSIF p_tipo = 'inicio_producao' THEN v_new_status := 'em_processo'; v_apontamento_tipo := 'producao';
    ELSIF p_tipo = 'parada' THEN v_new_status := 'interrompida'; v_apontamento_tipo := 'parada';
    ELSIF p_tipo = 'retorno' THEN v_new_status := 'em_processo'; v_apontamento_tipo := 'retorno';
    ELSIF p_tipo = 'conclusao' THEN v_new_status := 'concluida'; v_apontamento_tipo := 'conclusao';
    ELSE
        RAISE EXCEPTION 'Tipo de evento inválido';
    END IF;

    -- Update Operation Status
    UPDATE public.industria_producao_operacoes
    SET status = v_new_status, updated_at = now()
    WHERE id = p_operacao_id AND empresa_id = v_empresa_id;

    -- Log to Apontamentos (Simple Log)
    INSERT INTO public.industria_producao_apontamentos (
        empresa_id, operacao_id, usuario_id, tipo, observacoes, created_at
    )
    VALUES (
        v_empresa_id, p_operacao_id, auth.uid(), v_apontamento_tipo, p_observacoes, now()
    );
END;
$$;

COMMIT;
