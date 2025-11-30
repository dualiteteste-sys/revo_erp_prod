/*
  # Módulo de Vendas - Pedidos, Estoque e Financeiro

  ## Query Description
  Implementa o fluxo completo de vendas:
  1. Tabelas de Pedidos e Itens de Venda.
  2. RPCs para gestão (CRUD) de pedidos.
  3. RPC crítica `vendas_aprovar_pedido` que integra:
     - Baixa de estoque (via suprimentos_registrar_movimento).
     - Geração de financeiro (via contas_a_receber).

  ## Impact Summary
  - Segurança:
    - RLS por empresa_id.
    - RPCs SECURITY DEFINER com search_path seguro.
  - Integração:
    - Conecta Vendas -> Estoque -> Financeiro.
*/

-- =============================================
-- 1. Tabelas
-- =============================================

create table if not exists public.vendas_pedidos (
  id                uuid not null default gen_random_uuid(),
  empresa_id        uuid not null default public.current_empresa_id(),
  numero            serial,
  cliente_id        uuid not null,
  data_emissao      date default current_date,
  data_entrega      date,
  status            text not null default 'orcamento'
                    check (status in ('orcamento', 'aprovado', 'cancelado', 'concluido')),
  total_produtos    numeric(10,2) default 0,
  desconto          numeric(10,2) default 0,
  frete             numeric(10,2) default 0,
  total_geral       numeric(10,2) default 0,
  condicao_pagamento text,
  observacoes       text,
  observacoes_internas text,
  vendedor_id       uuid, -- Opcional, para comissões futuras
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),

  constraint vendas_pedidos_pkey primary key (id),
  constraint vendas_pedidos_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint vendas_pedidos_cliente_fkey foreign key (cliente_id) references public.pessoas(id),
  constraint vendas_pedidos_vendedor_fkey foreign key (vendedor_id) references public.pessoas(id)
);

create table if not exists public.vendas_itens (
  id             uuid not null default gen_random_uuid(),
  empresa_id     uuid not null default public.current_empresa_id(),
  pedido_id      uuid not null,
  produto_id     uuid not null,
  quantidade     numeric(10,3) not null check (quantidade > 0),
  preco_unitario numeric(10,2) not null default 0,
  desconto       numeric(10,2) default 0,
  total          numeric(10,2) not null default 0,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),

  constraint vendas_itens_pkey primary key (id),
  constraint vendas_itens_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint vendas_itens_pedido_fkey foreign key (pedido_id) references public.vendas_pedidos(id) on delete cascade,
  constraint vendas_itens_produto_fkey foreign key (produto_id) references public.produtos(id)
);

-- Índices
create index if not exists idx_vendas_pedidos_empresa on public.vendas_pedidos(empresa_id);
create index if not exists idx_vendas_pedidos_cliente on public.vendas_pedidos(cliente_id);
create index if not exists idx_vendas_pedidos_status  on public.vendas_pedidos(status);
create index if not exists idx_vendas_itens_pedido    on public.vendas_itens(pedido_id);
create index if not exists idx_vendas_itens_produto   on public.vendas_itens(produto_id);

-- Triggers updated_at
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'handle_updated_at_vendas_pedidos') then
    create trigger handle_updated_at_vendas_pedidos
      before update on public.vendas_pedidos
      for each row execute procedure public.tg_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'handle_updated_at_vendas_itens') then
    create trigger handle_updated_at_vendas_itens
      before update on public.vendas_itens
      for each row execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- =============================================
-- 2. RLS Policies
-- =============================================

alter table public.vendas_pedidos enable row level security;
alter table public.vendas_itens   enable row level security;

-- Pedidos
drop policy if exists "vendas_pedidos_select" on public.vendas_pedidos;
create policy "vendas_pedidos_select" on public.vendas_pedidos for select using (empresa_id = public.current_empresa_id());

drop policy if exists "vendas_pedidos_insert" on public.vendas_pedidos;
create policy "vendas_pedidos_insert" on public.vendas_pedidos for insert with check (empresa_id = public.current_empresa_id());

drop policy if exists "vendas_pedidos_update" on public.vendas_pedidos;
create policy "vendas_pedidos_update" on public.vendas_pedidos for update using (empresa_id = public.current_empresa_id()) with check (empresa_id = public.current_empresa_id());

drop policy if exists "vendas_pedidos_delete" on public.vendas_pedidos;
create policy "vendas_pedidos_delete" on public.vendas_pedidos for delete using (empresa_id = public.current_empresa_id());

-- Itens
drop policy if exists "vendas_itens_select" on public.vendas_itens;
create policy "vendas_itens_select" on public.vendas_itens for select using (empresa_id = public.current_empresa_id());

drop policy if exists "vendas_itens_insert" on public.vendas_itens;
create policy "vendas_itens_insert" on public.vendas_itens for insert with check (empresa_id = public.current_empresa_id());

drop policy if exists "vendas_itens_update" on public.vendas_itens;
create policy "vendas_itens_update" on public.vendas_itens for update using (empresa_id = public.current_empresa_id()) with check (empresa_id = public.current_empresa_id());

drop policy if exists "vendas_itens_delete" on public.vendas_itens;
create policy "vendas_itens_delete" on public.vendas_itens for delete using (empresa_id = public.current_empresa_id());

-- =============================================
-- 3. RPCs
-- =============================================

-- 3.1 Listar Pedidos
create or replace function public.vendas_list_pedidos(
  p_search text default null,
  p_status text default null,
  p_limit  int   default 50,
  p_offset int   default 0
)
returns table (
  id            uuid,
  numero        int,
  cliente_nome  text,
  data_emissao  date,
  status        text,
  total_geral   numeric
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  return query
  select
    p.id,
    p.numero,
    c.nome as cliente_nome,
    p.data_emissao,
    p.status,
    p.total_geral
  from public.vendas_pedidos p
  join public.pessoas c on p.cliente_id = c.id
  where p.empresa_id = v_empresa_id
    and (p_search is null
         or c.nome ilike '%' || p_search || '%'
         or p.numero::text ilike '%' || p_search || '%')
    and (p_status is null or p.status = p_status)
  order by p.numero desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.vendas_list_pedidos from public;
grant execute on function public.vendas_list_pedidos to authenticated, service_role;

-- 3.2 Detalhes do Pedido
create or replace function public.vendas_get_pedido_details(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_pedido     jsonb;
  v_itens      jsonb;
begin
  select to_jsonb(p.*) || jsonb_build_object('cliente_nome', c.nome)
  into v_pedido
  from public.vendas_pedidos p
  join public.pessoas c on p.cliente_id = c.id
  where p.id = p_id and p.empresa_id = v_empresa_id;

  if v_pedido is null then return null; end if;

  select jsonb_agg(
           to_jsonb(i.*) || jsonb_build_object(
             'produto_nome', prod.nome,
             'unidade',      prod.unidade,
             'sku',          prod.sku
           )
         )
  into v_itens
  from public.vendas_itens i
  join public.produtos prod on i.produto_id = prod.id
  where i.pedido_id = p_id and i.empresa_id = v_empresa_id;

  return v_pedido || jsonb_build_object('itens', coalesce(v_itens, '[]'::jsonb));
end;
$$;

revoke all on function public.vendas_get_pedido_details from public;
grant execute on function public.vendas_get_pedido_details to authenticated, service_role;

-- 3.3 Helper: Recalcular Totais
create or replace function public.vendas_recalc_total(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id  uuid := public.current_empresa_id();
  v_total_prod  numeric;
  v_frete       numeric;
  v_desconto    numeric;
begin
  select coalesce(sum(total), 0) into v_total_prod
  from public.vendas_itens
  where pedido_id = p_pedido_id and empresa_id = v_empresa_id;

  select coalesce(frete, 0), coalesce(desconto, 0)
  into v_frete, v_desconto
  from public.vendas_pedidos
  where id = p_pedido_id and empresa_id = v_empresa_id;

  update public.vendas_pedidos
  set total_produtos = v_total_prod,
      total_geral    = v_total_prod + v_frete - v_desconto
  where id = p_pedido_id and empresa_id = v_empresa_id;
end;
$$;

revoke all on function public.vendas_recalc_total from public;
grant execute on function public.vendas_recalc_total to authenticated, service_role;

-- 3.4 Upsert Pedido
create or replace function public.vendas_upsert_pedido(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id         uuid;
  v_empresa_id uuid := public.current_empresa_id();
begin
  if p_payload->>'id' is not null then
    update public.vendas_pedidos
    set
      cliente_id        = (p_payload->>'cliente_id')::uuid,
      data_emissao      = (p_payload->>'data_emissao')::date,
      data_entrega      = (p_payload->>'data_entrega')::date,
      status            = coalesce(p_payload->>'status', 'orcamento'),
      frete             = coalesce((p_payload->>'frete')::numeric, 0),
      desconto          = coalesce((p_payload->>'desconto')::numeric, 0),
      condicao_pagamento= p_payload->>'condicao_pagamento',
      observacoes       = p_payload->>'observacoes'
    where id = (p_payload->>'id')::uuid and empresa_id = v_empresa_id
    returning id into v_id;
  else
    insert into public.vendas_pedidos (
      empresa_id, cliente_id, data_emissao, data_entrega, status,
      frete, desconto, condicao_pagamento, observacoes
    ) values (
      v_empresa_id,
      (p_payload->>'cliente_id')::uuid,
      (p_payload->>'data_emissao')::date,
      (p_payload->>'data_entrega')::date,
      coalesce(p_payload->>'status', 'orcamento'),
      coalesce((p_payload->>'frete')::numeric, 0),
      coalesce((p_payload->>'desconto')::numeric, 0),
      p_payload->>'condicao_pagamento',
      p_payload->>'observacoes'
    )
    returning id into v_id;
  end if;

  perform public.vendas_recalc_total(v_id);
  perform pg_notify('app_log', '[RPC] vendas_upsert_pedido: ' || v_id);
  return public.vendas_get_pedido_details(v_id);
end;
$$;

revoke all on function public.vendas_upsert_pedido from public;
grant execute on function public.vendas_upsert_pedido to authenticated, service_role;

-- 3.5 Manage Item
create or replace function public.vendas_manage_item(
  p_pedido_id      uuid,
  p_item_id        uuid,
  p_produto_id     uuid,
  p_quantidade     numeric,
  p_preco_unitario numeric,
  p_desconto       numeric,
  p_action         text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_status     text;
begin
  -- Verifica status do pedido (não pode editar se aprovado/concluido)
  select status into v_status from public.vendas_pedidos
  where id = p_pedido_id and empresa_id = v_empresa_id;

  if v_status in ('aprovado', 'concluido') then
    raise exception 'Não é possível alterar itens de um pedido aprovado ou concluído.';
  end if;

  if p_action = 'delete' then
    delete from public.vendas_itens where id = p_item_id and empresa_id = v_empresa_id;
  else
    if p_item_id is not null then
      update public.vendas_itens
      set produto_id = p_produto_id,
          quantidade = p_quantidade,
          preco_unitario = p_preco_unitario,
          desconto = p_desconto,
          total = (p_quantidade * p_preco_unitario) - p_desconto
      where id = p_item_id and empresa_id = v_empresa_id;
    else
      insert into public.vendas_itens (
        empresa_id, pedido_id, produto_id, quantidade, preco_unitario, desconto, total
      ) values (
        v_empresa_id, p_pedido_id, p_produto_id, p_quantidade, p_preco_unitario, p_desconto,
        (p_quantidade * p_preco_unitario) - p_desconto
      );
    end if;
  end if;

  perform public.vendas_recalc_total(p_pedido_id);
end;
$$;

revoke all on function public.vendas_manage_item from public;
grant execute on function public.vendas_manage_item to authenticated, service_role;

-- 3.6 Aprovar Pedido (Integração Estoque + Financeiro)
create or replace function public.vendas_aprovar_pedido(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_pedido     record;
  v_item       record;
  v_produto    record;
  v_saldo      numeric;
begin
  -- 1. Busca e bloqueia pedido
  select * into v_pedido from public.vendas_pedidos
  where id = p_id and empresa_id = v_empresa_id for update;

  if v_pedido.status <> 'orcamento' then
    raise exception 'Apenas orçamentos podem ser aprovados.';
  end if;

  -- 2. Processa Itens (Estoque)
  for v_item in
    select * from public.vendas_itens where pedido_id = p_id and empresa_id = v_empresa_id
  loop
    -- Verifica se produto controla estoque
    select * into v_produto from public.produtos where id = v_item.produto_id;
    
    if v_produto.controla_estoque then
      -- Verifica saldo (Opcional: permitir estoque negativo? Aqui vamos bloquear)
      select saldo into v_saldo from public.estoque_saldos 
      where produto_id = v_item.produto_id and empresa_id = v_empresa_id;
      
      if coalesce(v_saldo, 0) < v_item.quantidade then
        raise exception 'Estoque insuficiente para o produto: %', v_produto.nome;
      end if;

      -- Baixa no estoque
      perform public.suprimentos_registrar_movimento(
        p_produto_id     := v_item.produto_id,
        p_tipo           := 'saida',
        p_quantidade     := v_item.quantidade,
        p_custo_unitario := null, -- Usa custo médio atual
        p_documento_ref  := 'Pedido Venda #' || v_pedido.numero::text,
        p_observacao     := 'Venda aprovada'
      );
    end if;
  end loop;

  -- 3. Gera Financeiro (Contas a Receber)
  insert into public.contas_a_receber (
    empresa_id, cliente_id, descricao, valor, data_vencimento, status, observacoes
  ) values (
    v_empresa_id,
    v_pedido.cliente_id,
    'Pedido de Venda #' || v_pedido.numero,
    v_pedido.total_geral,
    current_date + interval '30 days', -- Padrão simples
    'pendente',
    'Gerado automaticamente pelo módulo de vendas.'
  );

  -- 4. Atualiza Status
  update public.vendas_pedidos
  set status = 'aprovado'
  where id = p_id and empresa_id = v_empresa_id;

  perform pg_notify('app_log', '[RPC] vendas_aprovar_pedido: ' || p_id);
end;
$$;

revoke all on function public.vendas_aprovar_pedido from public;
grant execute on function public.vendas_aprovar_pedido to authenticated, service_role;
