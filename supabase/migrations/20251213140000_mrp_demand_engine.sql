-- =============================================================================
-- MRP Item Parameters & Demand Tracking
-- =============================================================================

BEGIN;

-- 1) Item parameters (lead time, safety stock, etc.)
CREATE TABLE IF NOT EXISTS public.industria_mrp_parametros (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id() NOT NULL,
    produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    lead_time_dias integer DEFAULT 0,
    lote_minimo numeric DEFAULT 0,
    multiplo_compra numeric DEFAULT 1,
    estoque_seguranca numeric DEFAULT 0,
    fornecedor_preferencial_id uuid REFERENCES public.pessoas(id) ON DELETE SET NULL,
    politica_picking text DEFAULT 'FIFO' CHECK (politica_picking IN ('FIFO', 'FEFO')),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(empresa_id, produto_id)
);

ALTER TABLE public.industria_mrp_parametros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS industria_mrp_parametros_policy ON public.industria_mrp_parametros;
CREATE POLICY industria_mrp_parametros_policy ON public.industria_mrp_parametros
    USING (empresa_id = public.current_empresa_id());

CREATE TRIGGER industria_mrp_parametros_updated_at
BEFORE UPDATE ON public.industria_mrp_parametros
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) Demand snapshot table
CREATE TABLE IF NOT EXISTS public.industria_mrp_demandas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id() NOT NULL,
    produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
    componente_id uuid REFERENCES public.industria_producao_componentes(id) ON DELETE CASCADE,
    ordem_id uuid REFERENCES public.industria_producao_ordens(id) ON DELETE CASCADE,
    origem text DEFAULT 'reserva' CHECK (origem IN ('reserva','bom','manual','reprocessamento')),
    status text DEFAULT 'pendente' CHECK (status IN ('pendente','sugerida','respondida','fechada')),
    quantidade_planejada numeric DEFAULT 0,
    quantidade_reservada numeric DEFAULT 0,
    quantidade_consumida numeric DEFAULT 0,
    quantidade_disponivel numeric DEFAULT 0,
    estoque_seguranca numeric DEFAULT 0,
    necessidade_liquida numeric DEFAULT 0,
    lead_time_dias integer DEFAULT 0,
    data_necessidade date,
    mensagem text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (empresa_id, componente_id)
);

ALTER TABLE public.industria_mrp_demandas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS industria_mrp_demandas_policy ON public.industria_mrp_demandas;
CREATE POLICY industria_mrp_demandas_policy ON public.industria_mrp_demandas
    USING (empresa_id = public.current_empresa_id());

CREATE TRIGGER industria_mrp_demandas_updated_at
BEFORE UPDATE ON public.industria_mrp_demandas
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_mrp_demandas_status ON public.industria_mrp_demandas(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_mrp_demandas_produto ON public.industria_mrp_demandas(empresa_id, produto_id);

-- 3) Sync helper
CREATE OR REPLACE FUNCTION public.mrp_sync_demanda_componente(p_componente_id uuid, p_origem text DEFAULT 'reserva')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_comp record;
    v_params record;
    v_disponivel numeric := 0;
    v_liquida numeric := 0;
    v_mensagem text;
BEGIN
    SELECT c.*, o.numero AS ordem_numero, o.data_prevista_inicio, o.data_prevista_entrega
      INTO v_comp
      FROM public.industria_producao_componentes c
      JOIN public.industria_producao_ordens o ON o.id = c.ordem_id
     WHERE c.id = p_componente_id
       AND c.empresa_id = public.current_empresa_id();

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT * INTO v_params
      FROM public.industria_mrp_parametros
     WHERE empresa_id = v_comp.empresa_id
       AND produto_id = v_comp.produto_id;

    SELECT COALESCE(SUM(saldo), 0)
      INTO v_disponivel
      FROM public.estoque_lotes
     WHERE empresa_id = v_comp.empresa_id
       AND produto_id = v_comp.produto_id;

    v_liquida :=
        GREATEST(
            COALESCE(v_comp.quantidade_planejada,0)
            - COALESCE(v_comp.quantidade_reservada,0)
            - COALESCE(v_comp.quantidade_consumida,0)
            - v_disponivel
            + COALESCE(v_params.estoque_seguranca,0),
            0
        );

    IF v_liquida <= 0 THEN
        DELETE FROM public.industria_mrp_demandas
         WHERE empresa_id = v_comp.empresa_id
           AND componente_id = p_componente_id;
        RETURN;
    END IF;

    v_mensagem := 'Necessidade de ' || v_liquida::text || ' ' || COALESCE(v_comp.unidade, 'un') ||
                  ' para OP ' || v_comp.ordem_id::text;

    INSERT INTO public.industria_mrp_demandas (
        empresa_id,
        produto_id,
        componente_id,
        ordem_id,
        origem,
        status,
        quantidade_planejada,
        quantidade_reservada,
        quantidade_consumida,
        quantidade_disponivel,
        estoque_seguranca,
        necessidade_liquida,
        lead_time_dias,
        data_necessidade,
        mensagem
    ) VALUES (
        v_comp.empresa_id,
        v_comp.produto_id,
        p_componente_id,
        v_comp.ordem_id,
        COALESCE(p_origem, 'reserva'),
        'pendente',
        COALESCE(v_comp.quantidade_planejada,0),
        COALESCE(v_comp.quantidade_reservada,0),
        COALESCE(v_comp.quantidade_consumida,0),
        v_disponivel,
        COALESCE(v_params.estoque_seguranca,0),
        v_liquida,
        COALESCE(v_params.lead_time_dias,0),
        COALESCE(v_comp.data_prevista_inicio, v_comp.data_prevista_entrega, now()::date),
        v_mensagem
    )
    ON CONFLICT (empresa_id, componente_id) DO UPDATE
        SET quantidade_planejada   = EXCLUDED.quantidade_planejada,
            quantidade_reservada   = EXCLUDED.quantidade_reservada,
            quantidade_consumida   = EXCLUDED.quantidade_consumida,
            quantidade_disponivel  = EXCLUDED.quantidade_disponivel,
            estoque_seguranca      = EXCLUDED.estoque_seguranca,
            necessidade_liquida    = EXCLUDED.necessidade_liquida,
            lead_time_dias         = EXCLUDED.lead_time_dias,
            data_necessidade       = EXCLUDED.data_necessidade,
            origem                 = EXCLUDED.origem,
            mensagem               = EXCLUDED.mensagem,
            status                 = 'pendente',
            updated_at             = now();
END;
$$;

-- 4) Reprocess helpers
CREATE OR REPLACE FUNCTION public.mrp_reprocessar_ordem(p_ordem_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
    rec record;
BEGIN
    FOR rec IN
        SELECT id FROM public.industria_producao_componentes
         WHERE ordem_id = p_ordem_id
           AND empresa_id = v_empresa_id
    LOOP
        PERFORM public.mrp_sync_demanda_componente(rec.id, 'reprocessamento');
    END LOOP;
END;
$$;

-- 5) Parameters RPCs
CREATE OR REPLACE FUNCTION public.mrp_item_parametros_list(p_search text DEFAULT NULL)
RETURNS TABLE (
    id uuid,
    produto_id uuid,
    produto_nome text,
    lead_time_dias integer,
    lote_minimo numeric,
    multiplo_compra numeric,
    estoque_seguranca numeric,
    fornecedor_preferencial_id uuid,
    politica_picking text,
    updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT
        mp.id,
        mp.produto_id,
        prod.nome AS produto_nome,
        mp.lead_time_dias,
        mp.lote_minimo,
        mp.multiplo_compra,
        mp.estoque_seguranca,
        mp.fornecedor_preferencial_id,
        mp.politica_picking,
        mp.updated_at
    FROM public.industria_mrp_parametros mp
    JOIN public.produtos prod ON prod.id = mp.produto_id
    WHERE mp.empresa_id = public.current_empresa_id()
      AND (
            p_search IS NULL
         OR prod.nome ILIKE '%' || p_search || '%'
      )
    ORDER BY prod.nome;
$$;

CREATE OR REPLACE FUNCTION public.mrp_item_parametros_upsert(
    p_produto_id uuid,
    p_lead_time integer DEFAULT 0,
    p_lote_minimo numeric DEFAULT 0,
    p_multiplo_compra numeric DEFAULT 1,
    p_estoque_seguranca numeric DEFAULT 0,
    p_politica_picking text DEFAULT 'FIFO',
    p_fornecedor_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
    v_id uuid;
BEGIN
    INSERT INTO public.industria_mrp_parametros (
        empresa_id,
        produto_id,
        lead_time_dias,
        lote_minimo,
        multiplo_compra,
        estoque_seguranca,
        politica_picking,
        fornecedor_preferencial_id
    ) VALUES (
        v_empresa_id,
        p_produto_id,
        COALESCE(p_lead_time,0),
        COALESCE(p_lote_minimo,0),
        COALESCE(p_multiplo_compra,1),
        COALESCE(p_estoque_seguranca,0),
        COALESCE(p_politica_picking, 'FIFO'),
        p_fornecedor_id
    )
    ON CONFLICT (empresa_id, produto_id) DO UPDATE
        SET lead_time_dias = EXCLUDED.lead_time_dias,
            lote_minimo = EXCLUDED.lote_minimo,
            multiplo_compra = EXCLUDED.multiplo_compra,
            estoque_seguranca = EXCLUDED.estoque_seguranca,
            politica_picking = EXCLUDED.politica_picking,
            fornecedor_preferencial_id = EXCLUDED.fornecedor_preferencial_id,
            updated_at = now()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- 6) Demand listing
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
    prioridade text
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
        END AS prioridade
    FROM public.industria_mrp_demandas d
    JOIN public.produtos prod ON prod.id = d.produto_id
    LEFT JOIN public.industria_producao_ordens ord ON ord.id = d.ordem_id
    WHERE d.empresa_id = public.current_empresa_id()
      AND (p_status IS NULL OR d.status = p_status)
    ORDER BY d.data_necessidade NULLS LAST, d.updated_at DESC;
$$;

-- 7) Hook reservation RPC to sync demand
DROP FUNCTION IF EXISTS public.industria_producao_reservar(uuid, uuid, text, numeric);
CREATE OR REPLACE FUNCTION public.industria_producao_reservar(
    p_ordem_id uuid,
    p_componente_id uuid,
    p_lote text,
    p_quantidade numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
    v_produto_id uuid;
    v_saldo_lote numeric;
    v_status_qa public.status_lote_qa;
    v_ja_reservado_lote numeric;
    v_ja_reservado_this numeric := 0;
    v_delta numeric;
BEGIN
    SELECT produto_id INTO v_produto_id
    FROM public.industria_producao_componentes
    WHERE id = p_componente_id AND ordem_id = p_ordem_id AND empresa_id = v_empresa_id;

    IF v_produto_id IS NULL THEN
        RAISE EXCEPTION 'Componente não encontrado ou não pertence à ordem.';
    END IF;

    SELECT saldo, status_qa INTO v_saldo_lote, v_status_qa
    FROM public.estoque_lotes
    WHERE empresa_id = v_empresa_id AND produto_id = v_produto_id AND lote = p_lote;

    IF v_saldo_lote IS NULL THEN
        RAISE EXCEPTION 'Lote % não encontrado para o produto.', p_lote;
    END IF;

    IF v_status_qa IS DISTINCT FROM 'aprovado' THEN
        RAISE EXCEPTION 'Lote bloqueado por Qualidade. Libere para reservar/consumir.';
    END IF;

    SELECT COALESCE(SUM(quantidade), 0) INTO v_ja_reservado_lote
    FROM public.industria_reservas
    WHERE empresa_id = v_empresa_id AND lote = p_lote
      AND componente_id IN (
          SELECT id FROM public.industria_producao_componentes 
          WHERE produto_id = v_produto_id AND empresa_id = v_empresa_id
      );

    SELECT COALESCE(quantidade, 0) INTO v_ja_reservado_this
    FROM public.industria_reservas
    WHERE empresa_id = v_empresa_id AND ordem_id = p_ordem_id 
      AND componente_id = p_componente_id AND lote = p_lote;

    v_delta := p_quantidade - v_ja_reservado_this;

    IF v_delta > 0 THEN
        IF (v_saldo_lote - v_ja_reservado_lote) < v_delta THEN
            RAISE EXCEPTION 'Saldo insuficiente no lote %. Disponível: %, Solicitado: %', 
                p_lote, (v_saldo_lote - v_ja_reservado_lote), v_delta;
        END IF;
    END IF;

    IF p_quantidade <= 0 THEN
        DELETE FROM public.industria_reservas
        WHERE empresa_id = v_empresa_id AND ordem_id = p_ordem_id 
          AND componente_id = p_componente_id AND lote = p_lote;
    ELSE
        INSERT INTO public.industria_reservas (empresa_id, ordem_id, componente_id, lote, quantidade)
        VALUES (v_empresa_id, p_ordem_id, p_componente_id, p_lote, p_quantidade)
        ON CONFLICT (empresa_id, ordem_id, componente_id, lote)
        DO UPDATE SET quantidade = EXCLUDED.quantidade, updated_at = now();
    END IF;

    UPDATE public.industria_producao_componentes
    SET quantidade_reservada = (
        SELECT COALESCE(SUM(quantidade), 0)
        FROM public.industria_reservas
        WHERE empresa_id = v_empresa_id AND componente_id = p_componente_id
    ),
    updated_at = now()
    WHERE id = p_componente_id;

    PERFORM public.mrp_sync_demanda_componente(p_componente_id, 'reserva');

    RETURN jsonb_build_object('success', true);
END;
$$;

COMMIT;
