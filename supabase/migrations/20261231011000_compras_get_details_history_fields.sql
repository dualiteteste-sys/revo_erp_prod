-- =============================================================================
-- SUP-02: Compras (OC) - expor campos de histórico no get details
-- - Mantém compat com frontend atual (JSONB) e adiciona: created_at, updated_at, data_recebimento
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
  SELECT
    c.*,
    f.nome as fornecedor_nome
  INTO v_pedido
  FROM public.compras_pedidos c
  LEFT JOIN public.pessoas f ON f.id = c.fornecedor_id
  WHERE c.empresa_id = v_emp
    AND c.id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.' USING errcode = 'PGRST116';
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

COMMIT;

