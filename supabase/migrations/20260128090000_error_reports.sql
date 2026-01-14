begin;

-- -----------------------------------------------------------------------------
-- ERROR REPORTS (Estado da Arte - Beta feedback/bugs)
-- -----------------------------------------------------------------------------

create table if not exists public.error_reports (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  created_by uuid not null default public.current_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  status text not null default 'new',
  severity text not null default 'error',

  user_email text null,
  user_message text not null,

  url text null,
  user_agent text null,

  sentry_event_id text not null,
  email_ok boolean not null default false,
  email_error text null,
  github_ok boolean not null default false,
  github_issue_url text null,
  github_error text null,

  context jsonb not null default '{}'::jsonb,
  recent_network_errors jsonb not null default '[]'::jsonb,

  resolved_at timestamptz null,
  resolved_by uuid null
);

comment on table public.error_reports is
  'Relatórios de erro enviados por usuários (Sentry event id + contexto sanitizado) para triagem durante o beta.';

create index if not exists idx_error_reports_empresa_created_at on public.error_reports (empresa_id, created_at desc);
create index if not exists idx_error_reports_empresa_status on public.error_reports (empresa_id, status);
create index if not exists idx_error_reports_sentry_event_id on public.error_reports (sentry_event_id);

alter table public.error_reports
  add constraint error_reports_status_chk
  check (status in ('new','triaged','in_progress','resolved','ignored'));

alter table public.error_reports
  add constraint error_reports_severity_chk
  check (severity in ('error','warning'));

-- -----------------------------------------------------------------------------
-- Triggers: updated_at + resolved metadata
-- -----------------------------------------------------------------------------
create or replace function public.error_reports_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists trg_error_reports_set_updated_at on public.error_reports;
create trigger trg_error_reports_set_updated_at
before update on public.error_reports
for each row execute function public.error_reports_set_updated_at();

create or replace function public.error_reports_set_resolved_meta()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'resolved' and (old.status is distinct from new.status) then
    new.resolved_at := now();
    new.resolved_by := public.current_user_id();
  end if;

  if new.status <> 'resolved' and old.status = 'resolved' then
    new.resolved_at := null;
    new.resolved_by := null;
  end if;

  return new;
end
$$;

drop trigger if exists trg_error_reports_set_resolved_meta on public.error_reports;
create trigger trg_error_reports_set_resolved_meta
before update on public.error_reports
for each row execute function public.error_reports_set_resolved_meta();

-- -----------------------------------------------------------------------------
-- RLS: usuários podem criar e ver os próprios; ops/admin podem ver e gerenciar
-- -----------------------------------------------------------------------------
alter table public.error_reports enable row level security;
alter table public.error_reports force row level security;

drop policy if exists error_reports_service_role_all on public.error_reports;
create policy error_reports_service_role_all
on public.error_reports
for all
to service_role
using (true)
with check (true);

drop policy if exists error_reports_select on public.error_reports;
create policy error_reports_select
on public.error_reports
for select
to authenticated
using (
  empresa_id = public.current_empresa_id()
  and (
    created_by = public.current_user_id()
    or public.has_permission_for_current_user('ops','view')
    or public.empresa_role_rank(public.current_empresa_role()) >= public.empresa_role_rank('admin')
  )
);

drop policy if exists error_reports_insert on public.error_reports;
create policy error_reports_insert
on public.error_reports
for insert
to authenticated
with check (
  empresa_id = public.current_empresa_id()
  and created_by = public.current_user_id()
);

drop policy if exists error_reports_update on public.error_reports;
create policy error_reports_update
on public.error_reports
for update
to authenticated
using (
  empresa_id = public.current_empresa_id()
  and (
    public.has_permission_for_current_user('ops','manage')
    or public.empresa_role_rank(public.current_empresa_role()) >= public.empresa_role_rank('admin')
  )
)
with check (
  empresa_id = public.current_empresa_id()
  and (
    public.has_permission_for_current_user('ops','manage')
    or public.empresa_role_rank(public.current_empresa_role()) >= public.empresa_role_rank('admin')
  )
);

drop policy if exists error_reports_delete on public.error_reports;
create policy error_reports_delete
on public.error_reports
for delete
to authenticated
using (
  empresa_id = public.current_empresa_id()
  and (
    public.has_permission_for_current_user('ops','manage')
    or public.empresa_role_rank(public.current_empresa_role()) >= public.empresa_role_rank('admin')
  )
);

grant select, insert, update, delete on table public.error_reports to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
commit;
