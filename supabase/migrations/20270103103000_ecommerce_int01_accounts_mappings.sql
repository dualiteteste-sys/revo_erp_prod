/*
  INT-01: Modelo canônico (accounts + mappings)

  Objetivo:
  - Permitir múltiplas contas/lojas por provider (futuro), mantendo 1 conexão por provider no MVP.
  - Criar base de mapeamentos externo ↔ interno para pedidos/expedições (produtos já têm `produto_anuncios`).
*/

BEGIN;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1) Accounts (lojas/contas do canal)
-- -----------------------------------------------------------------------------
create table if not exists public.ecommerce_accounts (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  ecommerce_id uuid not null references public.ecommerces(id) on delete cascade,
  provider text not null,
  external_account_id text not null,
  nome text null,
  meta jsonb not null default '{}'::jsonb,
  connected_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ecommerce_accounts_provider_check check (provider in ('meli','shopee','custom')),
  constraint ecommerce_accounts_unique unique (ecommerce_id, external_account_id)
);

alter table public.ecommerce_accounts enable row level security;

drop trigger if exists tg_ecommerce_accounts_updated_at on public.ecommerce_accounts;
create trigger tg_ecommerce_accounts_updated_at
before update on public.ecommerce_accounts
for each row execute function public.tg_set_updated_at();

drop policy if exists ecommerce_accounts_select on public.ecommerce_accounts;
create policy ecommerce_accounts_select
  on public.ecommerce_accounts
  for select
  to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and public.has_permission_for_current_user('ecommerce','view')
  );

drop policy if exists ecommerce_accounts_write_service_role on public.ecommerce_accounts;
create policy ecommerce_accounts_write_service_role
  on public.ecommerce_accounts
  for all
  to service_role
  using (true)
  with check (true);

grant select on table public.ecommerce_accounts to authenticated, service_role;
grant insert, update, delete on table public.ecommerce_accounts to service_role;

create index if not exists idx_ecommerce_accounts_empresa
  on public.ecommerce_accounts (empresa_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 2) Orders mapping (externo ↔ vendas_pedidos)
-- -----------------------------------------------------------------------------
create table if not exists public.ecommerce_order_links (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  ecommerce_id uuid not null references public.ecommerces(id) on delete cascade,
  provider text not null,
  external_order_id text not null,
  vendas_pedido_id uuid null references public.vendas_pedidos(id) on delete set null,
  status text null,
  payload jsonb not null default '{}'::jsonb,
  imported_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ecommerce_order_links_provider_check check (provider in ('meli','shopee','custom')),
  constraint ecommerce_order_links_unique unique (ecommerce_id, external_order_id)
);

alter table public.ecommerce_order_links enable row level security;

drop trigger if exists tg_ecommerce_order_links_updated_at on public.ecommerce_order_links;
create trigger tg_ecommerce_order_links_updated_at
before update on public.ecommerce_order_links
for each row execute function public.tg_set_updated_at();

drop policy if exists ecommerce_order_links_select on public.ecommerce_order_links;
create policy ecommerce_order_links_select
  on public.ecommerce_order_links
  for select
  to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and public.has_permission_for_current_user('ecommerce','view')
  );

drop policy if exists ecommerce_order_links_write_service_role on public.ecommerce_order_links;
create policy ecommerce_order_links_write_service_role
  on public.ecommerce_order_links
  for all
  to service_role
  using (true)
  with check (true);

grant select on table public.ecommerce_order_links to authenticated, service_role;
grant insert, update, delete on table public.ecommerce_order_links to service_role;

create index if not exists idx_ecommerce_order_links_empresa
  on public.ecommerce_order_links (empresa_id, created_at desc);

create index if not exists idx_ecommerce_order_links_order
  on public.ecommerce_order_links (provider, external_order_id);

-- -----------------------------------------------------------------------------
-- 3) Shipments mapping (externo ↔ vendas_expedicoes)
-- -----------------------------------------------------------------------------
create table if not exists public.ecommerce_shipment_links (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  ecommerce_id uuid not null references public.ecommerces(id) on delete cascade,
  provider text not null,
  external_shipment_id text not null,
  expedicao_id uuid null references public.vendas_expedicoes(id) on delete set null,
  status text null,
  tracking_code text null,
  payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ecommerce_shipment_links_provider_check check (provider in ('meli','shopee','custom')),
  constraint ecommerce_shipment_links_unique unique (ecommerce_id, external_shipment_id)
);

alter table public.ecommerce_shipment_links enable row level security;

drop trigger if exists tg_ecommerce_shipment_links_updated_at on public.ecommerce_shipment_links;
create trigger tg_ecommerce_shipment_links_updated_at
before update on public.ecommerce_shipment_links
for each row execute function public.tg_set_updated_at();

drop policy if exists ecommerce_shipment_links_select on public.ecommerce_shipment_links;
create policy ecommerce_shipment_links_select
  on public.ecommerce_shipment_links
  for select
  to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and public.has_permission_for_current_user('ecommerce','view')
  );

drop policy if exists ecommerce_shipment_links_write_service_role on public.ecommerce_shipment_links;
create policy ecommerce_shipment_links_write_service_role
  on public.ecommerce_shipment_links
  for all
  to service_role
  using (true)
  with check (true);

grant select on table public.ecommerce_shipment_links to authenticated, service_role;
grant insert, update, delete on table public.ecommerce_shipment_links to service_role;

create index if not exists idx_ecommerce_shipment_links_empresa
  on public.ecommerce_shipment_links (empresa_id, created_at desc);

create index if not exists idx_ecommerce_shipment_links_tracking
  on public.ecommerce_shipment_links (provider, tracking_code);

select pg_notify('pgrst','reload schema');

COMMIT;

