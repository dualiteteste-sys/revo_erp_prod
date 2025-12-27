-- Ported from `supabase/migrations_legacy/20260104000000_vendas_pedidos_backend.sql` (DEV parity)

/*
  # Comercial - Pedidos de Venda (backend completo v1)

  - public.vendas_pedidos
  - public.vendas_itens_pedido
  - RPCs: vendas_list_pedidos, vendas_get_pedido_details, vendas_upsert_pedido,
          vendas_manage_item, vendas_aprovar_pedido
*/

-- (Conteúdo mantido o mais fiel possível ao legado; depende de public.tg_set_updated_at())


-- =============================================
-- 0) Limpeza segura de funções legadas
-- =============================================

drop function if exists public.vendas_list_pedidos(text, text);
drop function if exists public.vendas_get_pedido_details(uuid);
drop function if exists public.vendas_upsert_pedido(jsonb);
drop function if exists public.vendas_manage_item(uuid, uuid, uuid, numeric, numeric, numeric, text);
drop function if exists public.vendas_aprovar_pedido(uuid);

-- =============================================
-- 1) Sequence para numeração de pedidos
-- =============================================

create sequence if not exists public.vendas_pedidos_numero_seq;

-- =============================================
-- 2) Tabelas: vendas_pedidos e vendas_itens_pedido
-- =============================================

create table if not exists public.vendas_pedidos (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null default public.current_empresa_id(),
  numero             int  not null default nextval('public.vendas_pedidos_numero_seq'),
  cliente_id         uuid not null,
  data_emissao       date not null default current_date,
  data_entrega       date,
  status             text not null default 'orcamento'
                     check (status in ('orcamento','aprovado','cancelado','concluido')),
  total_produtos     numeric(15,2) not null default 0 check (total_produtos >= 0),
  frete              numeric(15,2) not null default 0 check (frete           >= 0),
  desconto           numeric(15,2) not null default 0 check (desconto        >= 0),
  total_geral        numeric(15,2) not null default 0 check (total_geral     >= 0),
  condicao_pagamento text,
  observacoes        text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  constraint vendas_pedidos_empresa_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint vendas_pedidos_cliente_fkey
    foreign key (cliente_id) references public.pessoas(id),
  constraint vendas_pedidos_empresa_numero_uk
    unique (empresa_id, numero)
);

create table if not exists public.vendas_itens_pedido (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null default public.current_empresa_id(),
  pedido_id        uuid not null,
  produto_id       uuid not null,
  quantidade       numeric(15,4) not null check (quantidade > 0),
  preco_unitario   numeric(15,4) not null check (preco_unitario >= 0),
  desconto         numeric(15,2) not null default 0 check (desconto >= 0),
  total            numeric(15,2) not null default 0 check (total >= 0),
  observacoes      text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  constraint vendas_itens_pedido_empresa_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint vendas_itens_pedido_pedido_fkey
    foreign key (pedido_id) references public.vendas_pedidos(id) on delete cascade,
  constraint vendas_itens_pedido_produto_fkey
    foreign key (produto_id) references public.produtos(id)
);

create index if not exists idx_vendas_pedidos_empresa
  on public.vendas_pedidos (empresa_id);

create index if not exists idx_vendas_pedidos_empresa_cliente
  on public.vendas_pedidos (empresa_id, cliente_id);

create index if not exists idx_vendas_pedidos_empresa_status
  on public.vendas_pedidos (empresa_id, status);

create index if not exists idx_vendas_pedidos_empresa_data
  on public.vendas_pedidos (empresa_id, data_emissao);

create index if not exists idx_vendas_itens_empresa_pedido
  on public.vendas_itens_pedido (empresa_id, pedido_id);

create index if not exists idx_vendas_itens_empresa_produto
  on public.vendas_itens_pedido (empresa_id, produto_id);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_vendas_pedidos'
      and tgrelid = 'public.vendas_pedidos'::regclass
  ) then
    create trigger handle_updated_at_vendas_pedidos
      before update on public.vendas_pedidos
      for each row
      execute procedure public.tg_set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_vendas_itens_pedido'
      and tgrelid = 'public.vendas_itens_pedido'::regclass
  ) then
    create trigger handle_updated_at_vendas_itens_pedido
      before update on public.vendas_itens_pedido
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

alter table public.vendas_pedidos       enable row level security;
alter table public.vendas_itens_pedido  enable row level security;

drop policy if exists "vendas_pedidos_select" on public.vendas_pedidos;
drop policy if exists "vendas_pedidos_insert" on public.vendas_pedidos;
drop policy if exists "vendas_pedidos_update" on public.vendas_pedidos;
drop policy if exists "vendas_pedidos_delete" on public.vendas_pedidos;

create policy "vendas_pedidos_select"
  on public.vendas_pedidos
  for select
  using (empresa_id = public.current_empresa_id());

create policy "vendas_pedidos_insert"
  on public.vendas_pedidos
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "vendas_pedidos_update"
  on public.vendas_pedidos
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "vendas_pedidos_delete"
  on public.vendas_pedidos
  for delete
  using (empresa_id = public.current_empresa_id());

drop policy if exists "vendas_itens_pedido_select" on public.vendas_itens_pedido;
drop policy if exists "vendas_itens_pedido_insert" on public.vendas_itens_pedido;
drop policy if exists "vendas_itens_pedido_update" on public.vendas_itens_pedido;
drop policy if exists "vendas_itens_pedido_delete" on public.vendas_itens_pedido;

create policy "vendas_itens_pedido_select"
  on public.vendas_itens_pedido
  for select
  using (empresa_id = public.current_empresa_id());

create policy "vendas_itens_pedido_insert"
  on public.vendas_itens_pedido
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "vendas_itens_pedido_update"
  on public.vendas_itens_pedido
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "vendas_itens_pedido_delete"
  on public.vendas_itens_pedido
  for delete
  using (empresa_id = public.current_empresa_id());

create or replace function public.vendas_recalcular_totais(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa        uuid := public.current_empresa_id();
  v_total_produtos numeric(15,2);
  v_frete          numeric(15,2);
  v_desconto       numeric(15,2);
begin
  select coalesce(sum(total),0)
  into v_total_produtos
  from public.vendas_itens_pedido i
  join public.vendas_pedidos p
    on p.id = i.pedido_id
   and p.empresa_id = v_empresa
  where i.pedido_id = p_pedido_id
    and i.empresa_id = v_empresa;

  select frete, desconto
  into v_frete, v_desconto
  from public.vendas_pedidos p
  where p.id = p_pedido_id
    and p.empresa_id = v_empresa;

  v_total_produtos := coalesce(v_total_produtos, 0);
  v_frete          := coalesce(v_frete, 0);
  v_desconto       := coalesce(v_desconto, 0);

  update public.vendas_pedidos
     set total_produtos = v_total_produtos,
         total_geral = greatest(0, v_total_produtos + v_frete - v_desconto),
         updated_at = now()
   where id = p_pedido_id
     and empresa_id = v_empresa;
end;
$$;

create or replace function public.vendas_list_pedidos(
  p_q text default null,
  p_status text default null
)
returns table (
  id uuid,
  numero int,
  cliente_id uuid,
  cliente_nome text,
  data_emissao date,
  data_entrega date,
  status text,
  total_produtos numeric,
  frete numeric,
  desconto numeric,
  total_geral numeric,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  return query
  select
    p.id,
    p.numero,
    p.cliente_id,
    c.nome as cliente_nome,
    p.data_emissao,
    p.data_entrega,
    p.status,
    p.total_produtos,
    p.frete,
    p.desconto,
    p.total_geral,
    count(*) over() as total_count
  from public.vendas_pedidos p
  join public.pessoas c on c.id = p.cliente_id
  where p.empresa_id = v_empresa
    and (p_status is null or p.status = p_status)
    and (
      p_q is null
      or p.numero::text ilike '%' || p_q || '%'
      or c.nome ilike '%' || p_q || '%'
    )
  order by p.data_emissao desc, p.numero desc;
end;
$$;
revoke all on function public.vendas_list_pedidos(text, text) from public;
grant execute on function public.vendas_list_pedidos(text, text) to authenticated, service_role;

create or replace function public.vendas_get_pedido_details(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_pedido jsonb;
  v_itens jsonb;
begin
  select to_jsonb(p.*) into v_pedido
  from public.vendas_pedidos p
  where p.id = p_id and p.empresa_id = v_empresa;

  if v_pedido is null then
    raise exception 'PEDIDO_NOT_FOUND';
  end if;

  select coalesce(jsonb_agg(to_jsonb(i.*) order by i.created_at), '[]'::jsonb)
  into v_itens
  from public.vendas_itens_pedido i
  where i.pedido_id = p_id and i.empresa_id = v_empresa;

  return jsonb_build_object('pedido', v_pedido, 'itens', v_itens);
end;
$$;
revoke all on function public.vendas_get_pedido_details(uuid) from public;
grant execute on function public.vendas_get_pedido_details(uuid) to authenticated, service_role;

create or replace function public.vendas_upsert_pedido(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_cliente_id uuid := (p_payload->>'cliente_id')::uuid;
  v_data_emissao date := coalesce(nullif(p_payload->>'data_emissao','')::date, current_date);
  v_data_entrega date := nullif(p_payload->>'data_entrega','')::date;
  v_status text := coalesce(nullif(p_payload->>'status',''), 'orcamento');
  v_condicao text := nullif(p_payload->>'condicao_pagamento','');
  v_obs text := nullif(p_payload->>'observacoes','');
  v_row public.vendas_pedidos;
begin
  if v_id is null then
    insert into public.vendas_pedidos (empresa_id, cliente_id, data_emissao, data_entrega, status, condicao_pagamento, observacoes)
    values (v_empresa, v_cliente_id, v_data_emissao, v_data_entrega, v_status, v_condicao, v_obs)
    returning * into v_row;
  else
    update public.vendas_pedidos set
      cliente_id = v_cliente_id,
      data_emissao = v_data_emissao,
      data_entrega = v_data_entrega,
      status = v_status,
      condicao_pagamento = v_condicao,
      observacoes = v_obs,
      updated_at = now()
    where id = v_id and empresa_id = v_empresa
    returning * into v_row;
  end if;

  perform public.vendas_recalcular_totais(v_row.id);
  return public.vendas_get_pedido_details(v_row.id);
end;
$$;
revoke all on function public.vendas_upsert_pedido(jsonb) from public;
grant execute on function public.vendas_upsert_pedido(jsonb) to authenticated, service_role;

create or replace function public.vendas_manage_item(
  p_pedido_id uuid,
  p_item_id uuid,
  p_produto_id uuid,
  p_quantidade numeric,
  p_preco_unitario numeric,
  p_desconto numeric,
  p_action text default 'upsert'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_total numeric(15,2);
begin
  if p_action = 'delete' then
    delete from public.vendas_itens_pedido
    where id = p_item_id
      and empresa_id = v_empresa
      and pedido_id = p_pedido_id;
  else
    v_total := greatest(0, coalesce(p_quantidade,0) * coalesce(p_preco_unitario,0) - coalesce(p_desconto,0));

    if p_item_id is null then
      insert into public.vendas_itens_pedido (empresa_id, pedido_id, produto_id, quantidade, preco_unitario, desconto, total)
      values (v_empresa, p_pedido_id, p_produto_id, p_quantidade, p_preco_unitario, coalesce(p_desconto,0), v_total);
    else
      update public.vendas_itens_pedido set
        produto_id = p_produto_id,
        quantidade = p_quantidade,
        preco_unitario = p_preco_unitario,
        desconto = coalesce(p_desconto,0),
        total = v_total,
        updated_at = now()
      where id = p_item_id
        and empresa_id = v_empresa
        and pedido_id = p_pedido_id;
    end if;
  end if;

  perform public.vendas_recalcular_totais(p_pedido_id);
end;
$$;
revoke all on function public.vendas_manage_item(uuid, uuid, uuid, numeric, numeric, numeric, text) from public;
grant execute on function public.vendas_manage_item(uuid, uuid, uuid, numeric, numeric, numeric, text) to authenticated, service_role;

create or replace function public.vendas_aprovar_pedido(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  update public.vendas_pedidos
     set status = 'aprovado',
         updated_at = now()
   where id = p_id
     and empresa_id = v_empresa
     and status = 'orcamento';
end;
$$;
revoke all on function public.vendas_aprovar_pedido(uuid) from public;
grant execute on function public.vendas_aprovar_pedido(uuid) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

