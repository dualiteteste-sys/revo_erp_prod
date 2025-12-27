/*
  Billing (foundation): plans + subscriptions

  Problema em PROD após reset:
  - Frontend consulta `public.subscriptions` (SubscriptionProvider) e falha com 404.
  - Precisamos garantir que o schema mínimo de billing exista em banco limpo.

  Notas:
  - Leitura de `plans` deve ser pública (landing/pricing).
  - `subscriptions` deve ser visível apenas para membros da empresa (RLS).
  - Escrita em `subscriptions` normalmente é feita por automação/service_role (webhooks).
*/

BEGIN;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- plans (catálogo público)
-- ---------------------------------------------------------------------------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  billing_cycle text not null,
  currency text not null default 'BRL',
  amount_cents integer not null,
  stripe_price_id text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint plans_slug_check check (slug in ('START','PRO','MAX','ULTRA')),
  constraint plans_billing_cycle_check check (billing_cycle in ('monthly','yearly'))
);

alter table public.plans enable row level security;

drop policy if exists plans_public_select on public.plans;
create policy plans_public_select
  on public.plans
  for select
  to public
  using (active = true);

-- impedir mutações pelo cliente (somente service_role)
drop policy if exists plans_write_service_role on public.plans;
create policy plans_write_service_role
  on public.plans
  for all
  to service_role
  using (true)
  with check (true);

grant select on table public.plans to anon, authenticated, service_role;
grant insert, update, delete on table public.plans to service_role;

-- ---------------------------------------------------------------------------
-- subscriptions (por empresa)
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  status text not null,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan_slug text,
  billing_cycle text,
  cancel_at_period_end boolean not null default false,
  constraint subscriptions_empresa_unique unique (empresa_id),
  constraint subscriptions_status_check check (status in (
    'trialing','active','past_due','canceled','unpaid','incomplete','incomplete_expired'
  )),
  constraint subscriptions_billing_cycle_check check (billing_cycle is null or billing_cycle in ('monthly','yearly'))
);

alter table public.subscriptions enable row level security;

drop trigger if exists tg_subscriptions_updated_at on public.subscriptions;
create trigger tg_subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.tg_set_updated_at();

drop policy if exists subscriptions_select_by_membership on public.subscriptions;
create policy subscriptions_select_by_membership
  on public.subscriptions
  for select
  to authenticated
  using (public.is_user_member_of(empresa_id));

-- Escrita apenas por service_role (webhooks/automação)
drop policy if exists subscriptions_write_service_role on public.subscriptions;
create policy subscriptions_write_service_role
  on public.subscriptions
  for all
  to service_role
  using (true)
  with check (true);

grant select on table public.subscriptions to authenticated, service_role;
grant insert, update, delete on table public.subscriptions to service_role;

select pg_notify('pgrst','reload schema');

COMMIT;

