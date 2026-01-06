/*
  FINOPS-01 (P1) Telemetria de custo/volume por empresa (jobs, webhooks, filas)

  Motivo
  - Em produção, o custo operacional vem principalmente de integrações: webhooks, jobs/filas e workers.
  - Precisamos ter visibilidade por empresa (volume) para calibrar limites, diagnosticar clientes "pesados" e reduzir suporte.

  O que muda
  - Cria `public.finops_usage_daily` (agregação diária por empresa/source/event).
  - Cria RPC `public.finops_track_usage(...)` (somente service_role) para Edge Functions registrarem consumo.
  - Cria RPC `public.finops_usage_summary(...)` (somente leitura) para exibir/inspecionar consumo (restrito via permissão ops:manage).

  Impacto
  - Apenas dados de telemetria agregada (contadores). Não afeta lógica de negócio.

  Reversibilidade
  - Reverter = dropar tabela e funções (telemetria some, sem impacto em dados core).
*/

begin;

create table if not exists public.finops_usage_daily (
  day date not null default (now() at time zone 'utc')::date,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  source text not null,
  event text not null,
  count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, empresa_id, source, event)
);

alter table public.finops_usage_daily enable row level security;

drop policy if exists finops_usage_daily_select on public.finops_usage_daily;
create policy finops_usage_daily_select
  on public.finops_usage_daily
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists finops_usage_daily_write_service_role on public.finops_usage_daily;
create policy finops_usage_daily_write_service_role
  on public.finops_usage_daily
  for all
  to service_role
  using (true)
  with check (true);

grant select on table public.finops_usage_daily to authenticated, service_role;
grant insert, update, delete on table public.finops_usage_daily to service_role;

create index if not exists idx_finops_usage_daily_empresa_day
  on public.finops_usage_daily (empresa_id, day desc);

-- -----------------------------------------------------------------------------
-- RPC: registrar consumo (somente service_role)
-- -----------------------------------------------------------------------------
drop function if exists public.finops_track_usage(uuid, text, text, int);
create function public.finops_track_usage(
  p_empresa_id uuid,
  p_source text,
  p_event text,
  p_count int default 1
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source text := nullif(trim(coalesce(p_source,'')), '');
  v_event  text := nullif(trim(coalesce(p_event,'')), '');
  v_count  int := greatest(coalesce(p_count, 0), 0);
begin
  if p_empresa_id is null or v_source is null or v_event is null or v_count = 0 then
    return;
  end if;

  insert into public.finops_usage_daily(day, empresa_id, source, event, count, updated_at)
  values ((now() at time zone 'utc')::date, p_empresa_id, v_source, v_event, v_count, now())
  on conflict (day, empresa_id, source, event)
  do update
    set count = public.finops_usage_daily.count + excluded.count,
        updated_at = now();
end;
$$;

revoke all on function public.finops_track_usage(uuid, text, text, int) from public;
grant execute on function public.finops_track_usage(uuid, text, text, int) to service_role;

-- -----------------------------------------------------------------------------
-- RPC: resumo (somente leitura, restrito a ops:manage)
-- -----------------------------------------------------------------------------
drop function if exists public.finops_usage_summary(int);
create function public.finops_usage_summary(p_days int default 30)
returns table (
  day date,
  source text,
  event text,
  count int
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.require_permission_for_current_user('ops','manage');

  return query
  select
    f.day,
    f.source,
    f.event,
    f.count
  from public.finops_usage_daily f
  where f.empresa_id = public.current_empresa_id()
    and f.day >= ((now() at time zone 'utc')::date - greatest(coalesce(p_days, 30), 1) + 1)
  order by f.day desc, f.source asc, f.event asc;
end;
$$;

revoke all on function public.finops_usage_summary(int) from public;
grant execute on function public.finops_usage_summary(int) to authenticated, service_role;

commit;
