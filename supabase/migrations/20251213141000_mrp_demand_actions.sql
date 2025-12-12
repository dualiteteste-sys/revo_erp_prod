-- =============================================================================
-- MRP Demand Actions (tracking how faltas são tratadas)
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.industria_mrp_demanda_acoes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id() NOT NULL,
    demanda_id uuid NOT NULL REFERENCES public.industria_mrp_demandas(id) ON DELETE CASCADE,
    tipo text NOT NULL CHECK (tipo IN ('transferencia','requisicao_compra','ordem_compra','ajuste','manual')),
    quantidade numeric DEFAULT 0,
    unidade text DEFAULT 'un',
    fornecedor_id uuid REFERENCES public.pessoas(id) ON DELETE SET NULL,
    data_prometida date,
    observacoes text,
    detalhes jsonb,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.industria_mrp_demanda_acoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS industria_mrp_demanda_acoes_policy ON public.industria_mrp_demanda_acoes;
CREATE POLICY industria_mrp_demanda_acoes_policy ON public.industria_mrp_demanda_acoes
    USING (empresa_id = public.current_empresa_id());

CREATE INDEX IF NOT EXISTS idx_mrp_demanda_acoes_demanda ON public.industria_mrp_demanda_acoes(empresa_id, demanda_id);

CREATE OR REPLACE FUNCTION public.mrp_registrar_acao_demanda(
    p_demanda_id uuid,
    p_tipo text DEFAULT 'manual',
    p_quantidade numeric DEFAULT 0,
    p_unidade text DEFAULT NULL,
    p_data_prometida date DEFAULT NULL,
    p_fornecedor_id uuid DEFAULT NULL,
    p_observacoes text DEFAULT NULL,
    p_status text DEFAULT 'respondida'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_demanda record;
    v_id uuid;
    v_tipo text := COALESCE(p_tipo, 'manual');
BEGIN
    SELECT *
      INTO v_demanda
      FROM public.industria_mrp_demandas
     WHERE id = p_demanda_id
       AND empresa_id = public.current_empresa_id();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Demanda não encontrada.';
    END IF;

    INSERT INTO public.industria_mrp_demanda_acoes (
        empresa_id,
        demanda_id,
        tipo,
        quantidade,
        unidade,
        fornecedor_id,
        data_prometida,
        observacoes,
        detalhes
    ) VALUES (
        v_demanda.empresa_id,
        v_demanda.id,
        v_tipo,
        GREATEST(COALESCE(p_quantidade, 0), 0),
        COALESCE(p_unidade, 'un'),
        p_fornecedor_id,
        p_data_prometida,
        p_observacoes,
        jsonb_build_object(
            'necessidade_liquida', v_demanda.necessidade_liquida,
            'origem', v_demanda.origem
        )
    ) RETURNING id INTO v_id;

    UPDATE public.industria_mrp_demandas
       SET status = COALESCE(p_status, 'respondida'),
           updated_at = now()
     WHERE id = v_demanda.id;

    RETURN v_id;
END;
$$;

DROP FUNCTION IF EXISTS public.mrp_list_demandas(p_status text);
CREATE OR REPLACE FUNCTION public.mrp_list_demandas(p_status text DEFAULT NULL)
RETURNS TABLE (
    id uuid,
    produto_id uuid,
    produto_nome text,
    ordem_id uuid,
    ordem_numero bigint,
    componente_id uuid,
    quantidade_planejada numeric,
    quantidade_reservada numeric,
    quantidade_disponivel numeric,
    estoque_seguranca numeric,
    necessidade_liquida numeric,
    data_necessidade date,
    status text,
    origem text,
    lead_time_dias integer,
    mensagem text,
    prioridade text,
    ultima_acao_tipo text,
    ultima_acao_data timestamptz,
    ultima_acao_quantidade numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT
        d.id,
        d.produto_id,
        prod.nome AS produto_nome,
        d.ordem_id,
        ord.numero AS ordem_numero,
        d.componente_id,
        d.quantidade_planejada,
        d.quantidade_reservada,
        d.quantidade_disponivel,
        d.estoque_seguranca,
        d.necessidade_liquida,
        d.data_necessidade,
        d.status,
        d.origem,
        d.lead_time_dias,
        d.mensagem,
        CASE
            WHEN d.data_necessidade IS NULL THEN 'normal'
            WHEN d.data_necessidade < now()::date THEN 'atrasado'
            WHEN d.data_necessidade <= now()::date + INTERVAL '2 day' THEN 'critico'
            ELSE 'normal'
        END AS prioridade,
        ac.tipo AS ultima_acao_tipo,
        ac.created_at AS ultima_acao_data,
        ac.quantidade AS ultima_acao_quantidade
    FROM public.industria_mrp_demandas d
    JOIN public.produtos prod ON prod.id = d.produto_id
    LEFT JOIN public.industria_producao_ordens ord ON ord.id = d.ordem_id
    LEFT JOIN LATERAL (
        SELECT a.tipo, a.created_at, a.quantidade
          FROM public.industria_mrp_demanda_acoes a
         WHERE a.demanda_id = d.id
           AND a.empresa_id = d.empresa_id
         ORDER BY a.created_at DESC
         LIMIT 1
    ) ac ON TRUE
    WHERE d.empresa_id = public.current_empresa_id()
      AND (p_status IS NULL OR d.status = p_status)
    ORDER BY d.data_necessidade NULLS LAST, d.updated_at DESC;
$$;

COMMIT;
