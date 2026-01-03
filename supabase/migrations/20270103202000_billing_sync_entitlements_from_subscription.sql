/*
  Billing → Entitlements sync (ADM-STA-02)

  Contexto:
  - O enforcement de módulos (Serviços/Indústria) e limites (ex.: max_users) é feito no DB via
    `public.empresa_entitlements` + `public.plano_mvp_allows(...)` (RLS).
  - Com Stripe, o "plano real" passa a ser a assinatura em `public.subscriptions` (plan_slug/billing_cycle).
  - Sem sincronizar, a empresa pode ficar com entitlements divergentes do plano contratado (drift funcional).

  O que faz:
  - Cria função de mapeamento `plan_slug -> (plano_mvp, max_users)` para os 5 planos atuais.
  - Sincroniza automaticamente `empresa_entitlements` quando `subscriptions` muda (trigger AFTER).
  - Idempotente e sem alterações de schema existentes (apenas funções/triggers + dados em empresa_entitlements).

  Observações:
  - Esta sync define entitlements mínimos por plano; upgrades/downgrades passam a refletir o billing real.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- Helpers: plan_slug -> entitlements
-- -----------------------------------------------------------------------------
create or replace function public.billing_plan_entitlements(p_plan_slug text)
returns table(plano_mvp text, max_users integer)
language sql
stable
set search_path = pg_catalog, public
as $$
  select
    case upper(coalesce(p_plan_slug,''))
      when 'ESSENCIAL' then 'servicos'
      when 'PRO'       then 'servicos'
      when 'MAX'       then 'servicos'
      when 'INDUSTRIA' then 'industria'
      when 'SCALE'     then 'ambos'
      else null
    end as plano_mvp,
    case upper(coalesce(p_plan_slug,''))
      when 'ESSENCIAL' then 2
      when 'PRO'       then 5
      when 'MAX'       then 8
      when 'INDUSTRIA' then 10
      when 'SCALE'     then 999
      else null
    end as max_users
  where upper(coalesce(p_plan_slug,'')) in ('ESSENCIAL','PRO','MAX','INDUSTRIA','SCALE');
$$;

revoke all on function public.billing_plan_entitlements(text) from public, anon;
grant execute on function public.billing_plan_entitlements(text) to authenticated, service_role, postgres;

-- -----------------------------------------------------------------------------
-- Sync: subscriptions -> empresa_entitlements
-- -----------------------------------------------------------------------------
create or replace function public.sync_empresa_entitlements_from_subscription(p_empresa_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan_slug text;
  v_plano_mvp text;
  v_max_users int;
begin
  if p_empresa_id is null then
    return;
  end if;

  select
    coalesce(s.plan_slug, p.slug)
  into v_plan_slug
  from public.subscriptions s
  left join public.plans p on p.stripe_price_id = s.stripe_price_id
  where s.empresa_id = p_empresa_id;

  if v_plan_slug is null then
    return;
  end if;

  select e.plano_mvp, e.max_users
  into v_plano_mvp, v_max_users
  from public.billing_plan_entitlements(v_plan_slug) e;

  if v_plano_mvp is null or v_max_users is null then
    return;
  end if;

  insert into public.empresa_entitlements as ee (empresa_id, plano_mvp, max_users)
  values (p_empresa_id, v_plano_mvp, v_max_users)
  on conflict (empresa_id) do update
    set plano_mvp  = excluded.plano_mvp,
        max_users  = excluded.max_users,
        updated_at = now();
end;
$$;

revoke all on function public.sync_empresa_entitlements_from_subscription(uuid) from public, anon;
grant execute on function public.sync_empresa_entitlements_from_subscription(uuid) to service_role, postgres;

-- -----------------------------------------------------------------------------
-- Trigger: keep entitlements updated on subscription changes
-- -----------------------------------------------------------------------------
create or replace function public.tg_subscriptions_sync_entitlements()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.sync_empresa_entitlements_from_subscription(new.empresa_id);
  return new;
end;
$$;

revoke all on function public.tg_subscriptions_sync_entitlements() from public, anon;
grant execute on function public.tg_subscriptions_sync_entitlements() to service_role, postgres;

drop trigger if exists tg_subscriptions_sync_entitlements on public.subscriptions;
create trigger tg_subscriptions_sync_entitlements
after insert or update of plan_slug, stripe_price_id, status
on public.subscriptions
for each row
execute function public.tg_subscriptions_sync_entitlements();

-- Backfill (best-effort) para empresas que já têm subscription.
do $$
declare
  r record;
begin
  for r in (select empresa_id from public.subscriptions) loop
    perform public.sync_empresa_entitlements_from_subscription(r.empresa_id);
  end loop;
end $$;

select pg_notify('pgrst', 'reload schema');

COMMIT;

