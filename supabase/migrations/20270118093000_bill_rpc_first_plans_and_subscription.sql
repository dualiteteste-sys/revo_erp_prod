/*
  BILL (P1.2): RPC-first para Billing (plans/subscription/events)

  Objetivo
  - Reduzir dependência de acesso direto a tabelas via PostgREST em fluxos sensíveis (billing).
  - Evitar 403 intermitente quando o contexto de empresa ativa oscila (RPC usa callRpc com auto-recover).
  - Permitir listagem de planos no marketing (anon) sem expor tabelas diretamente.

  Nota
  - "plans" é catálogo público (apenas planos ativos); retornamos somente registros `active=true`.
  - "subscriptions" é por empresa; validamos acesso por membership/owner (não depende de empresa ativa).
  - "billing_stripe_webhook_events" é por empresa e já tem RLS; ainda assim expomos via RPC para padronizar.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Plans (público): lista apenas ativos (anon/authenticated)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.billing_plans_public_list(text);
CREATE OR REPLACE FUNCTION public.billing_plans_public_list(
  p_billing_cycle text DEFAULT NULL
)
RETURNS SETOF public.plans
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p.*
  FROM public.plans p
  WHERE p.active = true
    AND (
      p_billing_cycle IS NULL
      OR btrim(p_billing_cycle) = ''
      OR p.billing_cycle = p_billing_cycle
    )
  ORDER BY p.amount_cents ASC, p.slug ASC;
$$;

REVOKE ALL ON FUNCTION public.billing_plans_public_list(text) FROM public;
GRANT EXECUTE ON FUNCTION public.billing_plans_public_list(text) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) Subscription + Plan: resolve 1 assinatura por empresa (membership/owner)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.billing_subscription_with_plan_get(uuid);
CREATE OR REPLACE FUNCTION public.billing_subscription_with_plan_get(p_empresa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sub public.subscriptions%rowtype;
  v_plan public.plans%rowtype;
  v_ok boolean;
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'empresa_id inválido.';
  END IF;

  IF NOT public.is_service_role() THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'Sessão inválida. Entre novamente para continuar.';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.empresas e
      WHERE e.id = p_empresa_id
        AND (
          e.owner_id = v_uid
          OR EXISTS (
            SELECT 1
            FROM public.empresa_usuarios eu
            WHERE eu.empresa_id = e.id
              AND eu.user_id = v_uid
          )
        )
    ) INTO v_ok;

    IF NOT v_ok THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'Acesso negado.';
    END IF;
  END IF;

  SELECT *
    INTO v_sub
    FROM public.subscriptions s
   WHERE s.empresa_id = p_empresa_id
   ORDER BY s.updated_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_sub.stripe_price_id IS NOT NULL THEN
    SELECT *
      INTO v_plan
      FROM public.plans p
     WHERE p.stripe_price_id = v_sub.stripe_price_id
     LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'subscription', to_jsonb(v_sub),
    'plan', CASE WHEN v_plan.id IS NULL THEN NULL ELSE to_jsonb(v_plan) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.billing_subscription_with_plan_get(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_subscription_with_plan_get(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) Eventos Stripe da empresa ativa (sem vazamento cross-tenant)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.billing_stripe_webhook_events_list(int, int);
CREATE OR REPLACE FUNCTION public.billing_stripe_webhook_events_list(
  p_limit int DEFAULT 12,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  received_at timestamptz,
  event_type text,
  plan_slug text,
  billing_cycle text,
  subscription_status text,
  current_period_end timestamptz,
  processed_at timestamptz,
  last_error text,
  process_attempts int,
  stripe_event_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
BEGIN
  PERFORM public.assert_empresa_role_at_least('member');

  IF v_emp IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Nenhuma empresa ativa. Selecione uma empresa e tente novamente.';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.received_at,
    e.event_type,
    e.plan_slug,
    e.billing_cycle,
    e.subscription_status,
    e.current_period_end,
    e.processed_at,
    e.last_error,
    e.process_attempts,
    e.stripe_event_id
  FROM public.billing_stripe_webhook_events e
  WHERE e.empresa_id = v_emp
  ORDER BY e.received_at DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.billing_stripe_webhook_events_list(int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_stripe_webhook_events_list(int, int) TO authenticated, service_role;

COMMIT;
