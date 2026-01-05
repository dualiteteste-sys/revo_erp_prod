/*
  INT-STA-02 (P0) Reprocessamento seguro

  Objetivo
  - Adicionar "dry-run" (preview) para reprocessamento de DLQ (financeiro, marketplaces, NFE.io).
  - Registrar trilha/auditoria do reprocesso (via app_logs) com contexto (dlq_id, new_job_id, modo).
  - Facilitar validação criando um item de DLQ de teste via RPC (restrito a ops:manage).
*/

begin;

-- -----------------------------------------------------------------------------
-- Financeiro: DLQ reprocess v2 (dry-run + trilha) + seed
-- -----------------------------------------------------------------------------
drop function if exists public.ops_finance_dlq_reprocess_v2(uuid, boolean);
create function public.ops_finance_dlq_reprocess_v2(p_dlq_id uuid, p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_row public.finance_job_dead_letters%rowtype;
  v_new_id uuid;
  v_preview jsonb;
begin
  perform public.require_permission_for_current_user('ops','manage');
  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode = '42501';
  end if;

  select * into v_row
  from public.finance_job_dead_letters
  where id = p_dlq_id
    and empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'DLQ não encontrada' using errcode = 'P0002';
  end if;

  v_preview := jsonb_build_object(
    'dlq_id', v_row.id,
    'job_type', v_row.job_type,
    'idempotency_key', v_row.idempotency_key,
    'payload', v_row.payload
  );

  if coalesce(p_dry_run,false) then
    perform public.log_app_event(
      'info',
      'ops.dlq.dry_run',
      'Dry-run de reprocessamento (financeiro)',
      jsonb_build_object('domain','finance','dlq_id',v_row.id,'job_type',v_row.job_type,'idempotency_key',v_row.idempotency_key)
    );
    return jsonb_build_object('mode','dry_run','preview',v_preview);
  end if;

  insert into public.finance_jobs(empresa_id, job_type, payload, idempotency_key, status, next_retry_at)
  values (v_row.empresa_id, v_row.job_type, v_row.payload, v_row.idempotency_key, 'pending', now())
  returning id into v_new_id;

  delete from public.finance_job_dead_letters
  where id = v_row.id;

  perform public.log_app_event(
    'info',
    'ops.dlq.reprocess',
    'Reprocessamento executado (financeiro)',
    jsonb_build_object('domain','finance','dlq_id',v_row.id,'new_job_id',v_new_id,'job_type',v_row.job_type,'idempotency_key',v_row.idempotency_key)
  );

  return jsonb_build_object('mode','reprocess','new_job_id',v_new_id,'preview',v_preview);
end;
$$;

revoke all on function public.ops_finance_dlq_reprocess_v2(uuid, boolean) from public;
grant execute on function public.ops_finance_dlq_reprocess_v2(uuid, boolean) to authenticated, service_role;

create or replace function public.ops_finance_dlq_reprocess(p_dlq_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v jsonb;
  v_new uuid;
begin
  v := public.ops_finance_dlq_reprocess_v2(p_dlq_id, false);
  v_new := nullif(v->>'new_job_id','')::uuid;
  if v_new is null then
    raise exception 'Falha ao reprocessar DLQ (financeiro)' using errcode='P0001';
  end if;
  return v_new;
end;
$$;

revoke all on function public.ops_finance_dlq_reprocess(uuid) from public;
grant execute on function public.ops_finance_dlq_reprocess(uuid) to authenticated, service_role;

drop function if exists public.ops_finance_dlq_seed(text);
create function public.ops_finance_dlq_seed(p_job_type text default 'test')
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid;
  v_type text := coalesce(nullif(btrim(p_job_type),''), 'test');
begin
  perform public.require_permission_for_current_user('ops','manage');
  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode='42501';
  end if;

  insert into public.finance_job_dead_letters(empresa_id, job_type, payload, idempotency_key, last_error, meta)
  values (
    v_empresa,
    v_type,
    jsonb_build_object('seed', true, 'created_at', now()::text),
    'seed-' || gen_random_uuid()::text,
    'Seed: falha simulada para validação do reprocessamento',
    jsonb_build_object('seed', true)
  )
  returning id into v_id;

  perform public.log_app_event('warn','ops.dlq.seed','DLQ seed criado (financeiro)', jsonb_build_object('domain','finance','dlq_id',v_id,'job_type',v_type));
  return v_id;
end;
$$;

revoke all on function public.ops_finance_dlq_seed(text) from public;
grant execute on function public.ops_finance_dlq_seed(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Marketplaces: DLQ reprocess v2 (dry-run + trilha) + seed
-- -----------------------------------------------------------------------------
drop function if exists public.ops_ecommerce_dlq_reprocess_v2(uuid, boolean);
create function public.ops_ecommerce_dlq_reprocess_v2(p_dlq_id uuid, p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_row public.ecommerce_job_dead_letters%rowtype;
  v_ecommerce_id uuid;
  v_new_id uuid;
  v_preview jsonb;
begin
  perform public.require_permission_for_current_user('ops','manage');
  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode = '42501';
  end if;

  select * into v_row
  from public.ecommerce_job_dead_letters
  where id = p_dlq_id
    and empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'DLQ não encontrada' using errcode = 'P0002';
  end if;

  select id into v_ecommerce_id
  from public.ecommerces
  where empresa_id = v_empresa
    and provider = v_row.provider
  order by created_at desc
  limit 1;

  v_preview := jsonb_build_object(
    'dlq_id', v_row.id,
    'provider', v_row.provider,
    'kind', v_row.kind,
    'dedupe_key', v_row.dedupe_key,
    'payload', v_row.payload,
    'ecommerce_id', v_ecommerce_id
  );

  if coalesce(p_dry_run,false) then
    perform public.log_app_event(
      'info',
      'ops.dlq.dry_run',
      'Dry-run de reprocessamento (marketplaces)',
      jsonb_build_object('domain','ecommerce','dlq_id',v_row.id,'provider',v_row.provider,'kind',v_row.kind,'dedupe_key',v_row.dedupe_key)
    );
    return jsonb_build_object('mode','dry_run','preview',v_preview);
  end if;

  if v_ecommerce_id is null then
    raise exception 'Conexão (%s) não encontrada para empresa', v_row.provider using errcode = 'P0002';
  end if;

  insert into public.ecommerce_jobs(empresa_id, ecommerce_id, provider, kind, dedupe_key, payload, status, next_retry_at)
  values (v_row.empresa_id, v_ecommerce_id, v_row.provider, v_row.kind, v_row.dedupe_key, v_row.payload, 'pending', now())
  returning id into v_new_id;

  delete from public.ecommerce_job_dead_letters
  where id = v_row.id;

  perform public.log_app_event(
    'info',
    'ops.dlq.reprocess',
    'Reprocessamento executado (marketplaces)',
    jsonb_build_object('domain','ecommerce','dlq_id',v_row.id,'new_job_id',v_new_id,'provider',v_row.provider,'kind',v_row.kind,'dedupe_key',v_row.dedupe_key)
  );

  return jsonb_build_object('mode','reprocess','new_job_id',v_new_id,'preview',v_preview);
end;
$$;

revoke all on function public.ops_ecommerce_dlq_reprocess_v2(uuid, boolean) from public;
grant execute on function public.ops_ecommerce_dlq_reprocess_v2(uuid, boolean) to authenticated, service_role;

create or replace function public.ops_ecommerce_dlq_reprocess(p_dlq_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v jsonb;
  v_new uuid;
begin
  v := public.ops_ecommerce_dlq_reprocess_v2(p_dlq_id, false);
  v_new := nullif(v->>'new_job_id','')::uuid;
  if v_new is null then
    raise exception 'Falha ao reprocessar DLQ (marketplaces)' using errcode='P0001';
  end if;
  return v_new;
end;
$$;

revoke all on function public.ops_ecommerce_dlq_reprocess(uuid) from public;
grant execute on function public.ops_ecommerce_dlq_reprocess(uuid) to authenticated, service_role;

drop function if exists public.ops_ecommerce_dlq_seed(text, text);
create function public.ops_ecommerce_dlq_seed(p_provider text default 'meli', p_kind text default 'test')
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid;
  v_provider text := coalesce(nullif(btrim(p_provider),''), 'meli');
  v_kind text := coalesce(nullif(btrim(p_kind),''), 'test');
begin
  perform public.require_permission_for_current_user('ops','manage');
  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode='42501';
  end if;

  insert into public.ecommerce_job_dead_letters(empresa_id, provider, kind, dedupe_key, payload, last_error, meta)
  values (
    v_empresa,
    v_provider,
    v_kind,
    'seed-' || gen_random_uuid()::text,
    jsonb_build_object('seed', true, 'created_at', now()::text),
    'Seed: falha simulada para validação do reprocessamento',
    jsonb_build_object('seed', true)
  )
  returning id into v_id;

  perform public.log_app_event('warn','ops.dlq.seed','DLQ seed criado (marketplaces)', jsonb_build_object('domain','ecommerce','dlq_id',v_id,'provider',v_provider,'kind',v_kind));
  return v_id;
end;
$$;

revoke all on function public.ops_ecommerce_dlq_seed(text, text) from public;
grant execute on function public.ops_ecommerce_dlq_seed(text, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- NFE.io: reprocess v2 (dry-run + trilha)
-- -----------------------------------------------------------------------------
drop function if exists public.ops_nfeio_webhook_reprocess_v2(uuid, boolean);
create function public.ops_nfeio_webhook_reprocess_v2(p_id uuid, p_dry_run boolean default false)
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
    perform public.log_app_event('info','ops.dlq.dry_run','Dry-run de reprocessamento (NFE.io)', jsonb_build_object('domain','nfeio','event_id',p_id));
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

  perform public.log_app_event('info','ops.dlq.reprocess','Reprocessamento executado (NFE.io)', jsonb_build_object('domain','nfeio','event_id',p_id));

  return jsonb_build_object('mode','reprocess','before',v_before,'after',v_after);
end;
$$;

revoke all on function public.ops_nfeio_webhook_reprocess_v2(uuid, boolean) from public;
grant execute on function public.ops_nfeio_webhook_reprocess_v2(uuid, boolean) to authenticated, service_role;

create or replace function public.ops_nfeio_webhook_reprocess(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.ops_nfeio_webhook_reprocess_v2(p_id, false);
end;
$$;

revoke all on function public.ops_nfeio_webhook_reprocess(uuid) from public;
grant execute on function public.ops_nfeio_webhook_reprocess(uuid) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

commit;

