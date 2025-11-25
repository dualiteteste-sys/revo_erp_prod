/*
  # Indústria – Tabelas auxiliares da Ordem de Beneficiamento
  - industria_ordem_componentes: insumos/componentes vinculados à OB
  - industria_ordem_entregas: registros de entregas/retiradas da OB

  Segurança:
  - RLS por operação usando public.current_empresa_id()
  - SECURITY DEFINER não necessário (apenas tabelas)
  Compatibilidade:
  - create if not exists + checks básicos
  Reversibilidade:
  - Objetos isolados; basta drop em rollback
*/

set search_path = pg_catalog, public;

-- =====================================================
-- 1) Tabela: industria_ordem_componentes
-- =====================================================
create table if not exists public.industria_ordem_componentes (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null default public.current_empresa_id(),
  ordem_id      uuid not null,              -- FK para industria_benef_ordens
  produto_id    uuid not null,              -- FK para produtos (insumo)
  quantidade    numeric(18,4) not null check (quantidade > 0),
  unidade       text,                       -- ex: UN, KG, M
  observacoes   text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),

  constraint ind_ord_comp_empresa_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,

  constraint ind_ord_comp_ordem_fkey
    foreign key (ordem_id) references public.industria_benef_ordens(id) on delete cascade,

  constraint ind_ord_comp_produto_fkey
    foreign key (produto_id) references public.produtos(id)
);

-- Índices
create index if not exists idx_ind_ord_comp_emp_ordem
  on public.industria_ordem_componentes (empresa_id, ordem_id);

create index if not exists idx_ind_ord_comp_emp_produto
  on public.industria_ordem_componentes (empresa_id, produto_id);

-- Trigger updated_at
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_industria_ordem_componentes'
      and tgrelid = 'public.industria_ordem_componentes'::regclass
  ) then
    create trigger handle_updated_at_industria_ordem_componentes
      before update on public.industria_ordem_componentes
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- RLS
alter table public.industria_ordem_componentes enable row level security;

drop policy if exists "ind_ord_comp_select" on public.industria_ordem_componentes;
drop policy if exists "ind_ord_comp_insert" on public.industria_ordem_componentes;
drop policy if exists "ind_ord_comp_update" on public.industria_ordem_componentes;
drop policy if exists "ind_ord_comp_delete" on public.industria_ordem_componentes;

create policy "ind_ord_comp_select"
  on public.industria_ordem_componentes
  for select
  using (empresa_id = public.current_empresa_id());

create policy "ind_ord_comp_insert"
  on public.industria_ordem_componentes
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "ind_ord_comp_update"
  on public.industria_ordem_componentes
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "ind_ord_comp_delete"
  on public.industria_ordem_componentes
  for delete
  using (empresa_id = public.current_empresa_id());

-- =====================================================
-- 2) Tabela: industria_ordem_entregas
-- =====================================================
create table if not exists public.industria_ordem_entregas (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null default public.current_empresa_id(),
  ordem_id            uuid not null,            -- FK para industria_benef_ordens
  data_entrega        timestamptz default now(),
  quantidade_entregue numeric(18,4) check (quantidade_entregue >= 0),
  documento_ref       text,
  observacoes         text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),

  constraint ind_ord_ent_empresa_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,

  constraint ind_ord_ent_ordem_fkey
    foreign key (ordem_id) references public.industria_benef_ordens(id) on delete cascade
);

-- Índices
create index if not exists idx_ind_ord_ent_emp_ordem
  on public.industria_ordem_entregas (empresa_id, ordem_id);

create index if not exists idx_ind_ord_ent_emp_data
  on public.industria_ordem_entregas (empresa_id, data_entrega);

-- Trigger updated_at
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_industria_ordem_entregas'
      and tgrelid = 'public.industria_ordem_entregas'::regclass
  ) then
    create trigger handle_updated_at_industria_ordem_entregas
      before update on public.industria_ordem_entregas
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- RLS
alter table public.industria_ordem_entregas enable row level security;

drop policy if exists "ind_ord_ent_select" on public.industria_ordem_entregas;
drop policy if exists "ind_ord_ent_insert" on public.industria_ordem_entregas;
drop policy if exists "ind_ord_ent_update" on public.industria_ordem_entregas;
drop policy if exists "ind_ord_ent_delete" on public.industria_ordem_entregas;

create policy "ind_ord_ent_select"
  on public.industria_ordem_entregas
  for select
  using (empresa_id = public.current_empresa_id());

create policy "ind_ord_ent_insert"
  on public.industria_ordem_entregas
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "ind_ord_ent_update"
  on public.industria_ordem_entregas
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "ind_ord_ent_delete"
  on public.industria_ordem_entregas
  for delete
  using (empresa_id = public.current_empresa_id());

-- =====================================================
-- 3) Opcional: recarregar cache do PostgREST
-- =====================================================
notify pgrst, 'reload schema';
