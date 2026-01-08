/*
  Motivo:
  - O projeto migrou de NFE.io para Focus NF-e, mas alguns artefatos internos ainda usam nomes legados
    (`nfeio_*`, coluna `nfeio_id`, etc.). Isso causa ruído na UI (Dev → Saúde) e em logs/diagnósticos.

  O que muda:
  - Padroniza a camada "Ops/Diagnóstico" para ser agnóstica ao provedor:
    - `ops_health_summary` passa a retornar `nfe_webhooks` (mantendo `nfeio` por compatibilidade)
    - `ops_recent_failures` passa a emitir kind/source neutros e inclui `provider`
    - Cria wrappers RPC neutros: `ops_nfe_webhook_reprocess(_v2)` chamáveis pela UI

  Impacto:
  - Nenhuma mudança em schema de tabelas.
  - Mantém compatibilidade com código/integrações legadas (funções antigas continuam existindo).

  Reversibilidade:
  - Reversível criando nova migration que restaure o retorno antigo. Sem perda de dados.
*/

begin;

-- -----------------------------------------------------------------------------
-- OPS-06: Monitor de saúde (inclui chave neutra nfe_webhooks)
-- -----------------------------------------------------------------------------
create or replace function public.ops_health_summary(p_window interval default interval '24 hours')
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
  v_fin_pending int := 0;
  v_fin_failed int := 0;
  v_fin_locked int := 0;
  v_str_pending int := 0;
  v_str_failed int := 0;
  v_str_locked int := 0;
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

  if to_regclass('public.finance_jobs') is not null then
    select count(*)::int into v_fin_pending
    from public.finance_jobs
    where empresa_id = v_empresa
      and status in ('pending','processing')
      and (next_retry_at is null or next_retry_at <= now())
      and (locked_at is null or locked_at < (now() - interval '10 minutes'));

    select count(*)::int into v_fin_failed
    from public.finance_jobs
    where empresa_id = v_empresa
      and status = 'failed'
      and last_error is not null;

    select count(*)::int into v_fin_locked
    from public.finance_jobs
    where empresa_id = v_empresa
      and status = 'processing'
      and locked_at is not null
      and locked_at >= (now() - interval '10 minutes');
  end if;

  if to_regclass('public.billing_stripe_webhook_events') is not null then
    select count(*)::int into v_str_pending
    from public.billing_stripe_webhook_events
    where empresa_id = v_empresa
      and processed_at is null
      and (next_retry_at is null or next_retry_at <= now())
      and (locked_at is null or locked_at < (now() - interval '10 minutes'));

    select count(*)::int into v_str_failed
    from public.billing_stripe_webhook_events
    where empresa_id = v_empresa
      and processed_at is null
      and last_error is not null;

    select count(*)::int into v_str_locked
    from public.billing_stripe_webhook_events
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
    -- novo: neutro
    'nfe_webhooks', jsonb_build_object(
      'pending', v_nfe_pending,
      'failed', v_nfe_failed,
      'locked', v_nfe_locked
    ),
    -- compatibilidade: legado
    'nfeio', jsonb_build_object(
      'pending', v_nfe_pending,
      'failed', v_nfe_failed,
      'locked', v_nfe_locked
    ),
    'finance', jsonb_build_object(
      'pending', v_fin_pending,
      'failed', v_fin_failed,
      'locked', v_fin_locked
    ),
    'stripe', jsonb_build_object(
      'pending', v_str_pending,
      'failed', v_str_failed,
      'locked', v_str_locked
    )
  );
end;
$$;

revoke all on function public.ops_health_summary(interval) from public;
grant execute on function public.ops_health_summary(interval) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- OPS-06: Falhas recentes (neutro por provedor)
-- -----------------------------------------------------------------------------
create or replace function public.ops_recent_failures(
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
      'nfe_webhook'::text as kind,
      e.received_at as occurred_at,
      coalesce(e.last_error, 'Falha ao processar webhook') as message,
      'nfe'::text as source,
      jsonb_build_object(
        'id', e.id,
        'provider', e.provider,
        'event_type', e.event_type,
        -- coluna legado: serve como referência do provedor
        'provider_ref', e.nfeio_id,
        'attempts', e.process_attempts
      ) as meta
    from public.fiscal_nfe_webhook_events e
    where e.empresa_id = v_empresa
      and e.processed_at is null
      and e.last_error is not null
      and e.received_at >= coalesce(p_from, now() - interval '24 hours')
    order by e.received_at desc
    limit greatest(p_limit, 1)
  ),
  finance as (
    select
      'finance_job'::text as kind,
      f.dead_lettered_at as occurred_at,
      coalesce(f.last_error, 'Falha em job financeiro') as message,
      'finance'::text as source,
      jsonb_build_object('id', f.id, 'job_type', f.job_type, 'idempotency_key', f.idempotency_key) as meta
    from public.finance_job_dead_letters f
    where f.empresa_id = v_empresa
      and f.dead_lettered_at >= coalesce(p_from, now() - interval '24 hours')
    order by f.dead_lettered_at desc
    limit greatest(p_limit, 1)
  ),
  stripe as (
    select
      'stripe_webhook'::text as kind,
      s.received_at as occurred_at,
      coalesce(s.last_error, 'Falha ao processar webhook') as message,
      'stripe'::text as source,
      jsonb_build_object('id', s.id, 'event_id', s.stripe_event_id, 'event_type', s.event_type, 'attempts', s.process_attempts) as meta
    from public.billing_stripe_webhook_events s
    where s.empresa_id = v_empresa
      and s.processed_at is null
      and s.last_error is not null
      and s.received_at >= coalesce(p_from, now() - interval '24 hours')
    order by s.received_at desc
    limit greatest(p_limit, 1)
  )
  select * from (
    select * from app
    union all
    select * from nfe
    union all
    select * from finance
    union all
    select * from stripe
  ) t
  order by occurred_at desc
  limit greatest(p_limit, 1);
end;
$$;

revoke all on function public.ops_recent_failures(timestamptz, int) from public;
grant execute on function public.ops_recent_failures(timestamptz, int) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- OPS-05: Reprocessamento seguro de webhooks NF-e (RPC neutra)
-- -----------------------------------------------------------------------------
drop function if exists public.ops_nfe_webhook_reprocess_v2(uuid, boolean);
create function public.ops_nfe_webhook_reprocess_v2(p_id uuid, p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_before jsonb;
  v_after jsonb;
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

  select to_jsonb(e) into v_before
  from public.fiscal_nfe_webhook_events e
  where e.id = p_id and e.empresa_id = v_empresa;

  v_after := v_before
    || jsonb_build_object(
      'processed_at', null,
      'process_attempts', 0,
      'next_retry_at', now()::text,
      'locked_at', null,
      'locked_by', null,
      'last_error', null
    );

  if coalesce(p_dry_run,false) then
    perform public.log_app_event('info','ops.dlq.dry_run','Dry-run de reprocessamento (NF-e)', jsonb_build_object('domain','nfe','event_id',p_id));
    return jsonb_build_object('mode','dry_run','before',v_before,'after',v_after);
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

  perform public.log_app_event('info','ops.dlq.reprocess','Reprocessamento executado (NF-e)', jsonb_build_object('domain','nfe','event_id',p_id));

  return jsonb_build_object('mode','reprocess','before',v_before,'after',v_after);
end;
$$;

revoke all on function public.ops_nfe_webhook_reprocess_v2(uuid, boolean) from public;
grant execute on function public.ops_nfe_webhook_reprocess_v2(uuid, boolean) to authenticated, service_role;

create or replace function public.ops_nfe_webhook_reprocess(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.ops_nfe_webhook_reprocess_v2(p_id, false);
end;
$$;

revoke all on function public.ops_nfe_webhook_reprocess(uuid) from public;
grant execute on function public.ops_nfe_webhook_reprocess(uuid) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

commit;
