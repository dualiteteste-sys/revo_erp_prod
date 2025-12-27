/*
  RPC: upsert_subscription (Stripe webhook)

  A Edge Function `stripe-webhook` usa a service_role key para manter `public.subscriptions`
  sincronizada com eventos `customer.subscription.*`.
*/

create or replace function public.upsert_subscription(
  p_empresa_id uuid,
  p_status text,
  p_current_period_end timestamptz,
  p_price_id text,
  p_sub_id text,
  p_plan_slug text,
  p_billing_cycle text,
  p_cancel_at_period_end boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_empresa_id is null then
    raise exception 'empresa_id is required';
  end if;

  insert into public.subscriptions (
    empresa_id,
    status,
    current_period_end,
    stripe_subscription_id,
    stripe_price_id,
    plan_slug,
    billing_cycle,
    cancel_at_period_end,
    updated_at
  ) values (
    p_empresa_id,
    p_status,
    p_current_period_end,
    p_sub_id,
    p_price_id,
    p_plan_slug,
    p_billing_cycle,
    coalesce(p_cancel_at_period_end, false),
    now()
  )
  on conflict (empresa_id) do update set
    status = excluded.status,
    current_period_end = excluded.current_period_end,
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_price_id = excluded.stripe_price_id,
    plan_slug = excluded.plan_slug,
    billing_cycle = excluded.billing_cycle,
    cancel_at_period_end = excluded.cancel_at_period_end,
    updated_at = now();
end;
$$;

revoke all on function public.upsert_subscription(uuid, text, timestamptz, text, text, text, text, boolean) from public;
grant execute on function public.upsert_subscription(uuid, text, timestamptz, text, text, text, text, boolean) to service_role;

select pg_notify('pgrst','reload schema');

