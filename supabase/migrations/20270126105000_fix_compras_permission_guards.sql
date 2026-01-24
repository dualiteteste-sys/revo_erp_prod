-- =============================================================================
-- FIX: Compras (OC) - adicionar guards RBAC em RPCs SECURITY DEFINER
-- Motivo: RG-03 bloqueia SECURITY DEFINER sem `require_permission_for_current_user`.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.compras_get_pedido_details(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_pedido record;
  v_itens jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.require_permission_for_current_user('suprimentos','view');

  SELECT
    c.*,
    f.nome as fornecedor_nome
  INTO v_pedido
  FROM public.compras_pedidos c
  LEFT JOIN public.pessoas f ON f.id = c.fornecedor_id
  WHERE c.empresa_id = v_emp
    AND c.id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.' USING errcode = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'pedido_id', i.pedido_id,
      'produto_id', i.produto_id,
      'produto_nome', p.nome,
      'unidade', coalesce(i.unidade, p.unidade),
      'quantidade', i.quantidade,
      'preco_unitario', i.preco_unitario,
      'total', i.total
    )
    ORDER BY p.nome
  ), '[]'::jsonb)
  INTO v_itens
  FROM public.compras_pedido_itens i
  JOIN public.produtos p ON p.id = i.produto_id
  WHERE i.empresa_id = v_emp
    AND i.pedido_id = p_id;

  RETURN jsonb_build_object(
    'id', v_pedido.id,
    'numero', v_pedido.numero,
    'fornecedor_id', v_pedido.fornecedor_id,
    'fornecedor_nome', v_pedido.fornecedor_nome,
    'data_emissao', v_pedido.data_emissao,
    'data_prevista', v_pedido.data_prevista,
    'data_recebimento', v_pedido.data_recebimento,
    'status', v_pedido.status::text,
    'total_produtos', v_pedido.total_produtos,
    'frete', v_pedido.frete,
    'desconto', v_pedido.desconto,
    'total_geral', v_pedido.total_geral,
    'observacoes', v_pedido.observacoes,
    'created_at', v_pedido.created_at,
    'updated_at', v_pedido.updated_at,
    'itens', v_itens
  );
END;
$$;

REVOKE ALL ON FUNCTION public.compras_get_pedido_details(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.compras_get_pedido_details(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.compras_upsert_pedido(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_id uuid := nullif((p_payload->>'id')::text,'')::uuid;
  v_num bigint;
  v_fornecedor uuid := nullif((p_payload->>'fornecedor_id')::text,'')::uuid;
  v_status text := coalesce(nullif(p_payload->>'status',''), 'rascunho');
  v_data_emissao date := coalesce(nullif(p_payload->>'data_emissao','')::date, now()::date);
  v_data_prevista date := nullif(p_payload->>'data_prevista','')::date;
  v_frete numeric := coalesce(nullif(p_payload->>'frete','')::numeric, 0);
  v_desconto numeric := coalesce(nullif(p_payload->>'desconto','')::numeric, 0);
  v_obs text := nullif(p_payload->>'observacoes','');
BEGIN
  PERFORM public.require_permission_for_current_user('suprimentos','update');

  IF v_fornecedor IS NULL THEN
    RAISE EXCEPTION 'Selecione um fornecedor.' USING errcode='22023';
  END IF;

  IF v_id IS NULL THEN
    v_num := public.next_compra_number_for_current_empresa();
    INSERT INTO public.compras_pedidos (
      empresa_id, numero, fornecedor_id, status, data_emissao, data_prevista, frete, desconto, observacoes
    )
    VALUES (
      v_emp, v_num, v_fornecedor, v_status::public.status_compra, v_data_emissao, v_data_prevista, v_frete, v_desconto, v_obs
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.compras_pedidos
       SET fornecedor_id = v_fornecedor,
           status = v_status::public.status_compra,
           data_emissao = v_data_emissao,
           data_prevista = v_data_prevista,
           frete = v_frete,
           desconto = v_desconto,
           observacoes = v_obs,
           updated_at = now()
     WHERE empresa_id = v_emp
       AND id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pedido não encontrado.' USING errcode='P0002';
    END IF;
  END IF;

  PERFORM public.compras_recalc_totals(v_id);
  RETURN public.compras_get_pedido_details(v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.compras_upsert_pedido(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.compras_upsert_pedido(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.compras_manage_item(
  p_pedido_id uuid,
  p_item_id uuid,
  p_produto_id uuid,
  p_quantidade numeric,
  p_preco_unitario numeric,
  p_action text DEFAULT 'upsert'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_status public.status_compra;
  v_unidade text;
  v_total numeric;
BEGIN
  PERFORM public.require_permission_for_current_user('suprimentos','update');

  SELECT status
    INTO v_status
  FROM public.compras_pedidos
  WHERE empresa_id = v_emp
    AND id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.' USING errcode='P0002';
  END IF;

  IF v_status in ('recebido','cancelado') THEN
    RAISE EXCEPTION 'Não é possível alterar itens em pedidos %.', v_status USING errcode='22023';
  END IF;

  IF p_action = 'delete' THEN
    DELETE FROM public.compras_pedido_itens
    WHERE empresa_id = v_emp
      AND pedido_id = p_pedido_id
      AND id = p_item_id;
    PERFORM public.compras_recalc_totals(p_pedido_id);
    RETURN;
  END IF;

  IF p_produto_id IS NULL THEN
    RAISE EXCEPTION 'Selecione um produto.' USING errcode='22023';
  END IF;

  SELECT unidade INTO v_unidade
  FROM public.produtos
  WHERE empresa_id = v_emp
    AND id = p_produto_id;

  v_total := round(coalesce(p_quantidade,0) * coalesce(p_preco_unitario,0), 2);

  IF p_item_id IS NULL THEN
    INSERT INTO public.compras_pedido_itens (
      empresa_id, pedido_id, produto_id, unidade, quantidade, preco_unitario, total
    )
    VALUES (
      v_emp, p_pedido_id, p_produto_id, v_unidade, coalesce(p_quantidade,0), coalesce(p_preco_unitario,0), v_total
    );
  ELSE
    UPDATE public.compras_pedido_itens
       SET produto_id = p_produto_id,
           unidade = v_unidade,
           quantidade = coalesce(p_quantidade,0),
           preco_unitario = coalesce(p_preco_unitario,0),
           total = v_total,
           updated_at = now()
     WHERE empresa_id = v_emp
       AND pedido_id = p_pedido_id
       AND id = p_item_id;
  END IF;

  PERFORM public.compras_recalc_totals(p_pedido_id);
END;
$$;

REVOKE ALL ON FUNCTION public.compras_manage_item(uuid, uuid, uuid, numeric, numeric, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.compras_manage_item(uuid, uuid, uuid, numeric, numeric, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.compras_receber_pedido(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_status public.status_compra;
  v_num bigint;
  v_item record;
  v_doc text;
BEGIN
  PERFORM public.require_permission_for_current_user('suprimentos','update');

  SELECT status, numero
    INTO v_status, v_num
  FROM public.compras_pedidos
  WHERE empresa_id = v_emp
    AND id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.' USING errcode='P0002';
  END IF;

  IF v_status = 'cancelado' THEN
    RAISE EXCEPTION 'Pedido cancelado não pode ser recebido.' USING errcode='22023';
  END IF;

  IF v_status = 'recebido' THEN
    RETURN;
  END IF;

  v_doc := 'OC #'||v_num::text;

  FOR v_item IN
    SELECT i.produto_id, i.quantidade, i.preco_unitario
    FROM public.compras_pedido_itens i
    WHERE i.empresa_id = v_emp AND i.pedido_id = p_id
  LOOP
    IF coalesce(v_item.quantidade,0) <= 0 THEN
      CONTINUE;
    END IF;

    PERFORM public.suprimentos_registrar_movimento(
      v_item.produto_id,
      'entrada',
      v_item.quantidade,
      nullif(coalesce(v_item.preco_unitario,0), 0),
      v_doc,
      'Recebimento por Ordem de Compra'
    );
  END LOOP;

  UPDATE public.compras_pedidos
     SET status = 'recebido',
         data_recebimento = current_date,
         updated_at = now()
   WHERE empresa_id = v_emp
     AND id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.compras_receber_pedido(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.compras_receber_pedido(uuid) TO authenticated, service_role;

DO $$ BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
EXCEPTION WHEN others THEN
  -- best-effort
END $$;

COMMIT;

