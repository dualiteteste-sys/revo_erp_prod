-- ============================================================
-- PDV NFC-e RPCs
-- ============================================================
-- Updates vendas_pdv_finalize_v2 to accept formas_pagamento,
-- creates vendas_pdv_nfce_create_draft for NFC-e emission,
-- updates vendas_pdv_caixa_close with payment breakdown,
-- and adds fiscal_nfce_check_enabled helper.
-- ============================================================

BEGIN;

-- ─── 2A. vendas_pdv_finalize_v2 — add p_formas_pagamento ────

DROP FUNCTION IF EXISTS public.vendas_pdv_finalize_v2(uuid, uuid, boolean, uuid);

CREATE OR REPLACE FUNCTION public.vendas_pdv_finalize_v2(
  p_pedido_id uuid,
  p_conta_corrente_id uuid,
  p_baixar_estoque boolean DEFAULT true,
  p_pdv_caixa_id uuid DEFAULT NULL,
  p_formas_pagamento jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_row public.vendas_pedidos%rowtype;
  v_doc text;
  v_mov_id uuid;
  v_mov jsonb;
  v_sess_id uuid;
BEGIN
  PERFORM public.require_permission_for_current_user('vendas', 'update');

  IF v_emp IS NULL THEN
    RAISE EXCEPTION '[PDV][finalize] Nenhuma empresa ativa encontrada' USING errcode = '42501';
  END IF;

  IF p_pedido_id IS NULL THEN
    RAISE EXCEPTION '[PDV][finalize] pedido_id é obrigatório' USING errcode = '22004';
  END IF;
  IF p_conta_corrente_id IS NULL THEN
    RAISE EXCEPTION '[PDV][finalize] conta_corrente_id é obrigatório' USING errcode = '22004';
  END IF;

  -- Lock por pedido para evitar double-click/retry concorrente
  PERFORM pg_advisory_xact_lock(hashtextextended(p_pedido_id::text, 0));

  SELECT *
    INTO v_row
    FROM public.vendas_pedidos p
   WHERE p.id = p_pedido_id
     AND p.empresa_id = v_emp
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[PDV][finalize] Pedido não encontrado na empresa atual' USING errcode = 'P0002';
  END IF;

  IF v_row.status = 'cancelado' THEN
    RAISE EXCEPTION '[PDV][finalize] Pedido cancelado não pode ser finalizado' USING errcode = 'P0001';
  END IF;

  IF p_pdv_caixa_id IS NOT NULL THEN
    SELECT s.id INTO v_sess_id
    FROM public.vendas_pdv_caixa_sessoes s
    WHERE s.empresa_id = v_emp
      AND s.caixa_id = p_pdv_caixa_id
      AND s.status = 'aberto'
    ORDER BY s.opened_at DESC
    LIMIT 1;

    IF v_sess_id IS NULL THEN
      RAISE EXCEPTION '[PDV][finalize] Caixa não está aberto (abra o caixa antes de finalizar)' USING errcode = '42501';
    END IF;
  END IF;

  v_doc := 'PDV-' || v_row.numero::text;

  -- Finaliza pedido (idempotente por estado)
  UPDATE public.vendas_pedidos
     SET canal = 'pdv',
         status = 'concluido',
         pdv_caixa_id = COALESCE(p_pdv_caixa_id, pdv_caixa_id),
         pdv_caixa_sessao_id = COALESCE(v_sess_id, pdv_caixa_sessao_id),
         updated_at = now()
   WHERE id = v_row.id
     AND empresa_id = v_emp;

  -- Financeiro: garante movimento único por origem (idempotente)
  SELECT m.id
    INTO v_mov_id
    FROM public.financeiro_movimentacoes m
   WHERE m.empresa_id = v_emp
     AND m.origem_tipo = 'venda_pdv'
     AND m.origem_id = v_row.id
   LIMIT 1;

  IF v_mov_id IS NULL THEN
    BEGIN
      v_mov := public.financeiro_movimentacoes_upsert(
        jsonb_build_object(
          'conta_corrente_id', p_conta_corrente_id,
          'tipo_mov', 'entrada',
          'valor', v_row.total_geral,
          'descricao', 'Venda PDV #' || v_row.numero::text,
          'documento_ref', v_doc,
          'origem_tipo', 'venda_pdv',
          'origem_id', v_row.id,
          'categoria', 'Vendas',
          'observacoes', 'Gerado automaticamente pelo PDV'
        )
      );
      v_mov_id := NULLIF(v_mov->>'id','')::uuid;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT m.id
          INTO v_mov_id
          FROM public.financeiro_movimentacoes m
         WHERE m.empresa_id = v_emp
           AND m.origem_tipo = 'venda_pdv'
           AND m.origem_id = v_row.id
         LIMIT 1;
    END;
  END IF;

  IF v_mov_id IS NOT NULL THEN
    v_mov := public.financeiro_movimentacoes_get(v_mov_id);

    IF (v_mov->>'conciliado')::boolean IS FALSE
       AND NULLIF(v_mov->>'conta_corrente_id','')::uuid IS DISTINCT FROM p_conta_corrente_id THEN
      BEGIN
        v_mov := public.financeiro_movimentacoes_upsert(
          jsonb_build_object(
            'id', v_mov_id,
            'conta_corrente_id', p_conta_corrente_id,
            'tipo_mov', 'entrada',
            'valor', v_row.total_geral,
            'descricao', 'Venda PDV #' || v_row.numero::text,
            'documento_ref', v_doc,
            'origem_tipo', 'venda_pdv',
            'origem_id', v_row.id,
            'categoria', 'Vendas',
            'observacoes', 'Atualizado automaticamente pelo PDV (correção de conta)'
          )
        );
      EXCEPTION
        WHEN OTHERS THEN
          NULL;
      END;
    END IF;
  END IF;

  IF p_baixar_estoque THEN
    PERFORM public.vendas_baixar_estoque(v_row.id, v_doc);
  END IF;

  -- ─── Inserir formas de pagamento (novo) ────────────────────
  IF p_formas_pagamento IS NOT NULL AND jsonb_array_length(p_formas_pagamento) > 0 THEN
    -- Idempotente: limpa registros anteriores
    DELETE FROM public.vendas_pdv_pagamentos
    WHERE pedido_id = v_row.id AND empresa_id = v_emp;

    INSERT INTO public.vendas_pdv_pagamentos (
      empresa_id, pedido_id, forma_pagamento, forma_pagamento_sefaz,
      valor, valor_recebido, troco
    )
    SELECT
      v_emp,
      v_row.id,
      COALESCE(fp->>'forma_pagamento', 'Dinheiro'),
      COALESCE(fp->>'forma_pagamento_sefaz', '01'),
      COALESCE((fp->>'valor')::numeric, 0),
      NULLIF(fp->>'valor_recebido', '')::numeric,
      NULLIF(fp->>'troco', '')::numeric
    FROM jsonb_array_elements(p_formas_pagamento) fp;

    -- Salva forma principal no pedido
    UPDATE public.vendas_pedidos
    SET forma_pagamento = COALESCE(p_formas_pagamento->0->>'forma_pagamento', 'Dinheiro')
    WHERE id = v_row.id AND empresa_id = v_emp;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'pedido_id', v_row.id,
    'documento_ref', v_doc,
    'financeiro_movimentacao_id', v_mov_id,
    'pdv_caixa_id', p_pdv_caixa_id,
    'pdv_caixa_sessao_id', v_sess_id,
    'estoque_baixado_at', (SELECT p.estoque_baixado_at FROM public.vendas_pedidos p WHERE p.id = v_row.id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.vendas_pdv_finalize_v2(uuid, uuid, boolean, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendas_pdv_finalize_v2(uuid, uuid, boolean, uuid, jsonb) TO authenticated, service_role;

-- ─── 2B. vendas_pdv_nfce_create_draft ────────────────────────

CREATE OR REPLACE FUNCTION public.vendas_pdv_nfce_create_draft(
  p_pedido_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_pedido record;
  v_emitente record;
  v_existing uuid;
  v_emissao_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_item record;
  v_item_obj jsonb;
  v_ambiente text;
BEGIN
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode = '42501';
  END IF;

  PERFORM public.require_permission_for_current_user('vendas', 'update');

  -- ─── Ler emitente + validar CSC ────────────────────────────
  SELECT * INTO v_emitente
  FROM public.fiscal_nfe_emitente
  WHERE empresa_id = v_emp;

  IF v_emitente IS NULL THEN
    RAISE EXCEPTION 'Cadastro fiscal do emitente nao configurado. Configure em Fiscal > Configuracoes.'
      USING errcode = 'P0003';
  END IF;

  IF COALESCE(BTRIM(v_emitente.csc), '') = '' THEN
    RAISE EXCEPTION 'CSC para NFC-e nao configurado. Configure em Fiscal > Configuracoes.'
      USING errcode = 'P0003';
  END IF;

  -- ─── Ler pedido ────────────────────────────────────────────
  SELECT
    p.id,
    p.numero,
    p.cliente_id,
    p.status,
    p.total_produtos,
    p.frete,
    p.desconto,
    p.total_geral
  INTO v_pedido
  FROM public.vendas_pedidos p
  WHERE p.id = p_pedido_id
    AND p.empresa_id = v_emp;

  IF v_pedido IS NULL THEN
    RAISE EXCEPTION 'Pedido nao encontrado.' USING errcode = 'P0001';
  END IF;

  IF v_pedido.status <> 'concluido' THEN
    RAISE EXCEPTION 'Pedido precisa estar concluido para gerar NFC-e (status atual: %).',
      v_pedido.status USING errcode = '22023';
  END IF;

  -- ─── Idempotência: verificar NFC-e existente ──────────────
  SELECT e.id INTO v_existing
  FROM public.fiscal_nfe_emissoes e
  WHERE e.empresa_id = v_emp
    AND e.pedido_origem_id = p_pedido_id
    AND e.modelo = '65'
    AND e.status NOT IN ('cancelada', 'erro', 'rejeitada')
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- ─── Determinar ambiente ──────────────────────────────────
  SELECT COALESCE(c.ambiente, 'homologacao') INTO v_ambiente
  FROM public.fiscal_nfe_emissao_configs c
  WHERE c.empresa_id = v_emp
    AND c.provider_slug = 'FOCUSNFE'
  LIMIT 1;

  v_ambiente := COALESCE(v_ambiente, 'homologacao');

  -- ─── Montar itens do pedido ───────────────────────────────
  FOR v_item IN
    SELECT
      i.produto_id,
      COALESCE(pr.nome, 'Produto') AS descricao,
      COALESCE(pr.unidade, 'un')   AS unidade,
      i.quantidade,
      i.preco_unitario              AS valor_unitario,
      i.desconto                    AS valor_desconto,
      pr.ncm,
      COALESCE(pr.cfop_padrao, '5102') AS cfop,
      pr.cst_padrao                 AS cst,
      pr.csosn_padrao               AS csosn
    FROM public.vendas_itens_pedido i
    JOIN public.produtos pr ON pr.id = i.produto_id
    WHERE i.pedido_id = p_pedido_id
      AND i.empresa_id = v_emp
    ORDER BY i.created_at, i.id
  LOOP
    v_item_obj := jsonb_build_object(
      'produto_id',    v_item.produto_id,
      'descricao',     v_item.descricao,
      'unidade',       v_item.unidade,
      'quantidade',    v_item.quantidade,
      'valor_unitario', v_item.valor_unitario,
      'valor_desconto', v_item.valor_desconto,
      'ncm',           v_item.ncm,
      'cfop',          v_item.cfop,
      'cst',           v_item.cst,
      'csosn',         v_item.csosn
    );
    v_items := v_items || v_item_obj;
  END LOOP;

  IF jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Pedido nao possui itens.' USING errcode = '22023';
  END IF;

  -- ─── Inserir rascunho NFC-e ───────────────────────────────
  INSERT INTO public.fiscal_nfe_emissoes (
    empresa_id,
    provider_slug,
    ambiente,
    status,
    modelo,
    destinatario_pessoa_id,
    natureza_operacao,
    total_frete,
    pedido_origem_id,
    payload
  )
  VALUES (
    v_emp,
    'FOCUSNFE',
    v_ambiente,
    'rascunho',
    '65',
    v_pedido.cliente_id,
    'Venda',
    0,
    p_pedido_id,
    jsonb_build_object(
      'origem', 'pdv_nfce',
      'pedido_numero', v_pedido.numero
    )
  )
  RETURNING id INTO v_emissao_id;

  -- ─── Inserir itens ────────────────────────────────────────
  INSERT INTO public.fiscal_nfe_emissao_itens (
    empresa_id,
    emissao_id,
    produto_id,
    ordem,
    descricao,
    unidade,
    ncm,
    cfop,
    cst,
    csosn,
    quantidade,
    valor_unitario,
    valor_desconto,
    valor_total
  )
  SELECT
    v_emp,
    v_emissao_id,
    NULLIF(BTRIM(COALESCE(it->>'produto_id', '')), '')::uuid,
    (row_number() OVER ())::int AS ordem,
    COALESCE(NULLIF(BTRIM(COALESCE(it->>'descricao', '')), ''), 'Item'),
    COALESCE(NULLIF(BTRIM(COALESCE(it->>'unidade', '')), ''), 'un'),
    NULLIF(BTRIM(COALESCE(it->>'ncm', '')), ''),
    COALESCE(NULLIF(BTRIM(COALESCE(it->>'cfop', '')), ''), '5102'),
    NULLIF(BTRIM(COALESCE(it->>'cst', '')), ''),
    NULLIF(BTRIM(COALESCE(it->>'csosn', '')), ''),
    COALESCE(NULLIF(it->>'quantidade', '')::numeric, 0),
    COALESCE(NULLIF(it->>'valor_unitario', '')::numeric, 0),
    COALESCE(NULLIF(it->>'valor_desconto', '')::numeric, 0),
    GREATEST(
      0,
      (COALESCE(NULLIF(it->>'quantidade', '')::numeric, 0) * COALESCE(NULLIF(it->>'valor_unitario', '')::numeric, 0))
      - COALESCE(NULLIF(it->>'valor_desconto', '')::numeric, 0)
    )
  FROM jsonb_array_elements(v_items) it;

  -- Recalcular totais
  PERFORM public.fiscal_nfe_recalc_totais(v_emissao_id);

  -- Vincular NFC-e ao pedido
  UPDATE public.vendas_pedidos
  SET nfce_emissao_id = v_emissao_id
  WHERE id = p_pedido_id AND empresa_id = v_emp;

  RETURN v_emissao_id;
END;
$$;

REVOKE ALL ON FUNCTION public.vendas_pdv_nfce_create_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendas_pdv_nfce_create_draft(uuid) TO authenticated, service_role;

-- ─── 2C. vendas_pdv_caixa_close — add payment breakdown ─────

DROP FUNCTION IF EXISTS public.vendas_pdv_caixa_close(uuid, numeric, text);

CREATE OR REPLACE FUNCTION public.vendas_pdv_caixa_close(
  p_caixa_id uuid,
  p_saldo_final numeric DEFAULT NULL,
  p_observacoes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_sess public.vendas_pdv_caixa_sessoes%rowtype;
  v_total_vendas numeric(15,2);
  v_total_estornos numeric(15,2);
  v_por_forma jsonb;
BEGIN
  PERFORM public.require_permission_for_current_user('vendas', 'manage');

  IF v_emp IS NULL THEN
    RAISE EXCEPTION '[PDV][caixa] empresa_id inválido' USING errcode='42501';
  END IF;

  SELECT *
    INTO v_sess
    FROM public.vendas_pdv_caixa_sessoes s
   WHERE s.empresa_id = v_emp
     AND s.caixa_id = p_caixa_id
     AND s.status = 'aberto'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '[PDV][caixa] Nenhuma sessão aberta para este caixa' USING errcode='P0002';
  END IF;

  SELECT COALESCE(SUM(p.total_geral), 0)
    INTO v_total_vendas
    FROM public.vendas_pedidos p
   WHERE p.empresa_id = v_emp
     AND p.canal = 'pdv'
     AND p.pdv_caixa_sessao_id = v_sess.id
     AND p.status = 'concluido';

  SELECT COALESCE(SUM(p.total_geral), 0)
    INTO v_total_estornos
    FROM public.vendas_pedidos p
   WHERE p.empresa_id = v_emp
     AND p.canal = 'pdv'
     AND p.pdv_caixa_sessao_id = v_sess.id
     AND p.pdv_estornado_at IS NOT NULL;

  -- Breakdown por forma de pagamento
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'forma_pagamento', sub.forma_pagamento,
    'total', sub.total_valor,
    'quantidade', sub.qtd
  )), '[]'::jsonb)
  INTO v_por_forma
  FROM (
    SELECT
      pp.forma_pagamento,
      SUM(pp.valor) AS total_valor,
      COUNT(*) AS qtd
    FROM public.vendas_pdv_pagamentos pp
    JOIN public.vendas_pedidos p ON p.id = pp.pedido_id
    WHERE pp.empresa_id = v_emp
      AND p.pdv_caixa_sessao_id = v_sess.id
      AND p.status = 'concluido'
      AND p.pdv_estornado_at IS NULL
    GROUP BY pp.forma_pagamento
    ORDER BY SUM(pp.valor) DESC
  ) sub;

  UPDATE public.vendas_pdv_caixa_sessoes
     SET status = 'fechado',
         closed_at = now(),
         closed_by = auth.uid(),
         saldo_final = p_saldo_final,
         total_vendas = v_total_vendas,
         total_estornos = v_total_estornos,
         observacoes = p_observacoes,
         updated_at = now()
   WHERE id = v_sess.id;

  RETURN jsonb_build_object(
    'ok', true,
    'sessao_id', v_sess.id,
    'caixa_id', v_sess.caixa_id,
    'saldo_inicial', v_sess.saldo_inicial,
    'saldo_final', p_saldo_final,
    'total_vendas', v_total_vendas,
    'total_estornos', v_total_estornos,
    'por_forma_pagamento', v_por_forma,
    'opened_at', v_sess.opened_at,
    'closed_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.vendas_pdv_caixa_close(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendas_pdv_caixa_close(uuid, numeric, text) TO authenticated, service_role;

-- ─── 2D. fiscal_nfce_check_enabled ──────────────────────────

CREATE OR REPLACE FUNCTION public.fiscal_nfce_check_enabled()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_csc text;
BEGIN
  IF v_emp IS NULL THEN
    RETURN jsonb_build_object('csc_configured', false);
  END IF;

  SELECT e.csc INTO v_csc
  FROM public.fiscal_nfe_emitente e
  WHERE e.empresa_id = v_emp;

  RETURN jsonb_build_object(
    'csc_configured', COALESCE(BTRIM(v_csc), '') <> ''
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfce_check_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfce_check_enabled() TO authenticated, service_role;

-- ─── 2E. fiscal_nfce_get_for_pedido ─────────────────────────

CREATE OR REPLACE FUNCTION public.fiscal_nfce_get_for_pedido(
  p_pedido_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_row record;
BEGIN
  IF v_emp IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT e.id, e.status, e.numero, e.serie, e.chave_acesso, e.ambiente, e.modelo
  INTO v_row
  FROM public.fiscal_nfe_emissoes e
  WHERE e.empresa_id = v_emp
    AND e.pedido_origem_id = p_pedido_id
    AND e.modelo = '65'
    AND e.status NOT IN ('erro', 'cancelada')
  ORDER BY e.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'numero', v_row.numero,
    'serie', v_row.serie,
    'chave_acesso', v_row.chave_acesso,
    'ambiente', v_row.ambiente,
    'modelo', v_row.modelo
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_nfce_get_for_pedido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_nfce_get_for_pedido(uuid) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
