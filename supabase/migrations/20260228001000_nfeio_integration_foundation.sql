/*
  NFE-05: Integração NFE.io (emissão + consulta + persistência)

  Objetivo:
  - Registrar vínculo entre rascunho (fiscal_nfe_emissoes) e a NF na NFE.io
  - Guardar payload/response + status + logs técnicos
  - Armazenar XML/DANFE no Storage (bucket privado), sem expor segredos no DB

  Observações:
  - Tokens/segredos (NFEIO_API_KEY, webhook secret) ficam em secrets/Edge Functions.
*/

BEGIN;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Tabela: emissões na NFE.io
-- ---------------------------------------------------------------------------

create table if not exists public.fiscal_nfe_nfeio_emissoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  emissao_id uuid not null references public.fiscal_nfe_emissoes(id) on delete cascade,
  ambiente text not null default 'homologacao',
  nfeio_id text null,
  idempotency_key text null,
  provider_status text null,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz null,
  xml_storage_path text null,
  danfe_storage_path text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiscal_nfe_nfeio_ambiente_check check (ambiente in ('homologacao','producao')),
  constraint fiscal_nfe_nfeio_emissao_unique unique (emissao_id),
  constraint fiscal_nfe_nfeio_id_unique unique (nfeio_id)
);

alter table public.fiscal_nfe_nfeio_emissoes enable row level security;

drop trigger if exists tg_fiscal_nfe_nfeio_emissoes_updated_at on public.fiscal_nfe_nfeio_emissoes;
create trigger tg_fiscal_nfe_nfeio_emissoes_updated_at
before update on public.fiscal_nfe_nfeio_emissoes
for each row execute function public.tg_set_updated_at();

drop policy if exists fiscal_nfe_nfeio_emissoes_select on public.fiscal_nfe_nfeio_emissoes;
create policy fiscal_nfe_nfeio_emissoes_select
  on public.fiscal_nfe_nfeio_emissoes
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- Escrita via Edge Function (service_role)
drop policy if exists fiscal_nfe_nfeio_emissoes_write_service_role on public.fiscal_nfe_nfeio_emissoes;
create policy fiscal_nfe_nfeio_emissoes_write_service_role
  on public.fiscal_nfe_nfeio_emissoes
  for all
  to service_role
  using (true)
  with check (true);

grant select on table public.fiscal_nfe_nfeio_emissoes to authenticated, service_role;
grant insert, update, delete on table public.fiscal_nfe_nfeio_emissoes to service_role;

create index if not exists idx_fiscal_nfe_nfeio_empresa_emissao
  on public.fiscal_nfe_nfeio_emissoes (empresa_id, emissao_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2) Logs técnicos (para auditoria/debug)
-- ---------------------------------------------------------------------------

create table if not exists public.fiscal_nfe_provider_logs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  emissao_id uuid null references public.fiscal_nfe_emissoes(id) on delete set null,
  provider text not null default 'nfeio',
  level text not null default 'info',
  message text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint fiscal_nfe_provider_logs_level_check check (level in ('debug','info','warn','error'))
);

alter table public.fiscal_nfe_provider_logs enable row level security;

drop policy if exists fiscal_nfe_provider_logs_select on public.fiscal_nfe_provider_logs;
create policy fiscal_nfe_provider_logs_select
  on public.fiscal_nfe_provider_logs
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists fiscal_nfe_provider_logs_write_service_role on public.fiscal_nfe_provider_logs;
create policy fiscal_nfe_provider_logs_write_service_role
  on public.fiscal_nfe_provider_logs
  for all
  to service_role
  using (true)
  with check (true);

grant select on table public.fiscal_nfe_provider_logs to authenticated, service_role;
grant insert, update, delete on table public.fiscal_nfe_provider_logs to service_role;

create index if not exists idx_fiscal_nfe_provider_logs_empresa_emissao
  on public.fiscal_nfe_provider_logs (empresa_id, emissao_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3) Storage bucket para XML/DANFE (privado)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('nfe_docs', 'nfe_docs', false)
on conflict (id) do nothing;

-- Policies storage.objects
-- Path: {empresa_id}/{emissao_id}/...

drop policy if exists "NFE Docs: read by membership" on storage.objects;
create policy "NFE Docs: read by membership"
on storage.objects for select
to authenticated
using (
  bucket_id = 'nfe_docs'
  and (storage.foldername(name))[1] in (
    select e.id::text
    from public.empresas e
    where exists (
      select 1
      from public.empresa_usuarios eu
      where eu.empresa_id = e.id
        and eu.user_id = auth.uid()
        and eu.status::text in ('ACTIVE','PENDING')
    )
  )
);

-- Escrita via service_role (Edge Functions)
drop policy if exists "NFE Docs: write by service_role" on storage.objects;
create policy "NFE Docs: write by service_role"
on storage.objects for all
to service_role
using (true)
with check (true);

select pg_notify('pgrst', 'reload schema');

COMMIT;

