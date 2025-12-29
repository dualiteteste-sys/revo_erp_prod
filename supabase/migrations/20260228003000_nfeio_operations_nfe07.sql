/*
  NFE-07: Operações fiscais essenciais (NFE.io)

  - Cancelamento (DELETE invoice)
  - Carta de correção (PUT correctionletter)
  - Inutilização (POST disablement)
  - Reimpressão DANFE / docs via endpoints (GET pdf/xml)

  Requer:
  - nfeio_company_id configurado por empresa (sem segredo)
*/

BEGIN;

-- Config do provedor (sem segredo): companyId da NFE.io
alter table public.fiscal_nfe_emissao_configs
  add column if not exists nfeio_company_id text null;

-- Guardar paths dos docs de CC-e (PDF/XML) no vínculo com a NFE.io
alter table public.fiscal_nfe_nfeio_emissoes
  add column if not exists cce_pdf_storage_path text null,
  add column if not exists cce_xml_storage_path text null;

-- Tabela de eventos/ações disparadas no provedor
create table if not exists public.fiscal_nfe_provider_events (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  emissao_id uuid null references public.fiscal_nfe_emissoes(id) on delete set null,
  provider text not null default 'nfeio',
  event_type text not null, -- cancel|cce|disablement_numbers|disablement_invoice|fetch_pdf|fetch_cce_pdf|fetch_cce_xml
  status text not null default 'requested', -- requested|ok|error
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  http_status int null,
  error_message text null,
  created_at timestamptz not null default now()
);

alter table public.fiscal_nfe_provider_events enable row level security;

drop policy if exists fiscal_nfe_provider_events_select on public.fiscal_nfe_provider_events;
create policy fiscal_nfe_provider_events_select
  on public.fiscal_nfe_provider_events
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists fiscal_nfe_provider_events_write_service_role on public.fiscal_nfe_provider_events;
create policy fiscal_nfe_provider_events_write_service_role
  on public.fiscal_nfe_provider_events
  for all
  to service_role
  using (true)
  with check (true);

grant select on table public.fiscal_nfe_provider_events to authenticated, service_role;
grant insert, update, delete on table public.fiscal_nfe_provider_events to service_role;

create index if not exists idx_fiscal_nfe_provider_events_empresa_emissao
  on public.fiscal_nfe_provider_events (empresa_id, emissao_id, created_at desc);

select pg_notify('pgrst', 'reload schema');

COMMIT;

