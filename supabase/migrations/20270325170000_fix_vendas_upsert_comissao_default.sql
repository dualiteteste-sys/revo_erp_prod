/*
  # Fix: comissao_percent NOT NULL violation em vendas_upsert_pedido

  ## Descrição
  A coluna comissao_percent em vendas_pedidos é NOT NULL, mas o INSERT
  na RPC usava v_comissao sem COALESCE — causando erro 23502 quando
  payload não inclui comissao_percent (ex: PDV sem vendedor).

  ## Impact Summary
  - Idempotente: CREATE OR REPLACE
  - Sem breaking changes: apenas adiciona COALESCE(..., 0)
*/

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
      comissao_percent      = coalesce(v_comissao, p.comissao_percent)
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
      comissao_percent
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
      v_comissao
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
