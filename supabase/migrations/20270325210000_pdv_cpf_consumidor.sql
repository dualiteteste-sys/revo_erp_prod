/*
  # PDV: CPF na Nota + identificação de cliente

  ## Descrição
  Adiciona coluna cpf_consumidor em vendas_pedidos para suportar "CPF na Nota"
  em vendas PDV sem vincular cliente real. Atualiza vendas_upsert_pedido para
  persistir o campo e vendas_pdv_nfce_create_draft para repassá-lo ao payload
  da emissão NFC-e.

  ## Impact Summary
  - Idempotente: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE
  - Sem breaking changes: coluna nullable, RPCs mantêm assinatura
*/

-- ─────────────────────────────────────────────────────────────
-- 1. Nova coluna cpf_consumidor
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.vendas_pedidos
  ADD COLUMN IF NOT EXISTS cpf_consumidor text;

-- ─────────────────────────────────────────────────────────────
-- 2. vendas_upsert_pedido — incluir cpf_consumidor
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vendas_upsert_pedido(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_empresa   uuid := public.current_empresa_id();
  v_id        uuid;
  v_cliente   uuid;
  v_status    text;
  v_data_emis date;
  v_data_ent  date;
  v_frete     numeric;
  v_desc      numeric;
  v_tp        uuid;
  v_vendedor  uuid := nullif(p_payload->>'vendedor_id','')::uuid;
  v_comissao  numeric := coalesce((p_payload->>'comissao_percent')::numeric, 0);
  v_cpf_cons  text := nullif(btrim(p_payload->>'cpf_consumidor'), '');
BEGIN
  v_cliente := (p_payload->>'cliente_id')::uuid;
  IF v_cliente IS NULL THEN
    RAISE EXCEPTION 'cliente_id é obrigatório.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.pessoas c WHERE c.id = v_cliente) THEN
    RAISE EXCEPTION 'Cliente não encontrado.';
  END IF;

  v_status := coalesce(p_payload->>'status', 'orcamento');
  IF v_status NOT IN ('orcamento','aprovado','cancelado','concluido') THEN
    RAISE EXCEPTION 'Status de pedido inválido.';
  END IF;

  v_data_emis := coalesce((p_payload->>'data_emissao')::date, current_date);
  v_data_ent  := (p_payload->>'data_entrega')::date;

  v_frete := coalesce((p_payload->>'frete')::numeric, 0);
  v_desc  := coalesce((p_payload->>'desconto')::numeric, 0);

  v_tp := nullif(p_payload->>'tabela_preco_id','')::uuid;
  IF v_tp IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.tabelas_preco t
      WHERE t.id = v_tp AND t.empresa_id = v_empresa AND t.status = 'ativa'
    ) THEN
      v_tp := NULL;
    END IF;
  END IF;

  IF p_payload->>'id' IS NOT NULL THEN
    UPDATE public.vendas_pedidos p
    SET
      cliente_id            = v_cliente,
      data_emissao          = v_data_emis,
      data_entrega          = v_data_ent,
      status                = v_status,
      frete                 = v_frete,
      desconto              = v_desc,
      condicao_pagamento    = p_payload->>'condicao_pagamento',
      observacoes           = p_payload->>'observacoes',
      tabela_preco_id       = v_tp,
      forma_pagamento       = nullif(p_payload->>'forma_pagamento',''),
      numero_pedido_cliente = nullif(p_payload->>'numero_pedido_cliente',''),
      vendedor_id           = coalesce(v_vendedor, p.vendedor_id),
      comissao_percent      = coalesce(v_comissao, p.comissao_percent),
      cpf_consumidor        = coalesce(v_cpf_cons, p.cpf_consumidor)
    WHERE p.id = (p_payload->>'id')::uuid
      AND p.empresa_id = v_empresa
    RETURNING p.id INTO v_id;
  ELSE
    INSERT INTO public.vendas_pedidos (
      empresa_id,
      cliente_id,
      data_emissao,
      data_entrega,
      status,
      frete,
      desconto,
      condicao_pagamento,
      observacoes,
      tabela_preco_id,
      forma_pagamento,
      numero_pedido_cliente,
      vendedor_id,
      comissao_percent,
      cpf_consumidor
    ) VALUES (
      v_empresa,
      v_cliente,
      v_data_emis,
      v_data_ent,
      v_status,
      v_frete,
      v_desc,
      p_payload->>'condicao_pagamento',
      p_payload->>'observacoes',
      v_tp,
      nullif(p_payload->>'forma_pagamento',''),
      nullif(p_payload->>'numero_pedido_cliente',''),
      v_vendedor,
      v_comissao,
      v_cpf_cons
    )
    RETURNING id INTO v_id;
  END IF;

  PERFORM public.vendas_recalcular_totais(v_id);

  PERFORM pg_notify('app_log', '[RPC] vendas_upsert_pedido: ' || v_id);

  RETURN public.vendas_get_pedido_details(v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.vendas_upsert_pedido(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.vendas_upsert_pedido(jsonb) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 3. vendas_pdv_nfce_create_draft — incluir cpf_consumidor no payload
-- ─────────────────────────────────────────────────────────────
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
  v_payload jsonb;
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
    p.total_geral,
    p.cpf_consumidor
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

  -- ─── Montar payload com cpf_consumidor ───────────────────
  v_payload := jsonb_build_object(
    'origem', 'pdv_nfce',
    'pedido_numero', v_pedido.numero
  );
  IF v_pedido.cpf_consumidor IS NOT NULL AND BTRIM(v_pedido.cpf_consumidor) <> '' THEN
    v_payload := v_payload || jsonb_build_object('cpf_consumidor', v_pedido.cpf_consumidor);
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
    v_payload
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
