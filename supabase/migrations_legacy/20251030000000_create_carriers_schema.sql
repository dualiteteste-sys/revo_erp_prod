-- [MIGRATION] Schema: Transportadoras
-- Padrões do projeto: UUID, ON DELETE CASCADE, trigger updated_at, RLS por operação, search_path seguro em funções.

-- 0) Enum de status
create type public.status_transportadora as enum ('ativa', 'inativa');

-- 1) Tabela transportadoras
create table if not exists public.transportadoras (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresas(id) on delete cascade,
  nome_razao_social   text not null,
  nome_fantasia       text,
  cnpj                text,
  inscr_estadual      text,
  status              public.status_transportadora not null default 'ativa',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 1.1) Índices
create index if not exists idx_transportadoras_empresa_id on public.transportadoras (empresa_id);
create index if not exists idx_transportadoras_nome_trgm on public.transportadoras using gin (nome_razao_social gin_trgm_ops);
create unique index if not exists ux_transportadoras_empresa_cnpj on public.transportadoras (empresa_id, cnpj) where cnpj is not null;

-- 1.2) Trigger updated_at
drop trigger if exists tg_transportadoras_updated_at on public.transportadoras;
create trigger tg_transportadoras_updated_at
before update on public.transportadoras
for each row execute function public.tg_set_updated_at();

-- 1.3) RLS
alter table public.transportadoras enable row level security;

drop policy if exists transportadoras_sel on public.transportadoras;
drop policy if exists transportadoras_ins on public.transportadoras;
drop policy if exists transportadoras_upd on public.transportadoras;
drop policy if exists transportadoras_del on public.transportadoras;

create policy transportadoras_sel on public.transportadoras for select using ( public.is_user_member_of(empresa_id) );
create policy transportadoras_ins on public.transportadoras for insert with check ( public.is_user_member_of(empresa_id) );
create policy transportadoras_upd on public.transportadoras for update using ( public.is_user_member_of(empresa_id) ) with check ( public.is_user_member_of(empresa_id) );
create policy transportadoras_del on public.transportadoras for delete using ( public.is_user_member_of(empresa_id) );
