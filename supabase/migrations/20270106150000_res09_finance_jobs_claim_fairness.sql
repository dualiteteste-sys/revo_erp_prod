/*
  RES-09 — Fairness multi-tenant (fila Finance)

  Motivo
  - O claim atual ordena globalmente por `updated_at`, permitindo que uma única empresa com muitos jobs
    "monopolize" o worker.

  O que muda
  - Atualiza `public.finance_jobs_claim` para um agendamento "fair":
    - prioriza 1 job por empresa (round-robin por `rn`), depois o 2º, etc.
    - mantém `FOR UPDATE SKIP LOCKED` para concorrência segura.

  Impacto / Reversibilidade
  - Apenas lógica de function (sem mudanças de schema). Reversível via migração futura.
*/

begin;

create or replace function public.finance_jobs_claim(p_limit integer default 10, p_worker_id text default null)
returns setof public.finance_jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_worker text := coalesce(nullif(btrim(p_worker_id),''), 'worker');
  v_limit int := greatest(coalesce(p_limit,10), 1);
begin
  -- Somente service_role (worker)
  if current_user <> 'service_role' then
    raise exception 'Somente service_role' using errcode='42501';
  end if;

  return query
  with ranked as (
    select
      j.id,
      row_number() over (partition by j.empresa_id order by j.updated_at asc, j.id asc) as rn,
      min(j.updated_at) over (partition by j.empresa_id) as first_updated
    from public.finance_jobs j
    where j.status in ('pending','failed')
      and (j.next_retry_at is null or j.next_retry_at <= now())
      and (j.locked_at is null or j.locked_at < (now() - interval '10 minutes'))
  ),
  pick as (
    select j2.id
    from ranked r
    join public.finance_jobs j2 on j2.id = r.id
    order by r.rn asc, r.first_updated asc, j2.updated_at asc, j2.id asc
    limit v_limit
    for update of j2 skip locked
  )
  update public.finance_jobs j
     set status = 'processing',
         locked_at = now(),
         locked_by = v_worker,
         process_attempts = j.process_attempts + 1,
         updated_at = now()
    from pick
   where j.id = pick.id
  returning j.*;
end;
$$;

revoke all on function public.finance_jobs_claim(integer, text) from public;
grant execute on function public.finance_jobs_claim(integer, text) to service_role;

notify pgrst, 'reload schema';

commit;

