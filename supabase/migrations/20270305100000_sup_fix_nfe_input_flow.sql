-- ============================================================================
-- fix(sup): NF-e input flow — 4 correcoes
--   1. _create_recebimento_from_xml: recria recebimento_itens quando
--      cascade-deletados por re-registro do mesmo NF-e XML
--   2. beneficiamento_preview: adiciona n_lote ao retorno +
--      filtro empresa_id nos subqueries de produtos (multi-tenant)
--   3. estoque_process_from_recebimento: le lote/validade por item de
--      recebimento_itens (em vez de hardcoded 'SEM_LOTE')
--   4. suprimentos_recebimento_item_set_lote: novo RPC para editar lote
--      manualmente na etapa de conferencia do NfeInputPage
-- ============================================================================
-- Raiz dos bugs 3 e 4 do usuario (teste piloto):
--   fiscal_nfe_import_register faz ON CONFLICT DO UPDATE + deleta/recria itens.
--   recebimento_itens tem FK ON DELETE CASCADE -> itens deletados na re-importacao.
--   _create_recebimento_from_xml retornava 'exists' sem recriar itens.
--   Resultado: recebimento_itens vazio -> ConferenciaPage sem itens ->
--   finalizar_recebimento passa p_matches vazio ->
--   beneficiamento_process_from_import lanca "Item N sem mapeamento de produto".
-- ============================================================================

-- ============================================================================
-- 1. _create_recebimento_from_xml — recria itens quando cascade-deletados
-- ============================================================================
CREATE OR REPLACE FUNCTION public._create_recebimento_from_xml(
  p_import_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp            uuid := public.current_empresa_id();
  v_recebimento_id uuid;
  v_item           record;
  v_prod_id        uuid;
  v_status         text := 'created';
  v_items_count    int  := 0;
BEGIN
  SELECT id INTO v_recebimento_id
  FROM public.recebimentos
  WHERE fiscal_nfe_import_id = p_import_id AND empresa_id = v_emp;

  IF v_recebimento_id IS NOT NULL THEN
    -- Verifica se itens ainda existem (podem ter sido cascade-deletados quando
    -- o mesmo NF-e foi re-registrado via fiscal_nfe_import_register)
    SELECT count(*) INTO v_items_count
    FROM public.recebimento_itens
    WHERE recebimento_id = v_recebimento_id AND empresa_id = v_emp;

    IF v_items_count > 0 THEN
      RETURN jsonb_build_object('id', v_recebimento_id, 'status', 'exists');
    END IF;

    -- Itens cascade-deletados: recria a partir dos fiscal_nfe_import_items atuais
    v_status := 'reopened';
  ELSE
    INSERT INTO public.recebimentos (empresa_id, fiscal_nfe_import_id, status)
    VALUES (v_emp, p_import_id, 'pendente')
    RETURNING id INTO v_recebimento_id;
  END IF;

  FOR v_item IN
    SELECT * FROM public.fiscal_nfe_import_items
    WHERE import_id = p_import_id AND empresa_id = v_emp
  LOOP
    SELECT id INTO v_prod_id
    FROM public.produtos p
    WHERE p.empresa_id = v_emp
      AND (
        (p.sku = v_item.cprod AND coalesce(v_item.cprod,'') <> '') OR
        (p.gtin = v_item.ean AND coalesce(v_item.ean,'') <> '')
      )
    LIMIT 1;

    INSERT INTO public.recebimento_itens (
      empresa_id, recebimento_id, fiscal_nfe_item_id, produto_id, quantidade_xml,
      lote, data_fabricacao, data_validade
    ) VALUES (
      v_emp, v_recebimento_id, v_item.id, v_prod_id, v_item.qcom,
      v_item.n_lote, v_item.d_fab, v_item.d_val
    );
  END LOOP;

  RETURN jsonb_build_object('id', v_recebimento_id, 'status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public._create_recebimento_from_xml(uuid) FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public._create_recebimento_from_xml(uuid) TO service_role;

-- ============================================================================
-- 2. beneficiamento_preview — adiciona n_lote + filtro empresa_id
-- ============================================================================
CREATE OR REPLACE FUNCTION public.beneficiamento_preview(
  p_import_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp   uuid := public.current_empresa_id();
  v_head  jsonb;
  v_itens jsonb;
BEGIN
  SELECT to_jsonb(i.*) - 'xml_raw' INTO v_head
  FROM public.fiscal_nfe_imports i
  WHERE i.id = p_import_id
    AND i.empresa_id = v_emp;

  IF v_head IS NULL THEN
    RAISE EXCEPTION 'Import não encontrado.';
  END IF;

  SELECT coalesce(jsonb_agg(
           jsonb_build_object(
             'item_id', fi.id,
             'n_item',  fi.n_item,
             'cprod',   fi.cprod,
             'ean',     fi.ean,
             'xprod',   fi.xprod,
             'ucom',    fi.ucom,
             'qcom',    fi.qcom,
             'vuncom',  fi.vuncom,
             'vprod',   fi.vprod,
             'n_lote',  fi.n_lote,
             'match_produto_id',
             (
               SELECT p.id
               FROM public.produtos p
               WHERE p.empresa_id = v_emp
                 AND (
                   (p.sku = fi.cprod AND fi.cprod IS NOT NULL AND fi.cprod <> '') OR
                   (p.gtin = fi.ean  AND fi.ean  IS NOT NULL AND fi.ean  <> '')
                 )
               LIMIT 1
             ),
             'match_strategy',
             CASE
               WHEN EXISTS (SELECT 1 FROM public.produtos p WHERE p.empresa_id = v_emp AND p.sku = fi.cprod AND fi.cprod IS NOT NULL AND fi.cprod <> '')
                 THEN 'sku'
               WHEN EXISTS (SELECT 1 FROM public.produtos p WHERE p.empresa_id = v_emp AND p.gtin = fi.ean  AND fi.ean  IS NOT NULL AND fi.ean  <> '')
                 THEN 'ean'
               ELSE 'none'
             END
           ) ORDER BY fi.n_item
         ), '[]'::jsonb)
  INTO v_itens
  FROM public.fiscal_nfe_import_items fi
  WHERE fi.import_id = p_import_id
    AND fi.empresa_id = v_emp;

  RETURN jsonb_build_object('import', v_head, 'itens', v_itens);
END;
$$;

REVOKE ALL ON FUNCTION public.beneficiamento_preview(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.beneficiamento_preview(uuid) TO authenticated, service_role;

-- ============================================================================
-- 3. estoque_process_from_recebimento — le lote/validade de recebimento_itens
-- ============================================================================
CREATE OR REPLACE FUNCTION public.estoque_process_from_recebimento(
  p_recebimento_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_import_id uuid;
  v_row record;
  v_rows int := 0;
  v_has_depositos boolean := false;
  v_dep uuid;
  v_saldo_ant numeric := 0;
  v_saldo_novo numeric := 0;
  v_custo_ant numeric := 0;
  v_custo_novo numeric := 0;
  v_total numeric := 0;
  v_total_custo numeric := 0;
  v_doc text;

  -- landed cost
  v_rateio_base text := 'valor';
  v_custo_frete numeric := 0;
  v_custo_seguro numeric := 0;
  v_custo_impostos numeric := 0;
  v_custo_outros numeric := 0;
  v_total_adicional numeric := 0;
  v_base_total numeric := 0;
  v_item_base numeric := 0;
  v_item_share numeric := 0;
  v_adicional_unit numeric := 0;
  v_valor_unitario_eff numeric := 0;
BEGIN
  SELECT
    r.fiscal_nfe_import_id,
    coalesce(nullif(btrim(r.rateio_base),''),'valor'),
    coalesce(r.custo_frete,0),
    coalesce(r.custo_seguro,0),
    coalesce(r.custo_impostos,0),
    coalesce(r.custo_outros,0)
  INTO
    v_import_id,
    v_rateio_base,
    v_custo_frete,
    v_custo_seguro,
    v_custo_impostos,
    v_custo_outros
  FROM public.recebimentos r
  WHERE r.id = p_recebimento_id
    AND r.empresa_id = v_emp
  LIMIT 1;

  IF v_import_id IS NULL THEN
    RAISE EXCEPTION 'Recebimento não encontrado.';
  END IF;

  IF v_rateio_base NOT IN ('valor','quantidade') THEN
    v_rateio_base := 'valor';
  END IF;

  v_total_adicional := coalesce(v_custo_frete,0) + coalesce(v_custo_seguro,0) + coalesce(v_custo_impostos,0) + coalesce(v_custo_outros,0);

  SELECT
    CASE
      WHEN v_rateio_base = 'quantidade' THEN coalesce(sum(coalesce(nullif(ri.quantidade_conferida, 0), ri.quantidade_xml)), 0)
      ELSE coalesce(sum(coalesce(nullif(ri.quantidade_conferida, 0), ri.quantidade_xml) * coalesce(fi.vuncom, 0)), 0)
    END
  INTO v_base_total
  FROM public.recebimento_itens ri
  JOIN public.fiscal_nfe_import_items fi
    ON fi.id = ri.fiscal_nfe_item_id
   AND fi.empresa_id = v_emp
  WHERE ri.recebimento_id = p_recebimento_id
    AND ri.empresa_id = v_emp
    AND ri.produto_id IS NOT NULL;

  v_has_depositos := (to_regclass('public.estoque_saldos_depositos') IS NOT NULL);
  IF v_has_depositos THEN
    BEGIN
      v_dep := public.suprimentos_default_deposito_ensure();
    EXCEPTION WHEN undefined_function THEN
      v_has_depositos := false;
    END;
  END IF;

  v_doc := 'REC-' || left(replace(p_recebimento_id::text, '-', ''), 12);

  -- ---------------------------------------------------------------------------
  -- A) Multi-estoque ativo: atualiza saldo por depósito e cria movimento com deposito_id
  -- ---------------------------------------------------------------------------
  IF v_has_depositos THEN
    INSERT INTO public.estoque_saldos_depositos (empresa_id, produto_id, deposito_id, saldo, custo_medio)
    SELECT DISTINCT v_emp, ri.produto_id, v_dep, 0, 0
    FROM public.recebimento_itens ri
    WHERE ri.recebimento_id = p_recebimento_id
      AND ri.empresa_id = v_emp
      AND ri.produto_id IS NOT NULL
    ON CONFLICT (empresa_id, produto_id, deposito_id) DO NOTHING;

    FOR v_row IN
      SELECT
        ri.produto_id,
        coalesce(nullif(ri.quantidade_conferida, 0), ri.quantidade_xml) AS qtd,
        fi.vuncom AS valor_unitario_xml,
        fi.xprod  AS xprod,
        coalesce(nullif(trim(coalesce(ri.lote, '')), ''), 'SEM_LOTE') AS item_lote,
        ri.data_validade
      FROM public.recebimento_itens ri
      JOIN public.fiscal_nfe_import_items fi
        ON fi.id = ri.fiscal_nfe_item_id
       AND fi.empresa_id = v_emp
      WHERE ri.recebimento_id = p_recebimento_id
        AND ri.empresa_id = v_emp
        AND ri.produto_id IS NOT NULL
    LOOP
      IF coalesce(v_row.qtd, 0) <= 0 THEN
        CONTINUE;
      END IF;

      IF v_total_adicional > 0 AND v_base_total > 0 THEN
        IF v_rateio_base = 'quantidade' THEN
          v_item_base := coalesce(v_row.qtd,0);
        ELSE
          v_item_base := coalesce(v_row.qtd,0) * coalesce(v_row.valor_unitario_xml,0);
        END IF;
        v_item_share := v_item_base / v_base_total;
        v_adicional_unit := (v_total_adicional * v_item_share) / v_row.qtd;
      ELSE
        v_adicional_unit := 0;
      END IF;

      v_valor_unitario_eff := coalesce(v_row.valor_unitario_xml,0) + coalesce(v_adicional_unit,0);

      PERFORM pg_catalog.pg_advisory_xact_lock(hashtextextended(v_emp::text || ':' || v_dep::text, 0));

      SELECT saldo, custo_medio
        INTO v_saldo_ant, v_custo_ant
      FROM public.estoque_saldos_depositos
      WHERE empresa_id = v_emp AND produto_id = v_row.produto_id AND deposito_id = v_dep
      FOR UPDATE;

      IF NOT FOUND THEN
        v_saldo_ant := 0;
        v_custo_ant := 0;
        INSERT INTO public.estoque_saldos_depositos (empresa_id, produto_id, deposito_id, saldo, custo_medio)
        VALUES (v_emp, v_row.produto_id, v_dep, 0, 0)
        ON CONFLICT (empresa_id, produto_id, deposito_id) DO NOTHING;
      END IF;

      v_saldo_novo := v_saldo_ant + v_row.qtd;
      IF v_valor_unitario_eff IS NOT NULL AND v_saldo_novo > 0 THEN
        v_custo_novo := ((v_saldo_ant * v_custo_ant) + (v_row.qtd * v_valor_unitario_eff)) / v_saldo_novo;
      ELSE
        v_custo_novo := v_custo_ant;
      END IF;

      UPDATE public.estoque_saldos_depositos
      SET saldo = v_saldo_novo, custo_medio = v_custo_novo, updated_at = now()
      WHERE empresa_id = v_emp AND produto_id = v_row.produto_id AND deposito_id = v_dep;

      SELECT coalesce(sum(saldo),0), coalesce(sum(saldo * custo_medio),0)
        INTO v_total, v_total_custo
      FROM public.estoque_saldos_depositos
      WHERE empresa_id = v_emp AND produto_id = v_row.produto_id;

      INSERT INTO public.estoque_saldos (empresa_id, produto_id, saldo, custo_medio)
      VALUES (v_emp, v_row.produto_id, v_total, CASE WHEN v_total <= 0 THEN 0 ELSE (v_total_custo / v_total) END)
      ON CONFLICT (empresa_id, produto_id) DO UPDATE
        SET saldo = excluded.saldo,
            custo_medio = excluded.custo_medio,
            updated_at = now();

      BEGIN
        INSERT INTO public.estoque_lotes (empresa_id, produto_id, lote, saldo, validade)
        VALUES (v_emp, v_row.produto_id, v_row.item_lote, v_row.qtd, v_row.data_validade)
        ON CONFLICT (empresa_id, produto_id, lote)
        DO UPDATE SET
          saldo    = public.estoque_lotes.saldo + excluded.saldo,
          validade = coalesce(excluded.validade, public.estoque_lotes.validade),
          updated_at = now();
      EXCEPTION WHEN undefined_table THEN
        NULL;
      END;

      INSERT INTO public.estoque_movimentos (
        empresa_id, produto_id, deposito_id, data_movimento,
        tipo, tipo_mov, quantidade, saldo_anterior, saldo_atual,
        custo_medio, valor_unitario, origem_tipo, origem_id,
        origem, lote, observacoes
      ) VALUES (
        v_emp, v_row.produto_id, v_dep, current_date,
        'entrada', 'entrada_nfe', v_row.qtd, v_saldo_ant, v_saldo_novo,
        v_custo_novo, nullif(v_valor_unitario_eff, 0),
        'recebimento', p_recebimento_id, v_doc,
        v_row.item_lote,
        left('Entrada via Recebimento - '||coalesce(nullif(v_row.xprod,''),'item'), 250)
      )
      ON CONFLICT (empresa_id, origem_tipo, origem_id, produto_id, tipo_mov)
      DO UPDATE SET
        deposito_id    = excluded.deposito_id,
        quantidade     = excluded.quantidade,
        saldo_anterior = excluded.saldo_anterior,
        saldo_atual    = excluded.saldo_atual,
        custo_medio    = excluded.custo_medio,
        valor_unitario = excluded.valor_unitario,
        origem         = excluded.origem,
        lote           = excluded.lote,
        observacoes    = excluded.observacoes,
        updated_at     = now();

      v_rows := v_rows + 1;
    END LOOP;

    RETURN jsonb_build_object('status','ok','movimentos',v_rows,'deposito_id',v_dep,'landed_total',v_total_adicional,'rateio_base',v_rateio_base);
  END IF;

  -- ---------------------------------------------------------------------------
  -- B) Legado: mantém comportamento anterior (sem depósito)
  -- ---------------------------------------------------------------------------
  INSERT INTO public.estoque_saldos (empresa_id, produto_id, saldo, custo_medio)
  SELECT DISTINCT v_emp, ri.produto_id, 0, 0
  FROM public.recebimento_itens ri
  WHERE ri.recebimento_id = p_recebimento_id
    AND ri.empresa_id = v_emp
    AND ri.produto_id IS NOT NULL
  ON CONFLICT (empresa_id, produto_id) DO NOTHING;

  FOR v_row IN
    SELECT
      ri.produto_id,
      coalesce(nullif(ri.quantidade_conferida, 0), ri.quantidade_xml) AS qtd,
      fi.vuncom AS valor_unitario_xml,
      fi.xprod  AS xprod,
      coalesce(nullif(trim(coalesce(ri.lote, '')), ''), 'SEM_LOTE') AS item_lote,
      ri.data_validade
    FROM public.recebimento_itens ri
    JOIN public.fiscal_nfe_import_items fi
      ON fi.id = ri.fiscal_nfe_item_id
     AND fi.empresa_id = v_emp
    WHERE ri.recebimento_id = p_recebimento_id
      AND ri.empresa_id = v_emp
      AND ri.produto_id IS NOT NULL
  LOOP
    IF coalesce(v_row.qtd, 0) <= 0 THEN
      CONTINUE;
    END IF;

    IF v_total_adicional > 0 AND v_base_total > 0 THEN
      IF v_rateio_base = 'quantidade' THEN
        v_item_base := coalesce(v_row.qtd,0);
      ELSE
        v_item_base := coalesce(v_row.qtd,0) * coalesce(v_row.valor_unitario_xml,0);
      END IF;
      v_item_share := v_item_base / v_base_total;
      v_adicional_unit := (v_total_adicional * v_item_share) / v_row.qtd;
    ELSE
      v_adicional_unit := 0;
    END IF;

    v_valor_unitario_eff := coalesce(v_row.valor_unitario_xml,0) + coalesce(v_adicional_unit,0);

    SELECT saldo, custo_medio
      INTO v_saldo_ant, v_custo_ant
    FROM public.estoque_saldos
    WHERE empresa_id = v_emp AND produto_id = v_row.produto_id
    FOR UPDATE;

    v_saldo_novo := coalesce(v_saldo_ant,0) + v_row.qtd;
    IF v_valor_unitario_eff IS NOT NULL AND v_saldo_novo > 0 THEN
      v_custo_novo := ((coalesce(v_saldo_ant,0) * coalesce(v_custo_ant,0)) + (v_row.qtd * v_valor_unitario_eff)) / v_saldo_novo;
    ELSE
      v_custo_novo := coalesce(v_custo_ant,0);
    END IF;

    UPDATE public.estoque_saldos
    SET saldo = v_saldo_novo, custo_medio = v_custo_novo, updated_at = now()
    WHERE empresa_id = v_emp AND produto_id = v_row.produto_id;

    BEGIN
      INSERT INTO public.estoque_lotes (empresa_id, produto_id, lote, saldo, validade)
      VALUES (v_emp, v_row.produto_id, v_row.item_lote, v_row.qtd, v_row.data_validade)
      ON CONFLICT (empresa_id, produto_id, lote)
      DO UPDATE SET
        saldo    = public.estoque_lotes.saldo + excluded.saldo,
        validade = coalesce(excluded.validade, public.estoque_lotes.validade),
        updated_at = now();
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;

    INSERT INTO public.estoque_movimentos (
      empresa_id, produto_id, data_movimento,
      tipo, tipo_mov, quantidade,
      saldo_anterior, saldo_atual, custo_medio, valor_unitario,
      origem_tipo, origem_id, lote, observacoes
    ) VALUES (
      v_emp, v_row.produto_id, current_date,
      'entrada', 'entrada_nfe', v_row.qtd,
      coalesce(v_saldo_ant,0), v_saldo_novo,
      v_custo_novo, nullif(v_valor_unitario_eff, 0),
      'recebimento', p_recebimento_id, v_row.item_lote,
      left('Entrada via NF-e (Recebimento) - '||coalesce(nullif(v_row.xprod,''),'item'), 250)
    )
    ON CONFLICT (empresa_id, origem_tipo, origem_id, produto_id, tipo_mov)
    DO UPDATE SET
      quantidade     = excluded.quantidade,
      saldo_anterior = excluded.saldo_anterior,
      saldo_atual    = excluded.saldo_atual,
      custo_medio    = excluded.custo_medio,
      valor_unitario = excluded.valor_unitario,
      lote           = excluded.lote,
      updated_at     = now();

    v_rows := v_rows + 1;
  END LOOP;

  RETURN jsonb_build_object('status','ok','movimentos',v_rows,'landed_total',v_total_adicional,'rateio_base',v_rateio_base);
END;
$$;

REVOKE ALL ON FUNCTION public.estoque_process_from_recebimento(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.estoque_process_from_recebimento(uuid) TO authenticated, service_role;

-- ============================================================================
-- 4. suprimentos_recebimento_item_set_lote — editar lote de um item
-- ============================================================================
CREATE OR REPLACE FUNCTION public.suprimentos_recebimento_item_set_lote(
  p_recebimento_item_id uuid,
  p_lote                text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_recebimento_id uuid;
BEGIN
  PERFORM public.require_plano_mvp_allows('suprimentos');
  PERFORM public.require_permission_for_current_user('suprimentos','update');

  SELECT ri.recebimento_id
  INTO v_recebimento_id
  FROM public.recebimento_itens ri
  JOIN public.recebimentos r ON r.id = ri.recebimento_id
  WHERE ri.id = p_recebimento_item_id
    AND r.empresa_id = public.current_empresa_id();

  IF v_recebimento_id IS NULL THEN
    RAISE EXCEPTION 'Item do recebimento não encontrado.' USING errcode = 'P0001';
  END IF;

  UPDATE public.recebimento_itens
  SET lote       = nullif(trim(coalesce(p_lote, '')), ''),
      updated_at = now()
  WHERE id = p_recebimento_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.suprimentos_recebimento_item_set_lote(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.suprimentos_recebimento_item_set_lote(uuid, text) TO authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'fix(sup): nfe-input-flow — _create_recebimento_from_xml recria itens + lote por item no estoque + suprimentos_recebimento_item_set_lote.';
END $$;
