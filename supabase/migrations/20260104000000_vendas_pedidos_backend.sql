/*
  # Comercial - Pedidos de Venda (backend completo v1)

  ## Query Description
  Cria/substitui o backend de Pedidos de Venda com:

  - Tabela principal: public.vendas_pedidos (cabeçalho).
  - Tabela de itens: public.vendas_itens_pedido.
  - Seq. numérica de pedidos (numero) multi-tenant.
  - RLS por operação (SELECT/INSERT/UPDATE/DELETE).
  - RPCs:
    - vendas_list_pedidos        → lista simples (sem paginação no frontend, mas com total_count).
    - vendas_get_pedido_details  → detalhes + itens.
    - vendas_upsert_pedido       → cria/atualiza cabeçalho.
    - vendas_manage_item         → add/update/remove itens + recalcula totais.
    - vendas_aprovar_pedido      → fluxo simples de aprovação.

  ## Impact Summary
  - Segurança:
    - Multi-tenant via empresa_id = public.current_empresa_id().
    - RLS por operação nas duas tabelas.
    - Todas as RPCs com SECURITY DEFINER e search_path = pg_catalog, public.
  - Compatibilidade:
    - Mantém nomes de tabelas e RPCs já usados no frontend.
    - create table/sequence if not exists (evita erro em ambientes já provisionados).
  - Reversibilidade:
    - Tabelas, índices, policies e funções isoladas; podem ser dropadas em migração futura.
  - Performance:
    - Índices em empresa_id, cliente_id, status, datas.
    - Listagem com count(*) over() para futura paginação.
*/


-- =============================================
-- 0) Limpeza segura de funções legadas
-- =============================================

drop function if exists public.vendas_list_pedidos(text, text);
drop function if exists public.vendas_get_pedido_details(uuid);
drop function if exists public.vendas_upsert_pedido(jsonb);
drop function if exists public.vendas_manage_item(
  uuid, uuid, uuid, numeric, numeric, numeric, text
);
drop function if exists public.vendas_aprovar_pedido(uuid);


-- =============================================
-- 1) Sequence para numeração de pedidos
-- =============================================

create sequence if not exists public.vendas_pedidos_numero_seq;


-- =============================================
-- 2) Tabelas: vendas_pedidos (cabeçalho) e vendas_itens_pedido
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

-- Índices cabeçalho
create index if not exists idx_vendas_pedidos_empresa
  on public.vendas_pedidos (empresa_id);

create index if not exists idx_vendas_pedidos_empresa_cliente
  on public.vendas_pedidos (empresa_id, cliente_id);

create index if not exists idx_vendas_pedidos_empresa_status
  on public.vendas_pedidos (empresa_id, status);

create index if not exists idx_vendas_pedidos_empresa_data
  on public.vendas_pedidos (empresa_id, data_emissao);

-- Índices itens
create index if not exists idx_vendas_itens_empresa_pedido
  on public.vendas_itens_pedido (empresa_id, pedido_id);

create index if not exists idx_vendas_itens_empresa_produto
  on public.vendas_itens_pedido (empresa_id, produto_id);

-- Trigger updated_at
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


-- =============================================
-- 3) RLS por operação
-- =============================================

alter table public.vendas_pedidos       enable row level security;
alter table public.vendas_itens_pedido  enable row level security;

-- Cabeçalho
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

-- Itens
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


-- =============================================
-- 4) Funções auxiliares (recalcular totais)
-- =============================================

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
  -- soma dos itens
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
  set
    total_produtos = v_total_produtos,
    total_geral    = greatest(v_total_produtos + v_frete - v_desconto, 0)
  where id = p_pedido_id
    and empresa_id = v_empresa;
end;
$$;

revoke all on function public.vendas_recalcular_totais from public;
grant execute on function public.vendas_recalcular_totais to authenticated, service_role;


-- =============================================
-- 5) RPCs – Pedidos de Venda
-- =============================================

-- 5.1) Listagem simples (usada por listVendas)
create or replace function public.vendas_list_pedidos(
  p_search text default null,
  p_status text default null
)
returns table (
  id                 uuid,
  numero             int,
  cliente_id         uuid,
  cliente_nome       text,
  data_emissao       date,
  data_entrega       date,
  status             text,
  total_produtos     numeric,
  frete              numeric,
  desconto           numeric,
  total_geral        numeric,
  condicao_pagamento text,
  observacoes        text,
  total_count        bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  if p_status is not null
     and p_status not in ('orcamento','aprovado','cancelado','concluido') then
    raise exception 'Status de pedido inválido.';
  end if;

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
    p.condicao_pagamento,
    p.observacoes,
    count(*) over() as total_count
  from public.vendas_pedidos p
  join public.pessoas c
    on c.id = p.cliente_id
  where p.empresa_id = v_empresa
    and (p_status is null or p.status = p_status)
    and (
      p_search is null
      or c.nome ilike '%'||p_search||'%'
      or cast(p.numero as text) ilike '%'||p_search||'%'
      or coalesce(p.observacoes,'') ilike '%'||p_search||'%'
    )
  order by
    p.data_emissao desc,
    p.numero desc;
end;
$$;

revoke all on function public.vendas_list_pedidos from public;
grant execute on function public.vendas_list_pedidos to authenticated, service_role;


-- 5.2) Detalhes + itens (usada por getVendaDetails)
create or replace function public.vendas_get_pedido_details(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_pedido  jsonb;
  v_itens   jsonb;
begin
  -- cabeçalho
  select
    to_jsonb(p.*)
    || jsonb_build_object('cliente_nome', c.nome)
  into v_pedido
  from public.vendas_pedidos p
  join public.pessoas c
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

revoke all on function public.vendas_get_pedido_details from public;
grant execute on function public.vendas_get_pedido_details to authenticated, service_role;


-- 5.3) Upsert cabeçalho (usado por saveVenda)
create or replace function public.vendas_upsert_pedido(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa   uuid := public.current_empresa_id();
  v_id        uuid;
  v_cliente   uuid;
  v_status    text;
  v_data_emis date;
  v_data_ent  date;
  v_frete     numeric;
  v_desc      numeric;
begin
  v_cliente := (p_payload->>'cliente_id')::uuid;
  if v_cliente is null then
    raise exception 'cliente_id é obrigatório.';
  end if;

  if not exists (
    select 1 from public.pessoas c where c.id = v_cliente
  ) then
    raise exception 'Cliente não encontrado.';
  end if;

  v_status := coalesce(p_payload->>'status', 'orcamento');
  if v_status not in ('orcamento','aprovado','cancelado','concluido') then
    raise exception 'Status de pedido inválido.';
  end if;

  v_data_emis := coalesce(
    (p_payload->>'data_emissao')::date,
    current_date
  );
  v_data_ent  := (p_payload->>'data_entrega')::date;

  v_frete := coalesce((p_payload->>'frete')::numeric, 0);
  v_desc  := coalesce((p_payload->>'desconto')::numeric, 0);

  if p_payload->>'id' is not null then
    -- Update
    update public.vendas_pedidos p
    set
      cliente_id         = v_cliente,
      data_emissao       = v_data_emis,
      data_entrega       = v_data_ent,
      status             = v_status,
      frete              = v_frete,
      desconto           = v_desc,
      condicao_pagamento = p_payload->>'condicao_pagamento',
      observacoes        = p_payload->>'observacoes'
    where p.id = (p_payload->>'id')::uuid
      and p.empresa_id = v_empresa
    returning p.id into v_id;
  else
    -- Insert
    insert into public.vendas_pedidos (
      empresa_id,
      cliente_id,
      data_emissao,
      data_entrega,
      status,
      frete,
      desconto,
      condicao_pagamento,
      observacoes
    ) values (
      v_empresa,
      v_cliente,
      v_data_emis,
      v_data_ent,
      v_status,
      v_frete,
      v_desc,
      p_payload->>'condicao_pagamento',
      p_payload->>'observacoes'
    )
    returning id into v_id;
  end if;

  -- Recalcula totais (caso já existam itens)
  perform public.vendas_recalcular_totais(v_id);

  perform pg_notify(
    'app_log',
    '[RPC] vendas_upsert_pedido: ' || v_id
  );

  return public.vendas_get_pedido_details(v_id);
end;
$$;

revoke all on function public.vendas_upsert_pedido from public;
grant execute on function public.vendas_upsert_pedido to authenticated, service_role;


-- 5.4) Gerenciar itens (usado por manageItem)
create or replace function public.vendas_manage_item(
  p_pedido_id       uuid,
  p_item_id         uuid,
  p_produto_id      uuid,
  p_quantidade      numeric,
  p_preco_unitario  numeric,
  p_desconto        numeric,
  p_action          text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_status  text;
  v_total   numeric;
begin
  if p_pedido_id is null then
    raise exception 'p_pedido_id é obrigatório.';
  end if;

  if p_action is null then
    p_action := 'add';
  end if;

  if p_action not in ('add','update','remove') then
    raise exception 'p_action inválido. Use add, update ou remove.';
  end if;

  -- valida pedido e status
  select status
  into v_status
  from public.vendas_pedidos p
  where p.id = p_pedido_id
    and p.empresa_id = v_empresa;

  if v_status is null then
    raise exception 'Pedido não encontrado ou acesso negado.';
  end if;

  if v_status <> 'orcamento' then
    raise exception 'Só é permitido alterar itens de pedidos em status "orcamento".';
  end if;

  if p_action in ('add','update') then
    if p_produto_id is null then
      raise exception 'p_produto_id é obrigatório para add/update.';
    end if;

    if p_quantidade is null or p_quantidade <= 0 then
      raise exception 'p_quantidade deve ser > 0.';
    end if;

    if p_preco_unitario is null or p_preco_unitario < 0 then
      raise exception 'p_preco_unitario deve ser >= 0.';
    end if;

    if p_desconto is null then
      p_desconto := 0;
    end if;

    v_total := greatest(p_quantidade * p_preco_unitario - p_desconto, 0);

    -- garante produto existente
    if not exists (
      select 1 from public.produtos pr where pr.id = p_produto_id
    ) then
      raise exception 'Produto não encontrado.';
    end if;
  end if;

  if p_action = 'remove' then
    if p_item_id is null then
      raise exception 'p_item_id é obrigatório para remove.';
    end if;

    delete from public.vendas_itens_pedido i
    where i.id = p_item_id
      and i.pedido_id = p_pedido_id
      and i.empresa_id = v_empresa;
  elsif p_action = 'add' then
    insert into public.vendas_itens_pedido (
      empresa_id,
      pedido_id,
      produto_id,
      quantidade,
      preco_unitario,
      desconto,
      total
    ) values (
      v_empresa,
      p_pedido_id,
      p_produto_id,
      p_quantidade,
      p_preco_unitario,
      p_desconto,
      v_total
    );
  elsif p_action = 'update' then
    if p_item_id is null then
      raise exception 'p_item_id é obrigatório para update.';
    end if;

    update public.vendas_itens_pedido i
    set
      produto_id     = p_produto_id,
      quantidade     = p_quantidade,
      preco_unitario = p_preco_unitario,
      desconto       = p_desconto,
      total          = v_total
    where i.id = p_item_id
      and i.pedido_id = p_pedido_id
      and i.empresa_id = v_empresa;
  end if;

  -- Recalcula totais do pedido
  perform public.vendas_recalcular_totais(p_pedido_id);

  perform pg_notify(
    'app_log',
    '[RPC] vendas_manage_item: pedido='||p_pedido_id||' action='||p_action
  );
end;
$$;

revoke all on function public.vendas_manage_item from public;
grant execute on function public.vendas_manage_item to authenticated, service_role;


-- 5.5) Aprovar pedido (usado por aprovarVenda)
create or replace function public.vendas_aprovar_pedido(
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa   uuid := public.current_empresa_id();
  v_status    text;
  v_total     numeric;
  v_itens_qtd int;
begin
  select status, total_geral
  into v_status, v_total
  from public.vendas_pedidos p
  where p.id = p_id
    and p.empresa_id = v_empresa;

  if v_status is null then
    raise exception 'Pedido não encontrado ou acesso negado.';
  end if;

  if v_status <> 'orcamento' then
    raise exception 'Apenas pedidos em status "orcamento" podem ser aprovados.';
  end if;

  -- garante que tem itens
  select count(*)
  into v_itens_qtd
  from public.vendas_itens_pedido i
  where i.pedido_id = p_id
    and i.empresa_id = v_empresa;

  if coalesce(v_itens_qtd,0) = 0 then
    raise exception 'Não é possível aprovar pedido sem itens.';
  end if;

  -- garante total > 0 (recalcula antes)
  perform public.vendas_recalcular_totais(p_id);

  select total_geral
  into v_total
  from public.vendas_pedidos
  where id = p_id
    and empresa_id = v_empresa;

  if v_total <= 0 then
    raise exception 'Não é possível aprovar pedido com total_geral <= 0.';
  end if;

  update public.vendas_pedidos
  set status = 'aprovado'
  where id = p_id
    and empresa_id = v_empresa;

  perform pg_notify(
    'app_log',
    '[RPC] vendas_aprovar_pedido: '||p_id
  );
end;
$$;

revoke all on function public.vendas_aprovar_pedido from public;
grant execute on function public.vendas_aprovar_pedido to authenticated, service_role;
