-- Pricing tables + tiered pricing (atacado/varejo por quantidade)
-- "Estado da arte": multi-tenant, RLS + RPC-first (SECURITY DEFINER) e defaults seguros.

begin;

-- 1) Tabelas de preço (ex.: Varejo/Atacado)
create table if not exists public.tabelas_preco (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  slug text not null,
  nome text not null,
  status text not null default 'ativa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tabelas_preco_status_chk check (status in ('ativa','inativa')),
  constraint tabelas_preco_slug_chk check (char_length(slug) >= 2)
);

create unique index if not exists tabelas_preco_unq on public.tabelas_preco (empresa_id, slug);

alter table public.tabelas_preco enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='tabelas_preco'
  ) then
    create policy policy_select on public.tabelas_preco for select to authenticated
      using (empresa_id = public.current_empresa_id());
    create policy policy_insert on public.tabelas_preco for insert to authenticated
      with check (empresa_id = public.current_empresa_id());
    create policy policy_update on public.tabelas_preco for update to authenticated
      using (empresa_id = public.current_empresa_id())
      with check (empresa_id = public.current_empresa_id());
    create policy policy_delete on public.tabelas_preco for delete to authenticated
      using (empresa_id = public.current_empresa_id());
  end if;
end $$;

-- 2) Faixas de preço por quantidade (tier)
create table if not exists public.tabelas_preco_faixas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  tabela_preco_id uuid not null references public.tabelas_preco(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  min_qtd numeric(10,3) not null,
  max_qtd numeric(10,3),
  preco_unitario numeric(10,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tabelas_preco_faixas_min_chk check (min_qtd > 0),
  constraint tabelas_preco_faixas_max_chk check (max_qtd is null or max_qtd >= min_qtd),
  constraint tabelas_preco_faixas_preco_chk check (preco_unitario >= 0)
);

create index if not exists idx_tabelas_preco_faixas_empresa on public.tabelas_preco_faixas (empresa_id);
create index if not exists idx_tabelas_preco_faixas_lookup on public.tabelas_preco_faixas (empresa_id, tabela_preco_id, produto_id, min_qtd desc);
create unique index if not exists tabelas_preco_faixas_unq on public.tabelas_preco_faixas (empresa_id, tabela_preco_id, produto_id, min_qtd);

alter table public.tabelas_preco_faixas enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='tabelas_preco_faixas'
  ) then
    create policy policy_select on public.tabelas_preco_faixas for select to authenticated
      using (empresa_id = public.current_empresa_id());
    create policy policy_insert on public.tabelas_preco_faixas for insert to authenticated
      with check (empresa_id = public.current_empresa_id());
    create policy policy_update on public.tabelas_preco_faixas for update to authenticated
      using (empresa_id = public.current_empresa_id())
      with check (empresa_id = public.current_empresa_id());
    create policy policy_delete on public.tabelas_preco_faixas for delete to authenticated
      using (empresa_id = public.current_empresa_id());
  end if;
end $$;

-- 3) Vendas: link opcional da tabela de preço no pedido
alter table public.vendas_pedidos
  add column if not exists tabela_preco_id uuid;

alter table public.vendas_pedidos
  drop constraint if exists vendas_pedidos_tabela_preco_fkey;

alter table public.vendas_pedidos
  add constraint vendas_pedidos_tabela_preco_fkey
  foreign key (tabela_preco_id) references public.tabelas_preco(id) on delete set null;

create index if not exists idx_vendas_pedidos_tabela_preco on public.vendas_pedidos (empresa_id, tabela_preco_id);

-- 4) RPC helpers
create or replace function public._slugify_simple(p_text text)
returns text
language sql
immutable
set search_path to 'pg_catalog','public'
as $$
  select lower(regexp_replace(unaccent(coalesce(p_text,'')), '[^a-zA-Z0-9]+', '-', 'g'));
$$;

create or replace function public.tabelas_preco_ensure_defaults()
returns table(varejo_id uuid, atacado_id uuid)
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  insert into public.tabelas_preco (empresa_id, slug, nome, status)
  values (v_empresa, 'varejo', 'Varejo', 'ativa')
  on conflict (empresa_id, slug) do update set
    nome = excluded.nome,
    status = excluded.status,
    updated_at = now()
  returning id into varejo_id;

  insert into public.tabelas_preco (empresa_id, slug, nome, status)
  values (v_empresa, 'atacado', 'Atacado', 'ativa')
  on conflict (empresa_id, slug) do update set
    nome = excluded.nome,
    status = excluded.status,
    updated_at = now()
  returning id into atacado_id;

  return;
end;
$$;

create or replace function public.tabelas_preco_list_for_current_user(p_q text default null)
returns table(id uuid, slug text, nome text, status text, created_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  perform public.tabelas_preco_ensure_defaults();

  return query
  select t.id, t.slug, t.nome, t.status, t.created_at, t.updated_at
  from public.tabelas_preco t
  where t.empresa_id = v_empresa
    and (p_q is null or t.nome ilike '%'||p_q||'%' or t.slug ilike '%'||p_q||'%')
  order by case when t.slug='varejo' then 0 when t.slug='atacado' then 1 else 2 end, t.nome;
end;
$$;

create or replace function public.pricing_get_unit_price(
  p_produto_id uuid,
  p_quantidade numeric,
  p_tabela_preco_id uuid default null
)
returns table(
  preco_unitario numeric,
  tabela_preco_id uuid,
  fonte text,
  faixa_id uuid,
  min_qtd numeric,
  max_qtd numeric
)
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_tp uuid := p_tabela_preco_id;
  v_prod_preco numeric;
begin
  if p_produto_id is null then
    raise exception 'p_produto_id é obrigatório.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'p_quantidade deve ser > 0.';
  end if;

  if not exists (select 1 from public.produtos p where p.id = p_produto_id and p.empresa_id = v_empresa) then
    raise exception 'Produto não encontrado.';
  end if;

  -- default price table = varejo
  if v_tp is null then
    select varejo_id into v_tp from public.tabelas_preco_ensure_defaults();
  end if;

  -- tier lookup
  select
    f.preco_unitario,
    f.tabela_preco_id,
    'faixa'::text as fonte,
    f.id as faixa_id,
    f.min_qtd,
    f.max_qtd
  into preco_unitario, tabela_preco_id, fonte, faixa_id, min_qtd, max_qtd
  from public.tabelas_preco_faixas f
  where f.empresa_id = v_empresa
    and f.tabela_preco_id = v_tp
    and f.produto_id = p_produto_id
    and p_quantidade >= f.min_qtd
    and (f.max_qtd is null or p_quantidade <= f.max_qtd)
  order by f.min_qtd desc
  limit 1;

  if preco_unitario is not null then
    return;
  end if;

  select p.preco_venda into v_prod_preco
  from public.produtos p
  where p.id = p_produto_id and p.empresa_id = v_empresa;

  preco_unitario := coalesce(v_prod_preco, 0);
  tabela_preco_id := v_tp;
  fonte := 'produto'::text;
  faixa_id := null;
  min_qtd := null;
  max_qtd := null;
  return;
end;
$$;

commit;

