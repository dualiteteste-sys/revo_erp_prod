/*
  Billing: iniciar trial (sem checkout) para evitar tenants "sem plano".

  Motivação:
  - Quando o usuário cria conta via landing (seleciona plano), o bootstrap cria a empresa,
    mas pode não existir `public.subscriptions` ainda (antes de qualquer checkout/stripe).
  - Isso gera 403/fallback intermitente em módulos que validam entitlements/plano.

  Solução:
  - RPC `billing_start_trial_for_current_user(plan_slug, billing_cycle)`:
    - tenant-safe: usa `current_empresa_id()` e valida membership.
    - cria/atualiza `public.subscriptions` para `trialing` quando ainda não existe assinatura.
    - usa `public.plans.trial_days` (fallback 60) e mantém `stripe_*` nulos (modo beta).
*/

begin;

drop function if exists public.billing_start_trial_for_current_user(text, text);

create or replace function public.billing_start_trial_for_current_user(
  p_plan_slug text,
  p_billing_cycle text default 'monthly'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := public.current_user_id();
  v_empresa_id uuid := public.current_empresa_id();
  v_slug text := upper(trim(coalesce(p_plan_slug, '')));
  v_cycle text := lower(trim(coalesce(p_billing_cycle, 'monthly')));
  v_trial_days int := 60;
  v_plan public.plans%rowtype;
  v_sub public.subscriptions%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_trial_end timestamptz;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '28000';
  end if;

  if v_empresa_id is null then
    raise exception 'Nenhuma empresa ativa definida para o usuário.' using errcode = '22000';
  end if;

  if not public.is_user_member_of(v_empresa_id) then
    raise exception 'Acesso negado à empresa ativa.' using errcode = '42501';
  end if;

  if v_slug = '' then
    raise exception 'plan_slug é obrigatório.' using errcode = '22023';
  end if;

  if v_cycle not in ('monthly', 'yearly') then
    raise exception 'billing_cycle inválido.' using errcode = '22023';
  end if;

  select *
  into v_plan
  from public.plans p
  where p.slug = v_slug
    and p.billing_cycle = v_cycle
    and p.active = true
  limit 1;

  if not found then
    raise exception 'Plano não encontrado/ativo.' using errcode = 'P0001';
  end if;

  v_trial_days := coalesce(v_plan.trial_days, 60);
  if v_trial_days < 0 then v_trial_days := 0; end if;
  if v_trial_days > 3650 then v_trial_days := 3650; end if;
  v_trial_end := v_now + make_interval(days => v_trial_days);

  select *
  into v_sub
  from public.subscriptions s
  where s.empresa_id = v_empresa_id
  limit 1;

  -- Se já existe assinatura real/ativa, não mexe (idempotente).
  if found and coalesce(v_sub.status, '') in ('active','trialing','past_due','unpaid','incomplete') then
    return jsonb_build_object(
      'ok', true,
      'status', v_sub.status,
      'empresa_id', v_empresa_id,
      'plan_slug', coalesce(v_sub.plan_slug, v_slug),
      'billing_cycle', coalesce(v_sub.billing_cycle, v_cycle),
      'note', 'subscription_exists'
    );
  end if;

  -- Cria (ou reativa) trial "beta" no banco (sem Stripe).
  insert into public.subscriptions (
    empresa_id,
    plan_slug,
    billing_cycle,
    status,
    trial_start,
    trial_end,
    current_period_start,
    current_period_end,
    stripe_customer_id,
    stripe_subscription_id,
    updated_at,
    created_at
  ) values (
    v_empresa_id,
    v_slug,
    v_cycle,
    case when v_trial_days > 0 then 'trialing' else 'active' end,
    case when v_trial_days > 0 then v_now else null end,
    case when v_trial_days > 0 then v_trial_end else null end,
    v_now,
    case when v_trial_days > 0 then v_trial_end else (v_now + make_interval(days => 30)) end,
    null,
    null,
    v_now,
    v_now
  )
  on conflict (empresa_id) do update set
    plan_slug = excluded.plan_slug,
    billing_cycle = excluded.billing_cycle,
    status = excluded.status,
    trial_start = excluded.trial_start,
    trial_end = excluded.trial_end,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    stripe_customer_id = coalesce(public.subscriptions.stripe_customer_id, excluded.stripe_customer_id),
    stripe_subscription_id = coalesce(public.subscriptions.stripe_subscription_id, excluded.stripe_subscription_id),
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'ok', true,
    'status', case when v_trial_days > 0 then 'trialing' else 'active' end,
    'empresa_id', v_empresa_id,
    'plan_slug', v_slug,
    'billing_cycle', v_cycle,
    'trial_days', v_trial_days,
    'trial_end', case when v_trial_days > 0 then v_trial_end else null end
  );
end;
$$;

revoke all on function public.billing_start_trial_for_current_user(text, text) from public, anon;
grant execute on function public.billing_start_trial_for_current_user(text, text) to authenticated, service_role;

commit;

