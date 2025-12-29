/*
  NFE-08: Observabilidade fiscal

  - Auditoria por NF (timeline unificada)
  - Histórico de status/erro (tentativas e falhas)
  - Views com payloads (saneados na origem / Edge Functions)
*/

BEGIN;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Histórico de status/erro da emissão
-- ---------------------------------------------------------------------------

create table if not exists public.fiscal_nfe_status_history (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  emissao_id uuid not null references public.fiscal_nfe_emissoes(id) on delete cascade,
  old_status text null,
  new_status text null,
  old_error text null,
  new_error text null,
  changed_by uuid null,
  changed_at timestamptz not null default now()
);

alter table public.fiscal_nfe_status_history enable row level security;

drop policy if exists fiscal_nfe_status_history_select on public.fiscal_nfe_status_history;
create policy fiscal_nfe_status_history_select
  on public.fiscal_nfe_status_history
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists fiscal_nfe_status_history_write_service_role on public.fiscal_nfe_status_history;
create policy fiscal_nfe_status_history_write_service_role
  on public.fiscal_nfe_status_history
  for all
  to service_role
  using (true)
  with check (true);

grant select on table public.fiscal_nfe_status_history to authenticated, service_role;
grant insert, update, delete on table public.fiscal_nfe_status_history to service_role;

create index if not exists idx_fiscal_nfe_status_history_empresa_emissao
  on public.fiscal_nfe_status_history (empresa_id, emissao_id, changed_at desc);

-- Trigger function: registra mudanças relevantes (status/last_error)
create or replace function public.tg_fiscal_nfe_status_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
begin
  if (tg_op <> 'UPDATE') then
    return new;
  end if;

  if (coalesce(old.status, '') = coalesce(new.status, '')
      and coalesce(old.last_error, '') = coalesce(new.last_error, '')) then
    return new;
  end if;

  begin
    actor := auth.uid();
  exception when others then
    actor := null;
  end;

  insert into public.fiscal_nfe_status_history (
    empresa_id,
    emissao_id,
    old_status,
    new_status,
    old_error,
    new_error,
    changed_by,
    changed_at
  ) values (
    new.empresa_id,
    new.id,
    old.status,
    new.status,
    left(coalesce(old.last_error, ''), 900),
    left(coalesce(new.last_error, ''), 900),
    actor,
    now()
  );

  return new;
end;
$$;

drop trigger if exists tg_fiscal_nfe_emissoes_status_history on public.fiscal_nfe_emissoes;
create trigger tg_fiscal_nfe_emissoes_status_history
after update on public.fiscal_nfe_emissoes
for each row execute function public.tg_fiscal_nfe_status_history();

-- ---------------------------------------------------------------------------
-- 2) Timeline unificada por emissão
-- ---------------------------------------------------------------------------

create or replace view public.fiscal_nfe_audit_timeline
with (security_invoker = true, security_barrier = true)
as
select
  h.empresa_id,
  h.emissao_id,
  'status'::text as kind,
  h.changed_at as occurred_at,
  case
    when coalesce(h.old_status, '') <> coalesce(h.new_status, '') then
      concat('Status: ', coalesce(h.old_status, '—'), ' → ', coalesce(h.new_status, '—'))
    else
      'Erro atualizado'
  end as message,
  jsonb_build_object(
    'old_status', h.old_status,
    'new_status', h.new_status,
    'old_error', nullif(h.old_error, ''),
    'new_error', nullif(h.new_error, ''),
    'changed_by', h.changed_by
  ) as payload,
  'db'::text as source
from public.fiscal_nfe_status_history h

union all

select
  e.empresa_id,
  e.emissao_id,
  'provider_event'::text as kind,
  e.created_at as occurred_at,
  concat('NFE.io ', e.event_type, ' — ', e.status) as message,
  jsonb_build_object(
    'event_type', e.event_type,
    'status', e.status,
    'http_status', e.http_status,
    'error_message', e.error_message,
    'request', e.request_payload,
    'response', e.response_payload
  ) as payload,
  'edge'::text as source
from public.fiscal_nfe_provider_events e

union all

select
  l.empresa_id,
  l.emissao_id,
  'provider_log'::text as kind,
  l.created_at as occurred_at,
  concat('LOG ', l.level, ' — ', l.message) as message,
  l.payload as payload,
  'edge'::text as source
from public.fiscal_nfe_provider_logs l

union all

select
  w.empresa_id,
  (select fe.emissao_id from public.fiscal_nfe_nfeio_emissoes fe where fe.nfeio_id = w.nfeio_id limit 1) as emissao_id,
  'webhook'::text as kind,
  w.received_at as occurred_at,
  concat('Webhook ', coalesce(w.event_type, 'event')) as message,
  jsonb_build_object(
    'event_type', w.event_type,
    'nfeio_id', w.nfeio_id,
    'attempts', w.process_attempts,
    'next_retry_at', w.next_retry_at,
    'last_error', w.last_error,
    'payload', w.payload
  ) as payload,
  'nfeio'::text as source
from public.fiscal_nfe_webhook_events w;

select pg_notify('pgrst', 'reload schema');

COMMIT;

