
-- RPC: Get Available Lots (with balance > 0)
CREATE OR REPLACE FUNCTION public.estoque_get_lotes_disponiveis(p_produto_id uuid)
RETURNS TABLE (
    lote text,
    validade date,
    saldo numeric,
    custo_medio numeric,
    reservado numeric,
    disponivel numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
BEGIN
    RETURN QUERY
    SELECT 
        l.lote,
        l.validade,
        l.saldo,
        l.custo_medio,
        COALESCE(SUM(r.quantidade), 0) as reservado,
        (l.saldo - COALESCE(SUM(r.quantidade), 0)) as disponivel
    FROM public.estoque_lotes l
    LEFT JOIN public.industria_reservas r ON r.empresa_id = l.empresa_id 
        AND r.lote = l.lote 
        AND r.componente_id IN (
            SELECT id FROM public.industria_producao_componentes 
            WHERE produto_id = p_produto_id AND empresa_id = v_empresa_id
        )
    WHERE l.empresa_id = v_empresa_id
      AND l.produto_id = p_produto_id
      AND l.saldo > 0
    GROUP BY l.id, l.lote, l.validade, l.saldo, l.custo_medio
    ORDER BY l.validade ASC NULLS LAST, l.created_at ASC;
END;
$$;

-- RPC: Reservar Lote para Ordem
-- Idempotent: If reservation exists for (ordem, componente, lote), update quantity (add delta).
-- Validates: Check if lot has available balance (saldo - reserved).
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

    -- 2. Get Lot Balance
    SELECT saldo INTO v_saldo_lote
    FROM public.estoque_lotes
    WHERE empresa_id = v_empresa_id AND produto_id = v_produto_id AND lote = p_lote;

    IF v_saldo_lote IS NULL THEN
        RAISE EXCEPTION 'Lote % não encontrado para o produto.', p_lote;
    END IF;

    -- 3. Calculate Total Reserved for this Lot (across ALL orders)
    SELECT COALESCE(SUM(quantidade), 0) INTO v_ja_reservado_lote
    FROM public.industria_reservas
    WHERE empresa_id = v_empresa_id AND lote = p_lote
      AND componente_id IN (
          SELECT id FROM public.industria_producao_componentes 
             WHERE produto_id = v_produto_id AND empresa_id = v_empresa_id
      );

    -- 4. Calculate what is already reserved for THIS specific (ordem, componente, lote)
    -- We are "Setting" the reservation to p_quantidade. So we check if we are increasing or decreasing.
    -- Wait! The frontend might send "Add 10". Or "Set to 10".
    -- Let's assume SET TO. Because standard UI usually reflects "Current State".
    -- However, standard flow is: User selects 10. We check if 10 is available.
    -- If user already reserved 5, and now wants 10, we need +5 availability.
    
    SELECT COALESCE(quantidade, 0) INTO v_ja_reservado_this
    FROM public.industria_reservas
    WHERE empresa_id = v_empresa_id AND ordem_id = p_ordem_id 
      AND componente_id = p_componente_id AND lote = p_lote;

    v_delta := p_quantidade - v_ja_reservado_this;

    v_disponivel := v_saldo_lote - v_ja_reservado_lote;

    -- If delta > 0, check availability
    -- Note: v_ja_reservado_lote INCLUDES v_ja_reservado_this.
    -- So real "Other" reservations = v_ja_reservado_lote - v_ja_reservado_this.
    -- Real Available = v_saldo_lote - (v_ja_reservado_lote - v_ja_reservado_this).
    -- New Total Req = p_quantidade.
    -- Check: p_quantidade <= Real Available ?? No.
    -- Check: p_quantidade <= (v_saldo_lote - (others)).
    -- Check: p_quantidade <= v_saldo_lote - (v_ja_reservado_lote - v_ja_reservado_this)
    -- Simplifies to: p_quantidade - v_ja_reservado_this <= v_saldo_lote - v_ja_reservado_lote.
    -- i.e., v_delta <= (v_disponivel ?? No, v_disponivel calc above includes 'this').

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

    -- 6. Update Component Summary (quantidade_reservada)
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


-- RPC: Consumir Lote (Point-of-Use)
-- Decreases Stock, Removes Reservation (if exists), Increases Consumed in Component.
CREATE OR REPLACE FUNCTION public.industria_producao_consumir(
    p_ordem_id uuid,
    p_componente_id uuid,
    p_lote text,
    p_quantidade numeric,
    p_etapa_id uuid DEFAULT NULL -- Optional link to operation
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
BEGIN
    -- 1. Validate
    SELECT produto_id INTO v_produto_id
    FROM public.industria_producao_componentes
    WHERE id = p_componente_id AND ordem_id = p_ordem_id AND empresa_id = v_empresa_id;

    IF v_produto_id IS NULL THEN
        RAISE EXCEPTION 'Componente não encontrado.';
    END IF;

    -- 2. Check Balance
    SELECT saldo INTO v_saldo_lote
    FROM public.estoque_lotes
    WHERE empresa_id = v_empresa_id AND produto_id = v_produto_id AND lote = p_lote;

    IF v_saldo_lote < p_quantidade THEN
        RAISE EXCEPTION 'Saldo insuficiente no lote % para consumir %.', p_lote, p_quantidade;
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

    -- 5. Decrease Reservation (logic: consumed quantity reduces need for reservation)
    -- If reserved 100, consumed 20. Reservation should become 80.
    -- User case: "Consuming reserved material".
    SELECT quantidade INTO v_reservado_this
    FROM public.industria_reservas
    WHERE empresa_id = v_empresa_id AND ordem_id = p_ordem_id 
      AND componente_id = p_componente_id AND lote = p_lote;

    IF v_reservado_this IS NOT NULL AND v_reservado_this > 0 THEN
        -- Reduce reservation by consumed amount, but floor at 0
        UPDATE public.industria_reservas
        SET quantidade = GREATEST(0, quantidade - p_quantidade), updated_at = now()
        WHERE empresa_id = v_empresa_id AND ordem_id = p_ordem_id 
          AND componente_id = p_componente_id AND lote = p_lote;
        
        -- Cleanup zero reservation
        DELETE FROM public.industria_reservas 
        WHERE empresa_id = v_empresa_id AND ordem_id = p_ordem_id 
          AND componente_id = p_componente_id AND lote = p_lote AND quantidade <= 0;
    END IF;

    -- 6. Update Component Consumed Quantity & Recalculate Reserved Total
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


-- Helper RPC to create Initial Stock with Lot (for testing)
CREATE OR REPLACE FUNCTION public.estoque_add_saldo_lote(
    p_produto_id uuid,
    p_lote text,
    p_quantidade numeric,
    p_validade date DEFAULT NULL,
    p_custo numeric DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
    v_saldo_atual numeric;
BEGIN
    INSERT INTO public.estoque_lotes (empresa_id, produto_id, lote, saldo, validade, custo_medio)
    VALUES (v_empresa_id, p_produto_id, p_lote, p_quantidade, p_validade, p_custo)
    ON CONFLICT (empresa_id, produto_id, lote)
    DO UPDATE SET 
        saldo = public.estoque_lotes.saldo + p_quantidade,
        updated_at = now();

    -- Log movement
    SELECT saldo INTO v_saldo_atual FROM public.estoque_lotes 
    WHERE empresa_id = v_empresa_id AND produto_id = p_produto_id AND lote = p_lote;

    INSERT INTO public.estoque_movimentos (
        empresa_id, produto_id, tipo, quantidade, 
        saldo_anterior, saldo_novo, 
        tipo_mov, lote, observacoes
    )
    VALUES (
        v_empresa_id, p_produto_id, 'entrada', p_quantidade,
        v_saldo_atual - p_quantidade, v_saldo_atual,
        'ajuste_entrada', p_lote, 'Carga Inicial Lote'
    );
END;
$$;
