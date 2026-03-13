/*
  Fases 4, 5, 7: Campos adicionais para NF-e
  - Duplicatas / condição de pagamento (Fase 4)
  - Transportadora (Fase 5)
  - xPed / nItemPed / infAdProd (Fase 7)
*/

-- =========================================================
-- Fase 4: Duplicatas / Condição de Pagamento
-- =========================================================
alter table public.fiscal_nfe_emissoes
  add column if not exists condicao_pagamento_id uuid
    references public.financeiro_condicoes_pagamento(id) on delete set null;

alter table public.fiscal_nfe_emissoes
  add column if not exists forma_pagamento text;

alter table public.fiscal_nfe_emissoes
  add column if not exists duplicatas jsonb not null default '[]'::jsonb;


-- =========================================================
-- Fase 5: Transportadora
-- =========================================================
alter table public.fiscal_nfe_emissoes
  add column if not exists transportadora_id uuid
    references public.logistica_transportadoras(id) on delete set null;

alter table public.fiscal_nfe_emissoes
  add column if not exists modalidade_frete text not null default '9';

-- Add check constraint (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fiscal_nfe_emissoes_modalidade_frete_chk'
  ) then
    alter table public.fiscal_nfe_emissoes
      add constraint fiscal_nfe_emissoes_modalidade_frete_chk
      check (modalidade_frete in ('0','1','2','3','4','9'));
  end if;
end;
$$;


-- =========================================================
-- Fase 7: xPed / nItemPed / infAdProd
-- =========================================================
-- Pedido do cliente no pedido de venda
alter table public.vendas_pedidos
  add column if not exists numero_pedido_cliente text;

-- Sequência do item no pedido do cliente
alter table public.vendas_itens_pedido
  add column if not exists numero_item_pedido integer;

-- Campos na NF-e item
alter table public.fiscal_nfe_emissao_itens
  add column if not exists numero_pedido_cliente text;

alter table public.fiscal_nfe_emissao_itens
  add column if not exists numero_item_pedido integer;

alter table public.fiscal_nfe_emissao_itens
  add column if not exists informacoes_adicionais text;


-- =========================================================
-- RPC: fiscal_nfe_gerar_duplicatas
-- =========================================================
drop function if exists public.fiscal_nfe_gerar_duplicatas(uuid);
create or replace function public.fiscal_nfe_gerar_duplicatas(
  p_emissao_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa  uuid := public.current_empresa_id();
  v_emissao  record;
  v_cond     record;
  v_parcelas text[];
  v_n_parc   int;
  v_valor_parc numeric;
  v_resto    numeric;
  v_dups     jsonb := '[]'::jsonb;
  v_data_base date;
  i          int;
begin
  if v_empresa is null then
    raise exception 'Nenhuma empresa ativa.' using errcode='42501';
  end if;

  select * into v_emissao
  from public.fiscal_nfe_emissoes
  where id = p_emissao_id and empresa_id = v_empresa;

  if v_emissao is null then
    raise exception 'Emissão não encontrada.' using errcode='42501';
  end if;

  if v_emissao.condicao_pagamento_id is null then
    -- Sem condição de pagamento → limpar duplicatas
    update public.fiscal_nfe_emissoes
    set duplicatas = '[]'::jsonb
    where id = p_emissao_id and empresa_id = v_empresa;
    return jsonb_build_object('ok', true, 'duplicatas', 0);
  end if;

  select * into v_cond
  from public.financeiro_condicoes_pagamento
  where id = v_emissao.condicao_pagamento_id;

  if v_cond is null then
    return jsonb_build_object('ok', false, 'message', 'Condição de pagamento não encontrada.');
  end if;

  -- Parse condição: "30/60/90" → ['30','60','90']
  v_parcelas := string_to_array(v_cond.condicao, '/');
  v_n_parc := array_length(v_parcelas, 1);

  if v_n_parc is null or v_n_parc = 0 then
    return jsonb_build_object('ok', false, 'message', 'Condição de pagamento sem parcelas.');
  end if;

  v_data_base := coalesce(v_emissao.created_at::date, current_date);
  v_valor_parc := trunc(coalesce(v_emissao.total_nfe, 0) / v_n_parc, 2);
  v_resto := coalesce(v_emissao.total_nfe, 0) - (v_valor_parc * v_n_parc);

  for i in 1..v_n_parc loop
    v_dups := v_dups || jsonb_build_object(
      'numero', lpad(i::text, 3, '0'),
      'data_vencimento', (v_data_base + (v_parcelas[i]::int || ' days')::interval)::date,
      'valor', case when i = v_n_parc then v_valor_parc + v_resto else v_valor_parc end
    );
  end loop;

  update public.fiscal_nfe_emissoes
  set duplicatas = v_dups
  where id = p_emissao_id and empresa_id = v_empresa;

  return jsonb_build_object('ok', true, 'duplicatas', v_n_parc);
end;
$$;

revoke all on function public.fiscal_nfe_gerar_duplicatas(uuid) from public, anon;
grant execute on function public.fiscal_nfe_gerar_duplicatas(uuid) to authenticated, service_role;


-- =========================================================
-- Atualizar fiscal_nfe_gerar_de_pedido para propagar novos campos
-- =========================================================
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

  -- Criar emissão
  insert into public.fiscal_nfe_emissoes (
    empresa_id, status, ambiente,
    destinatario_pessoa_id,
    natureza_operacao, natureza_operacao_id,
    pedido_origem_id,
    total_frete,
    condicao_pagamento_id,
    transportadora_id,
    modalidade_frete
  ) values (
    v_empresa, 'rascunho', v_ambiente,
    v_pedido.cliente_id,
    coalesce((select descricao from public.fiscal_naturezas_operacao where id = v_nat_op_id), 'Venda de mercadoria'),
    v_nat_op_id,
    p_pedido_id,
    coalesce(v_pedido.valor_frete, 0),
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
    )
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
