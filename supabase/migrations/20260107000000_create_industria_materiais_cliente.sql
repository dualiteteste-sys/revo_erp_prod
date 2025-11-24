/*
  # Create Industria Materiais Cliente Module (Fixed)
  
  1. Tables
    - `industria_materiais_cliente`
      - Vincula produtos internos a códigos/nomes específicos de clientes
      - Garante unicidade de produto por cliente na empresa
      - Garante unicidade de código do cliente (se preenchido)
      
  2. Security
    - RLS habilitado com políticas por operação
    - RPCs com security definer e search_path seguro
    
  3. RPCs
    - list: Listagem paginada com filtros
    - get: Detalhes do registro
    - upsert: Criação/Atualização com validação de produto
    - delete: Remoção lógica/física
*/

-- =========================
-- 1) Table + índices/constraints (ajustes de unicidade)
-- =========================

create table if not exists public.industria_materiais_cliente (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null default public.current_empresa_id(),
  cliente_id      uuid not null,                 -- pessoas.id (cliente)
  produto_id      uuid not null,                 -- produtos.id (catálogo interno)
  codigo_cliente  text,                          -- código que o cliente usa (opcional)
  nome_cliente    text,                          -- descrição como no cliente (opcional)
  unidade         text,                          -- ex: UN, KG, M
  ativo           boolean not null default true,
  observacoes     text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),

  constraint ind_matcli_empresa_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint ind_matcli_cliente_fkey
    foreign key (cliente_id) references public.pessoas(id),
  constraint ind_matcli_produto_fkey
    foreign key (produto_id) references public.produtos(id)
);

-- Remover constraint antiga se existir (limpeza de versões anteriores)
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'ind_matcli_empresa_cliente_produto_codigo_uk'
      and conrelid = 'public.industria_materiais_cliente'::regclass
  ) then
    alter table public.industria_materiais_cliente
      drop constraint ind_matcli_empresa_cliente_produto_codigo_uk;
  end if;
end;
$$;

-- Nova regra 1: 1:1 por (cliente, produto) na mesma empresa
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ind_matcli_emp_cli_prod_uk'
      and conrelid = 'public.industria_materiais_cliente'::regclass
  ) then
    alter table public.industria_materiais_cliente
      add constraint ind_matcli_emp_cli_prod_uk
      unique (empresa_id, cliente_id, produto_id);
  end if;
end;
$$;

-- Nova regra 2: código do cliente único por (empresa, cliente) quando preenchido
create unique index if not exists idx_ind_matcli_emp_cli_codigo_uk
  on public.industria_materiais_cliente (empresa_id, cliente_id, codigo_cliente)
  where codigo_cliente is not null;

-- Índices auxiliares
create index if not exists idx_ind_matcli_empresa
  on public.industria_materiais_cliente (empresa_id);

create index if not exists idx_ind_matcli_empresa_cliente
  on public.industria_materiais_cliente (empresa_id, cliente_id, ativo);

create index if not exists idx_ind_matcli_empresa_produto
  on public.industria_materiais_cliente (empresa_id, produto_id);

-- Trigger updated_at
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_industria_materiais_cliente'
      and tgrelid = 'public.industria_materiais_cliente'::regclass
  ) then
    create trigger handle_updated_at_industria_materiais_cliente
      before update on public.industria_materiais_cliente
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- =========================
-- 2) RLS por operação
-- =========================
alter table public.industria_materiais_cliente enable row level security;

drop policy if exists "ind_matcli_select" on public.industria_materiais_cliente;
drop policy if exists "ind_matcli_insert" on public.industria_materiais_cliente;
drop policy if exists "ind_matcli_update" on public.industria_materiais_cliente;
drop policy if exists "ind_matcli_delete" on public.industria_materiais_cliente;

create policy "ind_matcli_select"
  on public.industria_materiais_cliente
  for select
  using (empresa_id = public.current_empresa_id());

create policy "ind_matcli_insert"
  on public.industria_materiais_cliente
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "ind_matcli_update"
  on public.industria_materiais_cliente
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "ind_matcli_delete"
  on public.industria_materiais_cliente
  for delete
  using (empresa_id = public.current_empresa_id());

-- =========================
-- 3) RPCs
-- =========================

-- 3.1) Listagem
create or replace function public.industria_materiais_cliente_list(
  p_cliente_id uuid   default null,
  p_search     text   default null,
  p_ativo      boolean default true,
  p_limit      int    default 50,
  p_offset     int    default 0
)
returns table (
  id             uuid,
  cliente_id     uuid,
  cliente_nome   text,
  produto_id     uuid,
  produto_nome   text,
  codigo_cliente text,
  nome_cliente   text,
  unidade        text,
  ativo          boolean,
  total_count    bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  return query
  select
    mc.id,
    mc.cliente_id,
    cli.nome as cliente_nome,
    mc.produto_id,
    pr.nome  as produto_nome,
    mc.codigo_cliente,
    mc.nome_cliente,
    mc.unidade,
    mc.ativo,
    count(*) over() as total_count
  from public.industria_materiais_cliente mc
  join public.pessoas  cli on cli.id = mc.cliente_id
  join public.produtos pr  on pr.id  = mc.produto_id
  where mc.empresa_id = v_emp
    and (p_cliente_id is null or mc.cliente_id = p_cliente_id)
    and (p_ativo is null or mc.ativo = p_ativo)
    and (
      p_search is null
      or coalesce(mc.codigo_cliente,'') ilike '%'||p_search||'%'
      or coalesce(mc.nome_cliente,'')   ilike '%'||p_search||'%'
      or coalesce(pr.nome,'')           ilike '%'||p_search||'%'
    )
  order by
    mc.ativo desc,
    coalesce(mc.nome_cliente, pr.nome) asc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.industria_materiais_cliente_list from public;
grant  execute on function public.industria_materiais_cliente_list to authenticated, service_role;

-- 3.2) Detalhe
create or replace function public.industria_materiais_cliente_get(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_res jsonb;
begin
  select
    to_jsonb(mc.*)
    || jsonb_build_object(
         'cliente_nome', cli.nome,
         'produto_nome', pr.nome
       )
  into v_res
  from public.industria_materiais_cliente mc
  join public.pessoas  cli on cli.id = mc.cliente_id
  join public.produtos pr  on pr.id  = mc.produto_id
  where mc.id = p_id
    and mc.empresa_id = v_emp;

  return v_res;
end;
$$;

revoke all on function public.industria_materiais_cliente_get from public;
grant  execute on function public.industria_materiais_cliente_get to authenticated, service_role;

-- 3.3) Upsert (com validação adicional de produto por empresa quando aplicável)
create or replace function public.industria_materiais_cliente_upsert(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp   uuid := public.current_empresa_id();
  v_id    uuid;
  v_cli   uuid := (p_payload->>'cliente_id')::uuid;
  v_prod  uuid := (p_payload->>'produto_id')::uuid;
  v_cod   text := nullif(p_payload->>'codigo_cliente','');
  v_has_prod_emp boolean := false;
begin
  if v_cli is null then
    raise exception 'cliente_id é obrigatório.';
  end if;
  if v_prod is null then
    raise exception 'produto_id é obrigatório.';
  end if;

  -- valida existência básica
  if not exists (select 1 from public.pessoas  p  where p.id = v_cli) then
    raise exception 'Cliente não encontrado.';
  end if;
  if not exists (select 1 from public.produtos pr where pr.id = v_prod) then
    raise exception 'Produto não encontrado.';
  end if;

  -- reforço MT (somente se produtos tiver empresa_id)
  begin
    select true
      from public.produtos pr
     where pr.id = v_prod
       and pr.empresa_id = v_emp
     limit 1
    into v_has_prod_emp;
  exception
    when undefined_column then
      v_has_prod_emp := true; -- ambientes legados sem coluna empresa_id em produtos
  end;

  if not v_has_prod_emp then
    raise exception 'Produto não pertence à empresa atual.';
  end if;

  if p_payload->>'id' is not null then
    update public.industria_materiais_cliente mc
    set
      cliente_id     = v_cli,
      produto_id     = v_prod,
      codigo_cliente = v_cod,
      nome_cliente   = nullif(p_payload->>'nome_cliente',''),
      unidade        = nullif(p_payload->>'unidade',''),
      ativo          = coalesce((p_payload->>'ativo')::boolean, mc.ativo),
      observacoes    = p_payload->>'observacoes'
    where mc.id = (p_payload->>'id')::uuid
      and mc.empresa_id = v_emp
    returning mc.id into v_id;
  else
    insert into public.industria_materiais_cliente (
      empresa_id, cliente_id, produto_id, codigo_cliente, nome_cliente, unidade, ativo, observacoes
    ) values (
      v_emp, v_cli, v_prod,
      v_cod, nullif(p_payload->>'nome_cliente',''),
      nullif(p_payload->>'unidade',''),
      coalesce((p_payload->>'ativo')::boolean, true),
      p_payload->>'observacoes'
    )
    returning id into v_id;
  end if;

  perform pg_notify('app_log', '[RPC] industria_materiais_cliente_upsert: '||v_id);
  return public.industria_materiais_cliente_get(v_id);
end;
$$;

revoke all on function public.industria_materiais_cliente_upsert from public;
grant  execute on function public.industria_materiais_cliente_upsert to authenticated, service_role;

-- 3.4) Delete
create or replace function public.industria_materiais_cliente_delete(
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  delete from public.industria_materiais_cliente
  where id = p_id
    and empresa_id = v_emp;

  perform pg_notify('app_log', '[RPC] industria_materiais_cliente_delete: '||p_id);
end;
$$;

revoke all on function public.industria_materiais_cliente_delete from public;
grant  execute on function public.industria_materiais_cliente_delete to authenticated, service_role;
