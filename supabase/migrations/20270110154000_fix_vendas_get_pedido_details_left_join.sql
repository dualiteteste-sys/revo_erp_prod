-- PDV/Vendas: make vendas_get_pedido_details resilient when cliente record is missing.
-- If vendas_pedidos.cliente_id points to a missing pessoa row, the old INNER JOIN made the function return NULL,
-- which breaks PDV flows relying on this RPC after mutations.

CREATE OR REPLACE FUNCTION public.vendas_get_pedido_details(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_pedido  jsonb;
  v_itens   jsonb;
begin
  -- cabeçalho (LEFT JOIN para não derrubar o pedido quando o cliente estiver ausente)
  select
    to_jsonb(p.*)
    || jsonb_build_object('cliente_nome', c.nome)
  into v_pedido
  from public.vendas_pedidos p
  left join public.pessoas c
    on c.id = p.cliente_id
  where p.id = p_id
    and p.empresa_id = v_empresa;

  if v_pedido is null then
    return null;
  end if;

  -- itens
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id',        i.id,
               'pedido_id', i.pedido_id,
               'produto_id', i.produto_id,
               'produto_nome', pr.nome,
               'produto_ncm', pr.ncm,
               'produto_cfop', pr.cfop_padrao,
               'produto_cst', pr.cst_padrao,
               'produto_csosn', pr.csosn_padrao,
               'quantidade', i.quantidade,
               'preco_unitario', i.preco_unitario,
               'desconto', i.desconto,
               'total', i.total,
               'observacoes', i.observacoes
             )
             order by i.created_at, i.id
           ),
           '[]'::jsonb
         )
  into v_itens
  from public.vendas_itens_pedido i
  join public.produtos pr
    on pr.id = i.produto_id
  where i.pedido_id = p_id
    and i.empresa_id = v_empresa;

  return v_pedido || jsonb_build_object('itens', v_itens);
end;
$$;

REVOKE ALL ON FUNCTION public.vendas_get_pedido_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendas_get_pedido_details(uuid) TO authenticated, service_role;

