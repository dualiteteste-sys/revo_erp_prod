/*
  Base interna para emissão de NF-e (modelo 55), preparada para integração via provedor (NFE.io),
  porém com emissão controlada por feature-flag (desativada por padrão).

  - Cria tabelas:
    - empresa_feature_flags (flags manuais por empresa)
    - fiscal_nfe_emissao_configs (configuração do provedor por empresa, sem segredos)
    - fiscal_nfe_emissoes (rascunhos/status de NF-e)
  - Estende a view empresa_features para expor `nfe_emissao_enabled`
*/

-- ============================================================================
-- 1) Flags por empresa (controle de habilitação)
-- ============================================================================
create table if not exists public.empresa_feature_flags (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  nfe_emissao_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.empresa_feature_flags enable row level security;

drop policy if exists "Enable all access" on public.empresa_feature_flags;
create policy "Enable all access"
  on public.empresa_feature_flags
  for all
  to authenticated
  using (empresa_id = public.current_empresa_id());

grant all on table public.empresa_feature_flags to authenticated, service_role;

-- ============================================================================
-- 2) Configuração do provedor (sem segredos)
-- ============================================================================
create table if not exists public.fiscal_nfe_emissao_configs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  provider_slug text not null default 'NFE_IO',
  ambiente text not null default 'homologacao', -- homologacao | producao
  webhook_secret_hint text null, -- apenas dica/identificador (sem segredo)
  observacoes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiscal_nfe_emissao_configs_unique unique (empresa_id, provider_slug)
);

alter table public.fiscal_nfe_emissao_configs enable row level security;

drop policy if exists "Enable all access" on public.fiscal_nfe_emissao_configs;
create policy "Enable all access"
  on public.fiscal_nfe_emissao_configs
  for all
  to authenticated
  using (empresa_id = public.current_empresa_id());

grant all on table public.fiscal_nfe_emissao_configs to authenticated, service_role;

-- ============================================================================
-- 3) Emissões (rascunhos / status)
-- ============================================================================
create table if not exists public.fiscal_nfe_emissoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  provider_slug text not null default 'NFE_IO',
  provider_ref text null, -- id/uuid no provedor (quando habilitar integração)
  ambiente text not null default 'homologacao', -- homologacao | producao
  status text not null default 'rascunho', -- rascunho|enfileirada|processando|autorizada|rejeitada|cancelada|erro
  numero integer null,
  serie integer null,
  chave_acesso text null,
  destinatario_pessoa_id uuid null references public.pessoas(id),
  valor_total numeric null,
  payload jsonb not null default '{}'::jsonb,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiscal_nfe_emissoes_chave_unique unique (empresa_id, chave_acesso)
);

alter table public.fiscal_nfe_emissoes enable row level security;

drop policy if exists "Enable all access" on public.fiscal_nfe_emissoes;
create policy "Enable all access"
  on public.fiscal_nfe_emissoes
  for all
  to authenticated
  using (empresa_id = public.current_empresa_id());

grant all on table public.fiscal_nfe_emissoes to authenticated, service_role;

create index if not exists idx_fiscal_nfe_emissoes_empresa_status
  on public.fiscal_nfe_emissoes (empresa_id, status);

-- ============================================================================
-- 4) View empresa_features: adiciona nfe_emissao_enabled
-- ============================================================================
create or replace view public.empresa_features
with (security_invoker = true, security_barrier = true)
as
select
  e.id as empresa_id,
  exists (
    select 1
    from public.empresa_addons ea
    where ea.empresa_id = e.id
      and ea.addon_slug = 'REVO_SEND'
      and ea.status = any (array['active'::text, 'trialing'::text])
      and coalesce(ea.cancel_at_period_end, false) = false
  ) as revo_send_enabled,
  coalesce(ef.nfe_emissao_enabled, false) as nfe_emissao_enabled
from public.empresas e
left join public.empresa_feature_flags ef
  on ef.empresa_id = e.id
where exists (
  select 1
  from public.empresa_usuarios eu
  where eu.empresa_id = e.id
    and eu.user_id = public.current_user_id()
);

grant select on public.empresa_features to authenticated;

select pg_notify('pgrst', 'reload schema');

