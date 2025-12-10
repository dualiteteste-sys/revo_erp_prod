-- Phase 5: Quality, MRP, PCP Schema Updates

-- 1. Quality Enum
BEGIN;

DO $$ BEGIN
    CREATE TYPE public.status_qualidade AS ENUM ('aprovado', 'em_analise', 'bloqueado', 'reprovado');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Update estoque_lotes
-- Add column safely
DO $$ BEGIN
    ALTER TABLE public.estoque_lotes 
    ADD COLUMN status_qualidade public.status_qualidade NOT NULL DEFAULT 'aprovado';
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- 3. Quality Tables
CREATE TABLE IF NOT EXISTS public.qualidade_motivos_refugo (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id(),
    codigo text NOT NULL,
    descricao text NOT NULL,
    ativo boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.qualidade_inspecoes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id(),
    ordem_id uuid REFERENCES public.industria_producao_ordens(id),
    operacao_id uuid REFERENCES public.industria_producao_operacoes(id),
    lote text NOT NULL, 
    resultado public.status_qualidade NOT NULL,
    quantidade_inspecionada numeric,
    quantidade_aprovada numeric,
    quantidade_rejeitada numeric,
    motivo_refugo_id uuid REFERENCES public.qualidade_motivos_refugo(id),
    observacoes text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.qualidade_motivos_refugo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso por empresa" ON public.qualidade_motivos_refugo;
CREATE POLICY "Acesso por empresa" ON public.qualidade_motivos_refugo USING (empresa_id = public.current_empresa_id());

ALTER TABLE public.qualidade_inspecoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso por empresa" ON public.qualidade_inspecoes;
CREATE POLICY "Acesso por empresa" ON public.qualidade_inspecoes USING (empresa_id = public.current_empresa_id());

-- 4. MRP Columns in Produtos
DO $$ BEGIN
    ALTER TABLE public.produtos ADD COLUMN estoque_seguranca numeric DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.produtos ADD COLUMN lote_minimo_compra numeric DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.produtos ADD COLUMN lead_time_dias integer DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- 5. Updated RPCs with Blocking Logic

-- RPC: Reservar Lote (Updated for Quality Check)
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
    v_status_qualidade public.status_qualidade; -- NEW
    v_ja_reservado_lote numeric;
    v_ja_reservado_this numeric := 0;
    v_disponivel numeric;
    v_delta numeric;
BEGIN
    -- 1. Get Component + Product
    SELECT produto_id INTO v_produto_id
    FROM public.industria_producao_componentes
    WHERE id = p_componente_id AND ordem_id = p_ordem_id AND empresa_id = v_empresa_id;

    IF v_produto_id IS NULL THEN
        RAISE EXCEPTION 'Componente não encontrado ou não pertence à ordem.';
    END IF;

    -- 2. Get Lot Balance AND Status -- NEW
    SELECT saldo, status_qualidade INTO v_saldo_lote, v_status_qualidade
    FROM public.estoque_lotes
    WHERE empresa_id = v_empresa_id AND produto_id = v_produto_id AND lote = p_lote;

    IF v_saldo_lote IS NULL THEN
        RAISE EXCEPTION 'Lote % não encontrado para o produto.', p_lote;
    END IF;

    -- QUALITY CHECK -- NEW
    IF v_status_qualidade != 'aprovado' THEN
        RAISE EXCEPTION 'Lote % está % e não pode ser reservado.', p_lote, v_status_qualidade;
    END IF;

    -- 3. Calculate Total Reserved for this Lot
    SELECT COALESCE(SUM(quantidade), 0) INTO v_ja_reservado_lote
    FROM public.industria_reservas
    WHERE empresa_id = v_empresa_id AND lote = p_lote
      AND componente_id IN (
          SELECT id FROM public.industria_producao_componentes 
             WHERE produto_id = v_produto_id AND empresa_id = v_empresa_id
      );

    -- 4. Calculate what is already reserved for THIS specific (ordem, componente, lote)
    SELECT COALESCE(quantidade, 0) INTO v_ja_reservado_this
    FROM public.industria_reservas
    WHERE empresa_id = v_empresa_id AND ordem_id = p_ordem_id 
      AND componente_id = p_componente_id AND lote = p_lote;

    v_delta := p_quantidade - v_ja_reservado_this;

    -- If delta > 0, check availability
    IF v_delta > 0 THEN
        IF (v_saldo_lote - v_ja_reservado_lote) < v_delta THEN
            RAISE EXCEPTION 'Saldo insuficiente no lote %. Disponível: %, Solicitado Adicional: %', 
                p_lote, (v_saldo_lote - v_ja_reservado_lote), v_delta;
        END IF;
    END IF;

    -- 5. Upsert Reservation
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

    -- 6. Update Component Summary
    UPDATE public.industria_producao_componentes
    SET quantidade_reservada = (
        SELECT COALESCE(SUM(quantidade), 0)
        FROM public.industria_reservas
        WHERE empresa_id = v_empresa_id AND componente_id = p_componente_id
    )
    WHERE id = p_componente_id;

    RETURN jsonb_build_object('success', true, 'delta', v_delta);
END;
$$;


-- RPC: Consumir Lote (Updated for Quality Check)
CREATE OR REPLACE FUNCTION public.industria_producao_consumir(
    p_ordem_id uuid,
    p_componente_id uuid,
    p_lote text,
    p_quantidade numeric,
    p_etapa_id uuid DEFAULT NULL 
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
    v_produto_id uuid;
    v_reservado_this numeric := 0;
    v_saldo_lote numeric;
    v_status_qualidade public.status_qualidade; -- NEW
BEGIN
    -- 1. Validate
    SELECT produto_id INTO v_produto_id
    FROM public.industria_producao_componentes
    WHERE id = p_componente_id AND ordem_id = p_ordem_id AND empresa_id = v_empresa_id;

    IF v_produto_id IS NULL THEN
        RAISE EXCEPTION 'Componente não encontrado.';
    END IF;

    -- 2. Check Balance AND Status -- NEW
    SELECT saldo, status_qualidade INTO v_saldo_lote, v_status_qualidade
    FROM public.estoque_lotes
    WHERE empresa_id = v_empresa_id AND produto_id = v_produto_id AND lote = p_lote;

    IF v_saldo_lote < p_quantidade THEN
        RAISE EXCEPTION 'Saldo insuficiente no lote % para consumir %.', p_lote, p_quantidade;
    END IF;

    -- QUALITY CHECK -- NEW
    IF v_status_qualidade != 'aprovado' THEN
        RAISE EXCEPTION 'Lote % está % e não pode ser consumido.', p_lote, v_status_qualidade;
    END IF;

    -- 3. Register Movement (SAIDA)
    INSERT INTO public.estoque_movimentos (
        empresa_id, produto_id, tipo, quantidade, 
        saldo_anterior, saldo_novo, 
        origem_tipo, origem_id, tipo_mov, lote, observacoes
    )
    VALUES (
        v_empresa_id, v_produto_id, 'saida', p_quantidade,
        v_saldo_lote, v_saldo_lote - p_quantidade,
        'ordem_producao', p_ordem_id, 'consumo_producao', p_lote, 
        'Consumo OP ' || (SELECT numero FROM public.industria_producao_ordens WHERE id = p_ordem_id)
    );

    -- 4. Update Lot Balance
    UPDATE public.estoque_lotes
    SET saldo = saldo - p_quantidade, updated_at = now()
    WHERE empresa_id = v_empresa_id AND produto_id = v_produto_id AND lote = p_lote;

    -- 5. Decrease Reservation
    SELECT quantidade INTO v_reservado_this
    FROM public.industria_reservas
    WHERE empresa_id = v_empresa_id AND ordem_id = p_ordem_id 
      AND componente_id = p_componente_id AND lote = p_lote;

    IF v_reservado_this IS NOT NULL AND v_reservado_this > 0 THEN
        UPDATE public.industria_reservas
        SET quantidade = GREATEST(0, quantidade - p_quantidade), updated_at = now()
        WHERE empresa_id = v_empresa_id AND ordem_id = p_ordem_id 
          AND componente_id = p_componente_id AND lote = p_lote;
        
        DELETE FROM public.industria_reservas 
        WHERE empresa_id = v_empresa_id AND ordem_id = p_ordem_id 
          AND componente_id = p_componente_id AND lote = p_lote AND quantidade <= 0;
    END IF;

    -- 6. Update Component Consumed Quantity
    UPDATE public.industria_producao_componentes
    SET 
        quantidade_consumida = quantidade_consumida + p_quantidade,
        quantidade_reservada = (
            SELECT COALESCE(SUM(quantidade), 0)
            FROM public.industria_reservas
            WHERE empresa_id = v_empresa_id AND componente_id = p_componente_id
        ),
        updated_at = now()
    WHERE id = p_componente_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

COMMIT;
