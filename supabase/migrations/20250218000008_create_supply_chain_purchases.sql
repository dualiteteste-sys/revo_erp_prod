/*
  # Módulo Suprimentos - Ordens de Compra

  ## Query Description
  Implementa tabelas e funções para gestão de pedidos de compra.
  Inclui funcionalidade para receber pedidos e gerar movimentação de estoque automaticamente,
  integrando com o módulo de Estoques (suprimentos_registrar_movimento).

  ## Impact Summary
  - Segurança:
    - RLS ativa em compras_pedidos e compras_itens.
    - RPCs SECURITY DEFINER com search_path restrito (pg_catalog, public).
    - Filtros explícitos por empresa_id = public.current_empresa_id().
  - Funcionalidade:
    - Pedidos de compra com status (rascunho, enviado, recebido, cancelado).
    - Itens do pedido vinculados a produtos.
    - Recebimento automático gera entrada no estoque via RPC de suprimentos.
  - Compatibilidade:
    - create table if not exists, índices e triggers idempotentes.
    - Funções antigas droppadas por assinatura exata (Regra 14).
*/

-- =============================================
-- 0. Drops de funções antigas (Regra 14)
-- =============================================

drop function if exists public.compras_list_pedidos(text, text, int, int);
drop function if exists public.compras_get_pedido_details(uuid);
drop function if exists public.compras_upsert_pedido(jsonb);
drop function if exists public.compras_manage_item(uuid, uuid, uuid, numeric, numeric, text);
drop function if exists public.compras_recalc_total(uuid);
drop function if exists public.compras_receber_pedido(uuid);
drop function if exists public.search_suppliers_for_current_user(text, int);

-- =============================================
-- 1. Tabelas
-- =============================================

create table if not exists public.compras_pedidos (
  id             uuid not null default gen_random_uuid(),
  empresa_id     uuid not null default public.current_empresa_id(),
  numero         serial,
  fornecedor_id  uuid not null,
  data_emissao   date default current_date,
  data_prevista  date,
  status         text not null default 'rascunho'
                 check (status in ('rascunho', 'enviado', 'recebido', 'cancelado')),
  total_produtos numeric(10,2) default 0,
  frete          numeric(10,2) default 0,
  desconto       numeric(10,2) default 0,
  total_geral    numeric(10,2) default 0,
  observacoes    text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),

  constraint compras_pedidos_pkey        primary key (id),
  constraint compras_pedidos_empresa_fkey foreign key (empresa_id)
    references public.empresas(id) on delete cascade,
  constraint compras_pedidos_fornecedor_fkey foreign key (fornecedor_id)
    references public.fornecedores(id)
);

create table if not exists public.compras_itens (
  id             uuid not null default gen_random_uuid(),
  empresa_id     uuid not null default public.current_empresa_id(),
  pedido_id      uuid not null,
  produto_id     uuid not null,
  quantidade     numeric(10,3) not null check (quantidade > 0),
  preco_unitario numeric(10,2) not null default 0,
  total          numeric(10,2) not null default 0,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),

  constraint compras_itens_pkey          primary key (id),
  constraint compras_itens_empresa_fkey  foreign key (empresa_id)
    references public.empresas(id) on delete cascade,
  constraint compras_itens_pedido_fkey   foreign key (pedido_id)
    references public.compras_pedidos(id) on delete cascade,
  constraint compras_itens_produto_fkey  foreign key (produto_id)
    references public.produtos(id)
);

-- Índices
create index if not exists idx_compras_pedidos_empresa   on public.compras_pedidos(empresa_id);
create index if not exists idx_compras_pedidos_fornecedor on public.compras_pedidos(fornecedor_id);
create index if not exists idx_compras_itens_pedido      on public.compras_itens(pedido_id);
create index if not exists idx_compras_itens_produto     on public.compras_itens(produto_id);

-- Triggers updated_at (idempotentes)
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_compras_pedidos'
      and tgrelid = 'public.compras_pedidos'::regclass
  ) then
    create trigger handle_updated_at_compras_pedidos
      before update on public.compras_pedidos
      for each row execute procedure public.tg_set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_compras_itens'
      and tgrelid = 'public.compras_itens'::regclass
  ) then
    create trigger handle_updated_at_compras_itens
      before update on public.compras_itens
      for each row execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- =============================================
-- 2. RLS Policies
-- =============================================

alter table public.compras_pedidos enable row level security;
alter table public.compras_itens   enable row level security;

-- Pedidos
drop policy if exists "compras_pedidos_select" on public.compras_pedidos;
create policy "compras_pedidos_select"
  on public.compras_pedidos
  for select
  using (empresa_id = public.current_empresa_id());

drop policy if exists "compras_pedidos_insert" on public.compras_pedidos;
create policy "compras_pedidos_insert"
  on public.compras_pedidos
  for insert
  with check (empresa_id = public.current_empresa_id());

drop policy if exists "compras_pedidos_update" on public.compras_pedidos;
create policy "compras_pedidos_update"
  on public.compras_pedidos
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists "compras_pedidos_delete" on public.compras_pedidos;
create policy "compras_pedidos_delete"
  on public.compras_pedidos
  for delete
  using (empresa_id = public.current_empresa_id());

-- Itens
drop policy if exists "compras_itens_select" on public.compras_itens;
create policy "compras_itens_select"
  on public.compras_itens
  for select
  using (empresa_id = public.current_empresa_id());

drop policy if exists "compras_itens_insert" on public.compras_itens;
create policy "compras_itens_insert"
  on public.compras_itens
  for insert
  with check (empresa_id = public.current_empresa_id());

drop policy if exists "compras_itens_update" on public.compras_itens;
create policy "compras_itens_update"
  on public.compras_itens
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists "compras_itens_delete" on public.compras_itens;
create policy "compras_itens_delete"
  on public.compras_itens
  for delete
  using (empresa_id = public.current_empresa_id());

-- =============================================
-- 3. RPCs
-- =============================================

-- 3.1 Listar Pedidos
create or replace function public.compras_list_pedidos(
  p_search text default null,
  p_status text default null,
  p_limit  int   default 50,
  p_offset int   default 0
)
returns table (
  id            uuid,
  numero        int,
  fornecedor_nome text,
  data_emissao  date,
  data_prevista date,
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
    f.nome as fornecedor_nome,
    p.data_emissao,
    p.data_prevista,
    p.status,
    p.total_geral
  from public.compras_pedidos p
  join public.fornecedores f
    on p.fornecedor_id = f.id
  where p.empresa_id = v_empresa_id
    and (p_search is null
         or f.nome ilike '%' || p_search || '%'
         or p.numero::text ilike '%' || p_search || '%')
    and (p_status is null or p.status = p_status)
  order by p.numero desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.compras_list_pedidos from public;
grant execute on function public.compras_list_pedidos to authenticated, service_role;

-- 3.2 Detalhes do Pedido
create or replace function public.compras_get_pedido_details(p_id uuid)
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
  select to_jsonb(p.*)
         || jsonb_build_object('fornecedor_nome', f.nome)
  into v_pedido
  from public.compras_pedidos p
  join public.fornecedores f
    on p.fornecedor_id = f.id
  where p.id = p_id
    and p.empresa_id = v_empresa_id;

  if v_pedido is null then
    return null;
  end if;

  select jsonb_agg(
           to_jsonb(i.*)
           || jsonb_build_object(
                'produto_nome', prod.nome,
                'unidade',      prod.unidade
              )
         )
  into v_itens
  from public.compras_itens i
  join public.produtos prod
    on i.produto_id = prod.id
  where i.pedido_id = p_id
    and i.empresa_id = v_empresa_id;

  return v_pedido
         || jsonb_build_object('itens', coalesce(v_itens, '[]'::jsonb));
end;
$$;

revoke all on function public.compras_get_pedido_details from public;
grant execute on function public.compras_get_pedido_details to authenticated, service_role;

-- 3.3 Upsert Pedido (Header)
create or replace function public.compras_upsert_pedido(
  p_payload jsonb
)
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
    update public.compras_pedidos
    set
      fornecedor_id = (p_payload->>'fornecedor_id')::uuid,
      data_emissao  = (p_payload->>'data_emissao')::date,
      data_prevista = (p_payload->>'data_prevista')::date,
      status        = coalesce(p_payload->>'status', 'rascunho'),
      frete         = coalesce((p_payload->>'frete')::numeric, 0),
      desconto      = coalesce((p_payload->>'desconto')::numeric, 0),
      observacoes   = p_payload->>'observacoes'
    where id = (p_payload->>'id')::uuid
      and empresa_id = v_empresa_id
    returning id into v_id;
  else
    insert into public.compras_pedidos (
      empresa_id, fornecedor_id, data_emissao, data_prevista,
      status, frete, desconto, observacoes
    ) values (
      v_empresa_id,
      (p_payload->>'fornecedor_id')::uuid,
      (p_payload->>'data_emissao')::date,
      (p_payload->>'data_prevista')::date,
      coalesce(p_payload->>'status', 'rascunho'),
      coalesce((p_payload->>'frete')::numeric, 0),
      coalesce((p_payload->>'desconto')::numeric, 0),
      p_payload->>'observacoes'
    )
    returning id into v_id;
  end if;

  -- Recalcula totais (caso tenha alterado frete/desconto)
  perform public.compras_recalc_total(v_id);

  perform pg_notify('app_log', '[RPC] compras_upsert_pedido: ' || v_id);
  return public.compras_get_pedido_details(v_id);
end;
$$;

revoke all on function public.compras_upsert_pedido from public;
grant execute on function public.compras_upsert_pedido to authenticated, service_role;

-- 3.4 Manage Item (Add/Update/Remove)
create or replace function public.compras_manage_item(
  p_pedido_id      uuid,
  p_item_id        uuid,   -- null se for add
  p_produto_id     uuid,
  p_quantidade     numeric,
  p_preco_unitario numeric,
  p_action         text    -- 'upsert' ou 'delete'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  -- Garantir que o pedido pertence à empresa atual
  if not exists (
    select 1
    from public.compras_pedidos p
    where p.id = p_pedido_id
      and p.empresa_id = v_empresa_id
  ) then
    raise exception 'Pedido inválido para a empresa atual.';
  end if;

  if p_action = 'delete' then
    delete from public.compras_itens
    where id = p_item_id
      and empresa_id = v_empresa_id;
  else
    if p_item_id is not null then
      update public.compras_itens
      set
        produto_id     = p_produto_id,
        quantidade     = p_quantidade,
        preco_unitario = p_preco_unitario,
        total          = p_quantidade * p_preco_unitario
      where id = p_item_id
        and empresa_id = v_empresa_id;
    else
      insert into public.compras_itens (
        empresa_id, pedido_id, produto_id,
        quantidade, preco_unitario, total
      ) values (
        v_empresa_id,
        p_pedido_id,
        p_produto_id,
        p_quantidade,
        p_preco_unitario,
        p_quantidade * p_preco_unitario
      );
    end if;
  end if;

  -- Recalcula totais do pedido
  perform public.compras_recalc_total(p_pedido_id);
end;
$$;

revoke all on function public.compras_manage_item from public;
grant execute on function public.compras_manage_item to authenticated, service_role;

-- 3.5 Helper: Recalcular Totais
create or replace function public.compras_recalc_total(
  p_pedido_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id  uuid   := public.current_empresa_id();
  v_total_prod  numeric;
  v_frete       numeric;
  v_desconto    numeric;
begin
  select coalesce(sum(total), 0)
  into v_total_prod
  from public.compras_itens
  where pedido_id = p_pedido_id
    and empresa_id = v_empresa_id;

  select coalesce(frete, 0), coalesce(desconto, 0)
  into v_frete, v_desconto
  from public.compras_pedidos
  where id = p_pedido_id
    and empresa_id = v_empresa_id;

  update public.compras_pedidos
  set
    total_produtos = v_total_prod,
    total_geral    = v_total_prod + v_frete - v_desconto
  where id = p_pedido_id
    and empresa_id = v_empresa_id;
end;
$$;

revoke all on function public.compras_recalc_total from public;
grant execute on function public.compras_recalc_total to authenticated, service_role;

-- 3.6 Receber Pedido (Gera Estoque via RPC de Suprimentos)
create or replace function public.compras_receber_pedido(
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_pedido     record;
  v_item       record;
begin
  -- Busca pedido da empresa atual
  select *
  into v_pedido
  from public.compras_pedidos p
  where p.id = p_id
    and p.empresa_id = v_empresa_id
  for update;

  if v_pedido is null then
    raise exception 'Pedido não encontrado para a empresa atual.';
  end if;

  if v_pedido.status = 'recebido' then
    raise exception 'Este pedido já foi recebido.';
  end if;

  if v_pedido.status = 'cancelado' then
    raise exception 'Não é possível receber um pedido cancelado.';
  end if;

  -- Itera sobre itens e lança no estoque via RPC de suprimentos
  for v_item in
    select *
    from public.compras_itens i
    where i.pedido_id = p_id
      and i.empresa_id = v_empresa_id
  loop
    perform public.suprimentos_registrar_movimento(
      p_produto_id     := v_item.produto_id,
      p_tipo           := 'entrada',
      p_quantidade     := v_item.quantidade,
      p_custo_unitario := v_item.preco_unitario,
      p_documento_ref  := 'Pedido #' || v_pedido.numero::text,
      p_observacao     := 'Recebimento de compra'
    );
  end loop;

  -- Atualiza status do pedido
  update public.compras_pedidos
  set status = 'recebido'
  where id = p_id
    and empresa_id = v_empresa_id;

  perform pg_notify('app_log', '[RPC] compras_receber_pedido: ' || p_id);
end;
$$;

revoke all on function public.compras_receber_pedido from public;
grant execute on function public.compras_receber_pedido to authenticated, service_role;

-- 3.7 Search Suppliers (Helper para autocomplete)
create or replace function public.search_suppliers_for_current_user(
  p_search text,
  p_limit  int default 20
)
returns table (
  id       uuid,
  nome     text,
  doc_unico text,
  label    text
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
    p.nome,
    p.doc_unico,
    (p.nome || coalesce(' (' || p.doc_unico || ')', '')) as label
  from public.pessoas p
  where p.empresa_id = v_empresa_id
    and (p.tipo = 'fornecedor' or p.tipo = 'ambos')
    and (
      p_search is null
      or p.nome      ilike '%' || p_search || '%'
      or p.doc_unico ilike '%' || p_search || '%'
    )
  limit p_limit;
end;
$$;

revoke all on function public.search_suppliers_for_current_user from public;
grant execute on function public.search_suppliers_for_current_user(text, int) to authenticated, service_role;
