/*
  BILL-STA-02 (P0) Stripe Webhooks idempotentes + trilha por evento (reprocessável)

  Motivo
  - Webhooks podem ser reenviados pelo Stripe (ou duplicados) e não devem causar efeitos colaterais no banco.
  - Quando falha (ex.: plano não mapeado, empresa/customer não encontrado), precisamos de trilha e reprocesso seguro.

  O que muda
  1) Cria a tabela `public.billing_stripe_webhook_events` para registrar cada evento (1 linha por `stripe_event_id`).
  2) Expõe falhas no painel de Saúde (ops) e permite dry-run/reprocessamento via RPC.
  3) Atualiza `ops_health_summary` e `ops_recent_failures` para incluir o domínio "stripe".

  Impacto
  - Não altera o fluxo de cobrança do Stripe; apenas adiciona observabilidade e idempotência.

  Reversibilidade
  - Reverter = dropar tabela e funções adicionadas/recriar versões anteriores de ops_*.
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) Tabela de trilha / idempotência
-- -----------------------------------------------------------------------------
create table if not exists public.billing_stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid null references public.empresas(id) on delete set null,

  stripe_event_id text not null unique,
  event_type text not null,
  livemode boolean not null default false,

  stripe_customer_id text null,
  stripe_subscription_id text null,
  stripe_price_id text null,
  plan_slug text null,
  billing_cycle text null check (billing_cycle is null or billing_cycle in ('monthly','yearly')),
  subscription_status text null,
  current_period_end timestamptz null,
  cancel_at_period_end boolean null,

  received_at timestamptz not null default now(),
  processed_at timestamptz null,
  locked_at timestamptz null,
  next_retry_at timestamptz null,
  process_attempts int not null default 0,
  last_error text null,

  request_id text null,
  meta jsonb not null default '{}'::jsonb
);

alter table public.billing_stripe_webhook_events enable row level security;

drop policy if exists billing_stripe_webhook_events_select on public.billing_stripe_webhook_events;
create policy billing_stripe_webhook_events_select
  on public.billing_stripe_webhook_events
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists billing_stripe_webhook_events_write_service_role on public.billing_stripe_webhook_events;
create policy billing_stripe_webhook_events_write_service_role
  on public.billing_stripe_webhook_events
  for all
  to service_role
  using (true)
  with check (true);

grant select on table public.billing_stripe_webhook_events to authenticated, service_role;
grant insert, update, delete on table public.billing_stripe_webhook_events to service_role;

create index if not exists idx_billing_stripe_webhook_events_pending
  on public.billing_stripe_webhook_events (empresa_id, processed_at, next_retry_at, received_at desc);

create index if not exists idx_billing_stripe_webhook_events_failed
  on public.billing_stripe_webhook_events (empresa_id, processed_at, last_error, received_at desc);

-- -----------------------------------------------------------------------------
-- 2) RPC: dry-run + reprocess (restrito a ops:manage)
-- -----------------------------------------------------------------------------
drop function if exists public.ops_stripe_webhook_reprocess_v2(uuid, boolean);
create function public.ops_stripe_webhook_reprocess_v2(p_id uuid, p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_row public.billing_stripe_webhook_events%rowtype;
  v_plan_slug text;
  v_preview jsonb;
  v_now timestamptz := now();
begin
  perform public.require_permission_for_current_user('ops','manage');

  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode='42501';
  end if;

  select * into v_row
  from public.billing_stripe_webhook_events
  where id = p_id
    and empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'Evento Stripe não encontrado' using errcode='P0002';
  end if;

  v_plan_slug := v_row.plan_slug;
  if v_plan_slug is null and v_row.stripe_price_id is not null then
    select p.slug into v_plan_slug
    from public.plans p
    where p.stripe_price_id = v_row.stripe_price_id
      and p.active = true
    limit 1;
  end if;

  v_preview := jsonb_build_object(
    'event_id', v_row.stripe_event_id,
    'event_type', v_row.event_type,
    'empresa_id', v_row.empresa_id,
    'stripe_customer_id', v_row.stripe_customer_id,
    'stripe_subscription_id', v_row.stripe_subscription_id,
    'stripe_price_id', v_row.stripe_price_id,
    'plan_slug', v_plan_slug,
    'billing_cycle', v_row.billing_cycle,
    'subscription_status', v_row.subscription_status,
    'current_period_end', v_row.current_period_end,
    'cancel_at_period_end', v_row.cancel_at_period_end
  );

  if coalesce(p_dry_run,false) then
    perform public.log_app_event(
      'info',
      'ops.stripe.dry_run',
      'Dry-run de reprocessamento (stripe webhook)',
      jsonb_build_object('domain','stripe','event_id',v_row.stripe_event_id,'event_type',v_row.event_type,'row_id',v_row.id)
    );
    return jsonb_build_object('mode','dry_run','preview',v_preview);
  end if;

  if v_row.stripe_subscription_id is null or v_row.stripe_price_id is null or v_plan_slug is null or v_row.billing_cycle is null then
    raise exception 'Evento incompleto para reprocessar (faltam campos)' using errcode='22000';
  end if;

  begin
    perform public.upsert_subscription(
      v_row.empresa_id,
      coalesce(v_row.subscription_status,'active'),
      v_row.current_period_end,
      v_row.stripe_price_id,
      v_row.stripe_subscription_id,
      v_plan_slug,
      v_row.billing_cycle,
      coalesce(v_row.cancel_at_period_end,false)
    );

    update public.billing_stripe_webhook_events
      set processed_at = v_now,
          locked_at = null,
          next_retry_at = null,
          last_error = null,
          process_attempts = greatest(process_attempts, 1)
    where id = v_row.id;

    perform public.log_app_event(
      'info',
      'ops.stripe.reprocess',
      'Reprocessamento executado (stripe webhook)',
      jsonb_build_object('domain','stripe','event_id',v_row.stripe_event_id,'event_type',v_row.event_type,'row_id',v_row.id)
    );

    return jsonb_build_object('mode','reprocess','preview',v_preview);
  exception
    when others then
      update public.billing_stripe_webhook_events
        set processed_at = null,
            locked_at = null,
            next_retry_at = v_now + interval '15 minutes',
            last_error = sqlerrm,
            process_attempts = process_attempts + 1
      where id = v_row.id;

      perform public.log_app_event(
        'error',
        'ops.stripe.reprocess_failed',
        'Falha ao reprocessar (stripe webhook)',
        jsonb_build_object('domain','stripe','event_id',v_row.stripe_event_id,'event_type',v_row.event_type,'row_id',v_row.id,'error',sqlerrm)
      );

      raise;
  end;
end;
$$;

revoke all on function public.ops_stripe_webhook_reprocess_v2(uuid, boolean) from public;
grant execute on function public.ops_stripe_webhook_reprocess_v2(uuid, boolean) to authenticated, service_role;

drop function if exists public.ops_stripe_webhook_reprocess(uuid);
create function public.ops_stripe_webhook_reprocess(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.ops_stripe_webhook_reprocess_v2(p_id, false);
end;
$$;

revoke all on function public.ops_stripe_webhook_reprocess(uuid) from public;
grant execute on function public.ops_stripe_webhook_reprocess(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) Saúde (ops): incluir "stripe" nos contadores e falhas recentes
-- -----------------------------------------------------------------------------
create or replace function public.ops_health_summary(p_window interval default interval '24 hours')
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, audit
as $fn$
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
$fn$;

revoke all on function public.ops_health_summary(interval) from public;
grant execute on function public.ops_health_summary(interval) to authenticated, service_role;

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
  select * from app
  union all select * from nfe
  union all select * from finance
  union all select * from stripe
  order by occurred_at desc
  limit greatest(p_limit, 1);
end;
$$;

revoke all on function public.ops_recent_failures(timestamptz, int) from public;
grant execute on function public.ops_recent_failures(timestamptz, int) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';

