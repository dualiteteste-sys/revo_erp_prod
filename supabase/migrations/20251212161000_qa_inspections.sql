-- =============================================================================
-- QA IP/IF Inspections, Lot Blocking Enforcement, and Operation Gating
-- =============================================================================

BEGIN;

-- 1. Status enum for inspections
DO $$ BEGIN
    CREATE TYPE public.status_inspecao_qa AS ENUM ('aprovada', 'reprovada', 'em_analise');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Inspection master data (plans & characteristics)
CREATE TABLE IF NOT EXISTS public.industria_qualidade_planos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id() NOT NULL,
    nome text NOT NULL,
    produto_id uuid REFERENCES public.produtos(id) ON DELETE CASCADE,
    operacao_id uuid REFERENCES public.industria_producao_operacoes(id) ON DELETE CASCADE,
    tipo text NOT NULL CHECK (tipo IN ('IP','IF')),
    severidade text,
    aql text,
    amostragem text,
    ativo boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.industria_qualidade_planos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qualidade_planos_policy ON public.industria_qualidade_planos;
CREATE POLICY qualidade_planos_policy ON public.industria_qualidade_planos
    USING (empresa_id = public.current_empresa_id());

CREATE TABLE IF NOT EXISTS public.industria_qualidade_plano_caracteristicas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id() NOT NULL,
    plano_id uuid REFERENCES public.industria_qualidade_planos(id) ON DELETE CASCADE,
    descricao text NOT NULL,
    tolerancia_min numeric,
    tolerancia_max numeric,
    unidade text,
    instrumento text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.industria_qualidade_plano_caracteristicas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qualidade_planos_caracteristicas_policy ON public.industria_qualidade_plano_caracteristicas;
CREATE POLICY qualidade_planos_caracteristicas_policy ON public.industria_qualidade_plano_caracteristicas
    USING (empresa_id = public.current_empresa_id());

-- 3. Inspection records table
CREATE TABLE IF NOT EXISTS public.industria_qualidade_inspecoes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid DEFAULT public.current_empresa_id() NOT NULL,
    ordem_id uuid REFERENCES public.industria_producao_ordens(id) ON DELETE CASCADE,
    operacao_id uuid REFERENCES public.industria_producao_operacoes(id) ON DELETE CASCADE,
    tipo text NOT NULL CHECK (tipo IN ('IP','IF')),
    resultado public.status_inspecao_qa DEFAULT 'em_analise',
    lote_id uuid REFERENCES public.estoque_lotes(id) ON DELETE SET NULL,
    quantidade_inspecionada numeric DEFAULT 0,
    quantidade_aprovada numeric DEFAULT 0,
    quantidade_reprovada numeric DEFAULT 0,
    motivo_refugo_id uuid REFERENCES public.industria_qualidade_motivos(id) ON DELETE SET NULL,
    observacoes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.industria_qualidade_inspecoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qualidade_inspecoes_policy ON public.industria_qualidade_inspecoes;
CREATE POLICY qualidade_inspecoes_policy ON public.industria_qualidade_inspecoes
    USING (empresa_id = public.current_empresa_id());

CREATE INDEX IF NOT EXISTS idx_qualidade_inspecoes_operacao ON public.industria_qualidade_inspecoes(operacao_id, tipo, resultado);

-- 4. Operations columns for gating
ALTER TABLE public.industria_producao_operacoes
    ADD COLUMN IF NOT EXISTS require_ip boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS require_if boolean DEFAULT false;

-- 5. Reserve/consume guards for non-approved lots
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
    v_disponivel numeric;
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
    v_disponivel := v_saldo_lote - v_ja_reservado_lote;

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

    RETURN jsonb_build_object('success', true);
END;
$$;

DROP FUNCTION IF EXISTS public.industria_producao_consumir(uuid, uuid, text, numeric, uuid);
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
    v_status_qa public.status_lote_qa;
BEGIN
    SELECT produto_id INTO v_produto_id
    FROM public.industria_producao_componentes
    WHERE id = p_componente_id AND ordem_id = p_ordem_id AND empresa_id = v_empresa_id;

    IF v_produto_id IS NULL THEN
        RAISE EXCEPTION 'Componente não encontrado.';
    END IF;

    SELECT saldo, status_qa INTO v_saldo_lote, v_status_qa
    FROM public.estoque_lotes
    WHERE empresa_id = v_empresa_id AND produto_id = v_produto_id AND lote = p_lote;

    IF v_saldo_lote < p_quantidade THEN
        RAISE EXCEPTION 'Saldo insuficiente no lote % para consumir %.', p_lote, p_quantidade;
    END IF;

    IF v_status_qa IS DISTINCT FROM 'aprovado' THEN
        RAISE EXCEPTION 'Lote bloqueado por Qualidade. Libere para reservar/consumir.';
    END IF;

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

    UPDATE public.estoque_lotes
    SET saldo = saldo - p_quantidade, updated_at = now()
    WHERE empresa_id = v_empresa_id AND produto_id = v_produto_id AND lote = p_lote;

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

-- 6. Inspections RPC (register + list)
DROP FUNCTION IF EXISTS public.qualidade_registrar_inspecao(uuid, uuid, text, public.status_qualidade, numeric, numeric, numeric, uuid, text);
CREATE OR REPLACE FUNCTION public.qualidade_registrar_inspecao(
    p_ordem_id uuid,
    p_operacao_id uuid,
    p_tipo text,
    p_resultado public.status_inspecao_qa,
    p_qtd_inspecionada numeric,
    p_qtd_aprovada numeric,
    p_qtd_rejeitada numeric,
    p_motivo_id uuid DEFAULT NULL,
    p_observacoes text DEFAULT NULL,
    p_lote_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
    v_tipo_normalized text := upper(p_tipo);
    v_id uuid;
BEGIN
    IF v_tipo_normalized NOT IN ('IP','IF') THEN
        RAISE EXCEPTION 'Tipo de inspeção inválido.';
    END IF;

    INSERT INTO public.industria_qualidade_inspecoes (
        empresa_id, ordem_id, operacao_id, tipo, resultado,
        lote_id, quantidade_inspecionada, quantidade_aprovada,
        quantidade_reprovada, motivo_refugo_id, observacoes
    ) VALUES (
        v_empresa_id, p_ordem_id, p_operacao_id, v_tipo_normalized, p_resultado,
        p_lote_id, p_qtd_inspecionada, p_qtd_aprovada,
        p_qtd_rejeitada, p_motivo_id, p_observacoes
    )
    RETURNING id INTO v_id;

    IF p_lote_id IS NOT NULL THEN
        UPDATE public.estoque_lotes
        SET status_qa = CASE p_resultado
            WHEN 'aprovada' THEN 'aprovado'
            WHEN 'reprovada' THEN 'reprovado'
            ELSE 'em_analise'
        END,
        updated_at = now()
        WHERE id = p_lote_id AND empresa_id = v_empresa_id;
    END IF;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.qualidade_list_inspecoes(p_operacao_id uuid)
RETURNS TABLE (
    id uuid,
    tipo text,
    resultado public.status_inspecao_qa,
    quantidade_inspecionada numeric,
    quantidade_aprovada numeric,
    quantidade_reprovada numeric,
    created_at timestamptz,
    observacoes text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT id, tipo, resultado, quantidade_inspecionada, quantidade_aprovada, quantidade_reprovada,
           created_at, observacoes
    FROM public.industria_qualidade_inspecoes
    WHERE operacao_id = p_operacao_id AND empresa_id = public.current_empresa_id()
    ORDER BY created_at DESC;
$$;

-- 7. Operation gating
DROP FUNCTION IF EXISTS public.industria_producao_registrar_evento(uuid, text);
CREATE OR REPLACE FUNCTION public.industria_producao_registrar_evento(p_operacao_id uuid, p_tipo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status_atual text;
  v_seq int;
  v_ordem_id uuid;
  v_prev_concluida boolean;
  v_prev_transferida numeric;
  v_permite_overlap_anterior boolean;
  v_prev_require_ip boolean;
  v_prev_operacao_id uuid;
BEGIN
  SELECT status, sequencia, ordem_id
  INTO v_status_atual, v_seq, v_ordem_id
  FROM public.industria_producao_operacoes
  WHERE id = p_operacao_id;

  IF p_tipo = 'iniciar' THEN
    IF v_status_atual NOT IN ('na_fila', 'pendente', 'pausada', 'em_preparacao') THEN
       RAISE EXCEPTION 'Operação não pode ser iniciada (status atual: %)', v_status_atual;
    END IF;

    UPDATE public.industria_producao_ordens 
    SET status = 'em_producao' 
    WHERE id = v_ordem_id AND status IN ('planejada', 'em_programacao');

    IF v_seq > 10 THEN 
       SELECT id, status = 'concluida', quantidade_transferida, permite_overlap, require_ip
       INTO v_prev_operacao_id, v_prev_concluida, v_prev_transferida, v_permite_overlap_anterior, v_prev_require_ip
       FROM public.industria_producao_operacoes
       WHERE ordem_id = v_ordem_id AND sequencia < v_seq
       ORDER BY sequencia DESC LIMIT 1;
       
       IF v_prev_operacao_id IS NOT NULL THEN
           IF v_prev_require_ip AND NOT EXISTS (
                SELECT 1 FROM public.industria_qualidade_inspecoes iq
                WHERE iq.operacao_id = v_prev_operacao_id
                  AND iq.tipo = 'IP'
                  AND iq.resultado = 'aprovada'
           ) THEN
               RAISE EXCEPTION 'IP pendente nesta etapa. Realize a inspeção para liberar a próxima.';
           END IF;

           IF NOT v_prev_concluida THEN
              IF NOT v_permite_overlap_anterior THEN
                 RAISE EXCEPTION 'Etapa anterior não concluída e não permite overlap.';
              END IF;
           END IF;
       END IF;
    END IF;

    UPDATE public.industria_producao_operacoes
    SET status = 'em_execucao',
        data_inicio_real = COALESCE(data_inicio_real, now()),
        updated_at = now()
    WHERE id = p_operacao_id;

    INSERT INTO public.industria_producao_apontamentos (empresa_id, operacao_id, usuario_id, tipo, observacoes)
    VALUES (public.current_empresa_id(), p_operacao_id, auth.uid(), 'producao', 'Iniciado');

  ELSIF p_tipo = 'pausar' THEN
    UPDATE public.industria_producao_operacoes SET status = 'pausada', updated_at = now() WHERE id = p_operacao_id;
    INSERT INTO public.industria_producao_apontamentos (empresa_id, operacao_id, usuario_id, tipo, observacoes)
    VALUES (public.current_empresa_id(), p_operacao_id, auth.uid(), 'parada', 'Pausado');

  ELSIF p_tipo = 'retomar' THEN
    UPDATE public.industria_producao_operacoes SET status = 'em_execucao', updated_at = now() WHERE id = p_operacao_id;
    INSERT INTO public.industria_producao_apontamentos (empresa_id, operacao_id, usuario_id, tipo, observacoes)
    VALUES (public.current_empresa_id(), p_operacao_id, auth.uid(), 'retorno', 'Retomado');

  ELSIF p_tipo = 'concluir' THEN
    UPDATE public.industria_producao_operacoes
    SET status = 'concluida',
        data_fim_real = now(),
        quantidade_transferida = quantidade_produzida,
        updated_at = now()
    WHERE id = p_operacao_id;

    INSERT INTO public.industria_producao_apontamentos (empresa_id, operacao_id, usuario_id, tipo, observacoes)
    VALUES (public.current_empresa_id(), p_operacao_id, auth.uid(), 'conclusao', 'Concluído');

  ELSE
    RAISE EXCEPTION 'Tipo de evento inválido: %', p_tipo;
  END IF;

END;
$$;

-- 8. Require IF before closing
DROP FUNCTION IF EXISTS public.industria_producao_fechar(uuid);
CREATE OR REPLACE FUNCTION public.industria_producao_fechar(
    p_ordem_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
    v_ordem record;
    v_comp record;
    v_qtd_necessaria_total numeric;
    v_qtd_pendente numeric;
    v_lote_rec record;
    v_consumir_lote numeric;
BEGIN
    SELECT * INTO v_ordem 
    FROM public.industria_producao_ordens 
    WHERE id = p_ordem_id AND empresa_id = v_empresa_id;

    IF v_ordem.status = 'concluida' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Ordem já concluída.');
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.industria_producao_operacoes
        WHERE ordem_id = p_ordem_id AND require_if = true
    ) AND NOT EXISTS (
        SELECT 1 FROM public.industria_qualidade_inspecoes
        WHERE ordem_id = p_ordem_id AND tipo = 'IF' AND resultado = 'aprovada'
    ) THEN
        RAISE EXCEPTION 'Inspeção Final pendente. Aprove ou registre a IF para fechar a ordem.';
    END IF;

    FOR v_comp IN 
        SELECT c.*, p.rastreabilidade 
        FROM public.industria_producao_componentes c
        JOIN public.produtos p ON p.id = c.produto_id
        WHERE c.ordem_id = p_ordem_id AND c.empresa_id = v_empresa_id
    LOOP
        IF v_ordem.quantidade_planejada > 0 THEN
             v_qtd_necessaria_total := (v_comp.quantidade_planejada / v_ordem.quantidade_planejada) * v_ordem.total_entregue;
        ELSE
             v_qtd_necessaria_total := 0;
        END IF;

        v_qtd_pendente := v_qtd_necessaria_total - v_comp.quantidade_consumida;

        IF v_qtd_pendente > 0.0001 THEN
             FOR v_lote_rec IN 
                 SELECT * FROM public.estoque_lotes 
                 WHERE produto_id = v_comp.produto_id AND empresa_id = v_empresa_id AND saldo > 0
                 ORDER BY validade ASC NULLS LAST, created_at ASC
             LOOP
                 EXIT WHEN v_qtd_pendente <= 0;
                 
                 v_consumir_lote := LEAST(v_qtd_pendente, v_lote_rec.saldo);
                 
                 UPDATE public.estoque_lotes 
                 SET saldo = saldo - v_consumir_lote 
                 WHERE id = v_lote_rec.id;
                 
                 INSERT INTO public.estoque_movimentos (
                    empresa_id, produto_id, tipo, quantidade, 
                    saldo_anterior, saldo_novo, 
                    origem_tipo, origem_id, tipo_mov, lote, observacoes
                 ) VALUES (
                    v_empresa_id, v_comp.produto_id, 'saida', v_consumir_lote,
                    v_lote_rec.saldo, v_lote_rec.saldo - v_consumir_lote,
                    'ordem_producao', p_ordem_id, 'consumo_producao_backflush', v_lote_rec.lote,
                    'Backflush Fechamento OP ' || v_ordem.numero
                 );
                 
                 UPDATE public.industria_producao_componentes
                 SET quantidade_consumida = quantidade_consumida + v_consumir_lote
                 WHERE id = v_comp.id;

                 v_qtd_pendente := v_qtd_pendente - v_consumir_lote;
             END LOOP;
        END IF;
    END LOOP;

    UPDATE public.industria_producao_ordens
    SET status = 'concluida',
        updated_at = now()
    WHERE id = p_ordem_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

COMMIT;
