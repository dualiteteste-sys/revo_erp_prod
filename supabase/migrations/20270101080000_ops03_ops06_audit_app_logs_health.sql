/*
  OPS-03/04/05/06
  - OPS-03: Auditoria por entidade (habilitar audit_logs_trigger em tabelas críticas)
  - OPS-04: Logs estruturados (app_logs + RPC para registrar)
  - OPS-05: Reprocessamento seguro (RPC para re-enfileirar webhooks NFE.io)
  - OPS-06: Monitor de saúde (RPCs de resumo + lista de falhas recentes)
*/

begin;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Permissions: ops (view/manage) e logs (create)
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.permissions') is null or to_regclass('public.roles') is null or to_regclass('public.role_permissions') is null then
    return;
  end if;

  insert into public.permissions(module, action) values
    ('ops','view'),
    ('ops','manage'),
    ('logs','create')
  on conflict (module, action) do nothing;

  insert into public.role_permissions(role_id, permission_id, allow)
  select r.id, p.id, true
  from public.roles r
  join public.permissions p
    on (
      (p.module='ops' and p.action in ('view','manage'))
      or (p.module='logs' and p.action='create')
    )
  where r.slug in ('OWNER','ADMIN')
  on conflict do nothing;

  -- OPS role: pode visualizar saúde; reprocessamento fica restrito a OWNER/ADMIN
  insert into public.role_permissions(role_id, permission_id, allow)
  select r.id, p.id, true
  from public.roles r
  join public.permissions p on (p.module='ops' and p.action='view')
  where r.slug = 'OPS'
  on conflict do nothing;
end;
$$;

-- -----------------------------------------------------------------------------
-- OPS-04: public.app_logs + RPC public.log_app_event
-- -----------------------------------------------------------------------------
create table if not exists public.app_logs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  level text not null check (level in ('info','warn','error')),
  source text not null default 'ui',
  event text not null default 'log',
  message text not null,
  context jsonb not null default '{}'::jsonb,
  actor_id uuid null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.app_logs enable row level security;

drop policy if exists app_logs_select on public.app_logs;
create policy app_logs_select
  on public.app_logs
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists app_logs_insert_deny on public.app_logs;
create policy app_logs_insert_deny
  on public.app_logs
  for insert
  to authenticated
  with check (false);

drop policy if exists app_logs_update_deny on public.app_logs;
create policy app_logs_update_deny
  on public.app_logs
  for update
  to authenticated
  using (false);

drop policy if exists app_logs_delete_deny on public.app_logs;
create policy app_logs_delete_deny
  on public.app_logs
  for delete
  to authenticated
  using (false);

create index if not exists idx_app_logs_empresa_created_at on public.app_logs(empresa_id, created_at desc);
create index if not exists idx_app_logs_empresa_level_created_at on public.app_logs(empresa_id, level, created_at desc);

drop function if exists public.log_app_event(text, text, text, jsonb, text);
create function public.log_app_event(
  p_level text,
  p_event text,
  p_message text,
  p_context jsonb default null,
  p_source text default 'ui'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_level text := lower(coalesce(p_level, 'info'));
  v_event text := coalesce(nullif(btrim(p_event),''), 'log');
  v_source text := coalesce(nullif(btrim(p_source),''), 'ui');
  v_message text := coalesce(nullif(btrim(p_message),''), '—');
  v_id uuid;
begin
  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode = '42501';
  end if;

  if v_level not in ('info','warn','error') then
    v_level := 'info';
  end if;

  -- limites para evitar payload gigante
  if length(v_event) > 80 then v_event := left(v_event, 80); end if;
  if length(v_source) > 40 then v_source := left(v_source, 40); end if;
  if length(v_message) > 2000 then v_message := left(v_message, 2000); end if;

  insert into public.app_logs (
    empresa_id, level, source, event, message, context, actor_id
  ) values (
    v_empresa, v_level, v_source, v_event, v_message, coalesce(p_context, '{}'::jsonb), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.log_app_event(text, text, text, jsonb, text) from public;
grant execute on function public.log_app_event(text, text, text, jsonb, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- OPS-03: Auditoria por entidade (habilita audit_logs_trigger em tabelas críticas)
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.audit_logs') is null or to_regprocedure('public.process_audit_log()') is null then
    raise notice 'OPS-03: audit_logs/process_audit_log não encontrado; pulando triggers de auditoria.';
    return;
  end if;

  -- Contas a Receber (antigo, mas crítico)
  if to_regclass('public.contas_a_receber') is not null then
    execute 'drop trigger if exists audit_logs_trigger on public.contas_a_receber';
    execute 'create trigger audit_logs_trigger after insert or update or delete on public.contas_a_receber for each row execute function public.process_audit_log()';
  end if;

  -- Tesouraria
  if to_regclass('public.financeiro_extratos_bancarios') is not null then
    execute 'drop trigger if exists audit_logs_trigger on public.financeiro_extratos_bancarios';
    execute 'create trigger audit_logs_trigger after insert or update or delete on public.financeiro_extratos_bancarios for each row execute function public.process_audit_log()';
  end if;

  if to_regclass('public.financeiro_movimentacoes') is not null then
    execute 'drop trigger if exists audit_logs_trigger on public.financeiro_movimentacoes';
    execute 'create trigger audit_logs_trigger after insert or update or delete on public.financeiro_movimentacoes for each row execute function public.process_audit_log()';
  end if;

  if to_regclass('public.financeiro_contas_correntes') is not null then
    execute 'drop trigger if exists audit_logs_trigger on public.financeiro_contas_correntes';
    execute 'create trigger audit_logs_trigger after insert or update or delete on public.financeiro_contas_correntes for each row execute function public.process_audit_log()';
  end if;

  -- Centros de custo (há duas implementações históricas: `financeiro_centros_custos` e/ou `centros_de_custo`)
  if to_regclass('public.financeiro_centros_custos') is not null then
    execute 'drop trigger if exists audit_logs_trigger on public.financeiro_centros_custos';
    execute 'create trigger audit_logs_trigger after insert or update or delete on public.financeiro_centros_custos for each row execute function public.process_audit_log()';
  end if;

  if to_regclass('public.centros_de_custo') is not null then
    execute 'drop trigger if exists audit_logs_trigger on public.centros_de_custo';
    execute 'create trigger audit_logs_trigger after insert or update or delete on public.centros_de_custo for each row execute function public.process_audit_log()';
  end if;

  -- OS (entidades principais)
  if to_regclass('public.ordem_servicos') is not null then
    execute 'drop trigger if exists audit_logs_trigger on public.ordem_servicos';
    execute 'create trigger audit_logs_trigger after insert or update or delete on public.ordem_servicos for each row execute function public.process_audit_log()';
  end if;

  if to_regclass('public.ordem_servico_itens') is not null then
    execute 'drop trigger if exists audit_logs_trigger on public.ordem_servico_itens';
    execute 'create trigger audit_logs_trigger after insert or update or delete on public.ordem_servico_itens for each row execute function public.process_audit_log()';
  end if;

  if to_regclass('public.ordem_servico_parcelas') is not null then
    execute 'drop trigger if exists audit_logs_trigger on public.ordem_servico_parcelas';
    execute 'create trigger audit_logs_trigger after insert or update or delete on public.ordem_servico_parcelas for each row execute function public.process_audit_log()';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- OPS-04 (UI): incluir app_logs no audit.events (Developer -> Logs)
-- -----------------------------------------------------------------------------
create schema if not exists audit;

create or replace view audit.events as
select
  l.id,
  l.empresa_id,
  l.changed_at as occurred_at,
  'db'::text as source,
  l.table_name,
  l.operation as op,
  l.changed_by as actor_id,
  null::text as actor_email,
  case
    when l.record_id is null then null::jsonb
    else jsonb_build_object('id', l.record_id::text)
  end as pk,
  l.old_data as row_old,
  l.new_data as row_new,
  null::jsonb as diff,
  jsonb_build_object(
    'record_id', l.record_id,
    'table_name', l.table_name
  ) as meta
from public.audit_logs l

union all

select
  a.id,
  a.empresa_id,
  a.created_at as occurred_at,
  'app'::text as source,
  'app_logs'::text as table_name,
  'INSERT'::text as op,
  a.actor_id as actor_id,
  null::text as actor_email,
  jsonb_build_object('id', a.id::text) as pk,
  null::jsonb as row_old,
  jsonb_build_object(
    'level', a.level,
    'event', a.event,
    'message', a.message,
    'context', a.context
  ) as row_new,
  null::jsonb as diff,
  jsonb_build_object(
    'level', a.level,
    'event', a.event,
    'source', a.source
  ) as meta
from public.app_logs a;

-- -----------------------------------------------------------------------------
-- OPS-05: Reprocessamento seguro de NFE.io webhooks (fila já existe)
-- -----------------------------------------------------------------------------
drop function if exists public.ops_nfeio_webhook_reprocess(uuid);
create function public.ops_nfeio_webhook_reprocess(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_exists boolean;
begin
  perform public.require_permission_for_current_user('ops','manage');

  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode = '42501';
  end if;

  select true into v_exists
  from public.fiscal_nfe_webhook_events e
  where e.id = p_id and e.empresa_id = v_empresa;

  if not coalesce(v_exists,false) then
    raise exception 'Webhook não encontrado' using errcode = 'P0002';
  end if;

  update public.fiscal_nfe_webhook_events
  set
    processed_at = null,
    process_attempts = 0,
    next_retry_at = now(),
    locked_at = null,
    locked_by = null,
    last_error = null
  where id = p_id and empresa_id = v_empresa;
end;
$$;

revoke all on function public.ops_nfeio_webhook_reprocess(uuid) from public;
grant execute on function public.ops_nfeio_webhook_reprocess(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- OPS-06: Monitor de saúde (resumo + falhas recentes)
-- -----------------------------------------------------------------------------
drop function if exists public.ops_health_summary(interval);
create function public.ops_health_summary(p_window interval default interval '24 hours')
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, audit
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_from timestamptz := now() - coalesce(p_window, interval '24 hours');
  v_app_errors int := 0;
  v_db_events int := 0;
  v_nfe_pending int := 0;
  v_nfe_failed int := 0;
  v_nfe_locked int := 0;
begin
  perform public.require_permission_for_current_user('ops','view');

  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode = '42501';
  end if;

  select count(*)::int into v_app_errors
  from public.app_logs
  where empresa_id = v_empresa
    and level = 'error'
    and created_at >= v_from;

  select count(*)::int into v_db_events
  from public.audit_logs
  where empresa_id = v_empresa
    and changed_at >= v_from;

  if to_regclass('public.fiscal_nfe_webhook_events') is not null then
    select count(*)::int into v_nfe_pending
    from public.fiscal_nfe_webhook_events
    where empresa_id = v_empresa
      and processed_at is null
      and (next_retry_at is null or next_retry_at <= now())
      and (locked_at is null or locked_at < (now() - interval '10 minutes'));

    select count(*)::int into v_nfe_failed
    from public.fiscal_nfe_webhook_events
    where empresa_id = v_empresa
      and processed_at is null
      and last_error is not null;

    select count(*)::int into v_nfe_locked
    from public.fiscal_nfe_webhook_events
    where empresa_id = v_empresa
      and processed_at is null
      and locked_at is not null
      and locked_at >= (now() - interval '10 minutes');
  end if;

  return jsonb_build_object(
    'from', v_from,
    'to', now(),
    'app_errors', v_app_errors,
    'db_events', v_db_events,
    'nfeio', jsonb_build_object(
      'pending', v_nfe_pending,
      'failed', v_nfe_failed,
      'locked', v_nfe_locked
    )
  );
end;
$$;

revoke all on function public.ops_health_summary(interval) from public;
grant execute on function public.ops_health_summary(interval) to authenticated, service_role;

drop function if exists public.ops_recent_failures(timestamptz, int);
create function public.ops_recent_failures(
  p_from timestamptz default (now() - interval '24 hours'),
  p_limit int default 50
)
returns table(
  kind text,
  occurred_at timestamptz,
  message text,
  source text,
  meta jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  perform public.require_permission_for_current_user('ops','view');

  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode = '42501';
  end if;

  return query
  with app as (
    select
      'app_error'::text as kind,
      a.created_at as occurred_at,
      a.message as message,
      a.source as source,
      jsonb_build_object('event', a.event, 'level', a.level, 'id', a.id) as meta
    from public.app_logs a
    where a.empresa_id = v_empresa
      and a.level = 'error'
      and a.created_at >= coalesce(p_from, now() - interval '24 hours')
    order by a.created_at desc
    limit greatest(p_limit, 1)
  ),
  nfe as (
    select
      'nfeio_webhook'::text as kind,
      e.received_at as occurred_at,
      coalesce(e.last_error, 'Falha ao processar webhook') as message,
      'nfeio'::text as source,
      jsonb_build_object('id', e.id, 'event_type', e.event_type, 'nfeio_id', e.nfeio_id, 'attempts', e.process_attempts) as meta
    from public.fiscal_nfe_webhook_events e
    where e.empresa_id = v_empresa
      and e.processed_at is null
      and e.last_error is not null
      and e.received_at >= coalesce(p_from, now() - interval '24 hours')
    order by e.received_at desc
    limit greatest(p_limit, 1)
  )
  select * from (
    select * from app
    union all
    select * from nfe
  ) t
  order by occurred_at desc
  limit greatest(p_limit, 1);
end;
$$;

revoke all on function public.ops_recent_failures(timestamptz, int) from public;
grant execute on function public.ops_recent_failures(timestamptz, int) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

commit;
