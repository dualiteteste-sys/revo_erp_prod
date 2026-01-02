/*
  OBS-OPS-01: Operação/Saúde — reprocessamento de DLQ (marketplace + financeiro)

  - Financeiro: reprocessar registro da DLQ para `finance_jobs`
  - Marketplaces: reprocessar registro da DLQ para `ecommerce_jobs`
*/

BEGIN;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Financeiro: DLQ → fila
-- -----------------------------------------------------------------------------
drop function if exists public.ops_finance_dlq_reprocess(uuid);
create function public.ops_finance_dlq_reprocess(p_dlq_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_row public.finance_job_dead_letters%rowtype;
  v_new_id uuid;
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

  insert into public.finance_jobs(empresa_id, job_type, payload, idempotency_key, status, next_retry_at)
  values (v_row.empresa_id, v_row.job_type, v_row.payload, v_row.idempotency_key, 'pending', now())
  returning id into v_new_id;

  delete from public.finance_job_dead_letters
  where id = v_row.id;

  return v_new_id;
end;
$$;

revoke all on function public.ops_finance_dlq_reprocess(uuid) from public;
grant execute on function public.ops_finance_dlq_reprocess(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Marketplaces: DLQ → fila
-- -----------------------------------------------------------------------------
drop function if exists public.ops_ecommerce_dlq_reprocess(uuid);
create function public.ops_ecommerce_dlq_reprocess(p_dlq_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_row public.ecommerce_job_dead_letters%rowtype;
  v_ecommerce_id uuid;
  v_new_id uuid;
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

  if v_ecommerce_id is null then
    raise exception 'Conexão (%s) não encontrada para empresa', v_row.provider using errcode = 'P0002';
  end if;

  insert into public.ecommerce_jobs(empresa_id, ecommerce_id, provider, kind, dedupe_key, payload, status, next_retry_at)
  values (v_row.empresa_id, v_ecommerce_id, v_row.provider, v_row.kind, v_row.dedupe_key, v_row.payload, 'pending', now())
  returning id into v_new_id;

  delete from public.ecommerce_job_dead_letters
  where id = v_row.id;

  return v_new_id;
end;
$$;

revoke all on function public.ops_ecommerce_dlq_reprocess(uuid) from public;
grant execute on function public.ops_ecommerce_dlq_reprocess(uuid) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

COMMIT;
