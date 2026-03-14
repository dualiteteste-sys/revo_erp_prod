/*
  Fix: fiscal_nfe_gerar_de_pedido referencia v_pedido.valor_frete
  mas a coluna real em vendas_pedidos é "frete".
  Erro: record "v_pedido" has no field "valor_frete" (42703)
  Afeta: industria_faturar_ob → fiscal_nfe_gerar_de_pedido chain
*/

drop function if exists public.fiscal_nfe_gerar_de_pedido(uuid, text);
create or replace function public.fiscal_nfe_gerar_de_pedido(
  p_pedido_id uuid,
  p_ambiente  text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa    uuid := public.current_empresa_id();
  v_pedido     record;
  v_emitente   record;
  v_ambiente   text;
  v_emissao_id uuid;
  v_ordem      int := 0;
  v_item       record;
  v_nat_op_id  uuid;
  v_peso_bruto numeric := 0;
  v_peso_liq   numeric := 0;
  v_qtd_vol    int := 0;
begin
  if v_empresa is null then
    raise exception 'Nenhuma empresa ativa.' using errcode='42501';
  end if;

  -- Ler pedido
  select * into v_pedido
  from public.vendas_pedidos
  where id = p_pedido_id and empresa_id = v_empresa;

  if v_pedido is null then
    raise exception 'Pedido não encontrado.' using errcode='P0002';
  end if;

  if v_pedido.status != 'aprovado' then
    raise exception 'Pedido precisa estar aprovado para gerar NF-e.' using errcode='P0002';
  end if;

  -- Ler emitente para CRT/UF
  select * into v_emitente
  from public.fiscal_nfe_emitente
  where empresa_id = v_empresa;

  -- Ambiente
  v_ambiente := coalesce(btrim(p_ambiente), 'homologacao');
  if v_ambiente not in ('homologacao', 'producao') then
    v_ambiente := 'homologacao';
  end if;

  -- Buscar natureza "VENDA" padrão
  select id into v_nat_op_id
  from public.fiscal_naturezas_operacao
  where empresa_id = v_empresa
    and ativo = true
    and codigo = 'VENDA'
  limit 1;

  -- Calcular peso total dos itens do pedido
  select
    coalesce(sum(coalesce(p.peso_bruto_kg, 0) * vip.quantidade), 0),
    coalesce(sum(coalesce(p.peso_liquido_kg, 0) * vip.quantidade), 0),
    coalesce(sum(ceil(vip.quantidade)), 0)
  into v_peso_bruto, v_peso_liq, v_qtd_vol
  from public.vendas_itens_pedido vip
  join public.produtos p on p.id = vip.produto_id
  where vip.pedido_id = p_pedido_id
    and vip.empresa_id = v_empresa;

  -- Criar emissão
  insert into public.fiscal_nfe_emissoes (
    empresa_id, status, ambiente,
    destinatario_pessoa_id,
    natureza_operacao, natureza_operacao_id,
    pedido_origem_id,
    total_frete,
    condicao_pagamento_id,
    transportadora_id,
    modalidade_frete,
    peso_bruto, peso_liquido,
    quantidade_volumes, especie_volumes
  ) values (
    v_empresa, 'rascunho', v_ambiente,
    v_pedido.cliente_id,
    coalesce((select descricao from public.fiscal_naturezas_operacao where id = v_nat_op_id), 'Venda de mercadoria'),
    v_nat_op_id,
    p_pedido_id,
    coalesce(v_pedido.frete, 0),
    -- Condição de pagamento do pedido (lookup by name)
    (select id from public.financeiro_condicoes_pagamento
     where empresa_id = v_empresa and nome = v_pedido.condicao_pagamento limit 1),
    -- Transportadora padrão
    (select id from public.logistica_transportadoras
     where empresa_id = v_empresa and padrao_para_frete = true and ativo = true limit 1),
    coalesce(
      (select frete_tipo_padrao from public.logistica_transportadoras
       where empresa_id = v_empresa and padrao_para_frete = true and ativo = true limit 1),
      '9'
    ),
    round(v_peso_bruto, 3), round(v_peso_liq, 3),
    v_qtd_vol, 'VOLUMES'
  )
  returning id into v_emissao_id;

  -- Inserir itens
  for v_item in
    select
      vip.produto_id,
      coalesce(p.nome, 'Item') as descricao,
      coalesce(p.unidade, 'un') as unidade,
      vip.quantidade,
      vip.preco_unitario as valor_unitario,
      coalesce(vip.desconto, 0) as valor_desconto,
      coalesce(p.ncm, '') as ncm,
      coalesce(p.cfop_padrao, '') as cfop,
      coalesce(p.cst_padrao, '') as cst,
      coalesce(p.csosn_padrao, '') as csosn,
      vip.numero_item_pedido,
      vp.numero_pedido_cliente
    from public.vendas_itens_pedido vip
    join public.produtos p on p.id = vip.produto_id
    join public.vendas_pedidos vp on vp.id = vip.pedido_id
    where vip.pedido_id = p_pedido_id
      and vip.empresa_id = v_empresa
    order by vip.created_at
  loop
    v_ordem := v_ordem + 1;
    insert into public.fiscal_nfe_emissao_itens (
      empresa_id, emissao_id, produto_id, descricao, unidade,
      quantidade, valor_unitario, valor_desconto,
      ncm, cfop, cst, csosn, ordem,
      numero_pedido_cliente, numero_item_pedido
    ) values (
      v_empresa, v_emissao_id, v_item.produto_id, v_item.descricao, v_item.unidade,
      v_item.quantidade, v_item.valor_unitario, v_item.valor_desconto,
      v_item.ncm, v_item.cfop, v_item.cst, v_item.csosn, v_ordem,
      v_item.numero_pedido_cliente, v_item.numero_item_pedido
    );
  end loop;

  -- Calcular impostos (se natureza definida)
  if v_nat_op_id is not null then
    perform public.fiscal_nfe_calcular_impostos(v_emissao_id);
  else
    perform public.fiscal_nfe_recalc_totais(v_emissao_id);
  end if;

  -- Gerar duplicatas (se condição de pagamento definida)
  perform public.fiscal_nfe_gerar_duplicatas(v_emissao_id);

  return v_emissao_id;
end;
$$;

revoke all on function public.fiscal_nfe_gerar_de_pedido(uuid, text) from public, anon;
grant execute on function public.fiscal_nfe_gerar_de_pedido(uuid, text) to authenticated, service_role;

-- Notify PostgREST schema reload
select pg_notify('pgrst','reload schema');
