/*
  FINOPS-02 (P1): Limites por plano com enforcement real + alertas

  Contexto:
  - Já existe enforcement de max_users via `empresa_entitlements.max_users` + trigger em `empresa_usuarios`.
  - Precisamos adicionar limites adicionais (mínimo vendável) e um "status" para UI (alertas).

  O que faz:
  1) Adiciona `empresa_entitlements.max_nfe_monthly` (limite mensal de emissões NF-e).
  2) Enforce no DB: bloqueia transição `rascunho -> enfileirada/processando/...` quando exceder o limite.
  3) Expõe `max_nfe_monthly` no view `empresa_features` (para UI/guards).
  4) Atualiza o sync `billing_plan_entitlements` para incluir `max_nfe_monthly`.
  5) Cria RPC `finops_limits_status()` (somente leitura) para a UI mostrar alertas/consumo.

  Idempotência:
  - `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS`.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Schema: coluna nova em empresa_entitlements
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.empresa_entitlements
  ADD COLUMN IF NOT EXISTS max_nfe_monthly integer NOT NULL DEFAULT 999;

DO $$
BEGIN
  IF to_regclass('public.empresa_entitlements') IS NOT NULL THEN
    ALTER TABLE public.empresa_entitlements
      DROP CONSTRAINT IF EXISTS empresa_entitlements_max_nfe_monthly_check;
    ALTER TABLE public.empresa_entitlements
      ADD CONSTRAINT empresa_entitlements_max_nfe_monthly_check CHECK (max_nfe_monthly >= 0);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2) Enforce: limite mensal de NF-e (conta quando sai do rascunho)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_empresa_max_nfe_monthly()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := NEW.empresa_id;
  v_max int;
  v_used int;
  v_month_start timestamptz := date_trunc('month', now());
  v_month_end timestamptz := (date_trunc('month', now()) + interval '1 month');
  v_is_becoming_billable boolean := false;
BEGIN
  IF public.is_service_role() THEN
    RETURN NEW;
  END IF;

  IF v_empresa IS NULL THEN
    RETURN NEW;
  END IF;

  -- Só conta quando a NF sai de rascunho (ou nasce já não-rascunho).
  IF TG_OP = 'INSERT' THEN
    v_is_becoming_billable := (coalesce(NEW.status,'rascunho') <> 'rascunho');
  ELSIF TG_OP = 'UPDATE' THEN
    v_is_becoming_billable := (coalesce(OLD.status,'rascunho') = 'rascunho' AND coalesce(NEW.status,'rascunho') <> 'rascunho');
  END IF;

  IF NOT v_is_becoming_billable THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(
    (SELECT ee.max_nfe_monthly FROM public.empresa_entitlements ee WHERE ee.empresa_id = v_empresa),
    999
  ) INTO v_max;

  -- 0 = bloqueia totalmente
  IF v_max = 0 THEN
    RAISE EXCEPTION 'Limite mensal de NF-e atingido (0). Faça upgrade do plano para emitir NF-e.'
      USING errcode = '23514';
  END IF;

  SELECT count(*)::int INTO v_used
  FROM public.fiscal_nfe_emissoes e
  WHERE e.empresa_id = v_empresa
    AND e.created_at >= v_month_start
    AND e.created_at < v_month_end
    AND coalesce(e.status,'rascunho') <> 'rascunho';

  IF v_used >= v_max THEN
    RAISE EXCEPTION
      'Limite mensal de NF-e atingido (%). Faça upgrade do plano para continuar emitindo.'
      , v_max
      USING errcode = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_empresa_max_nfe_monthly() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.enforce_empresa_max_nfe_monthly() TO authenticated, service_role, postgres;

DROP TRIGGER IF EXISTS tg_fiscal_nfe_enforce_max_nfe_monthly_insert ON public.fiscal_nfe_emissoes;
CREATE TRIGGER tg_fiscal_nfe_enforce_max_nfe_monthly_insert
BEFORE INSERT ON public.fiscal_nfe_emissoes
FOR EACH ROW
EXECUTE FUNCTION public.enforce_empresa_max_nfe_monthly();

DROP TRIGGER IF EXISTS tg_fiscal_nfe_enforce_max_nfe_monthly_update ON public.fiscal_nfe_emissoes;
CREATE TRIGGER tg_fiscal_nfe_enforce_max_nfe_monthly_update
BEFORE UPDATE OF status ON public.fiscal_nfe_emissoes
FOR EACH ROW
EXECUTE FUNCTION public.enforce_empresa_max_nfe_monthly();

-- -----------------------------------------------------------------------------
-- 3) View empresa_features: expor max_nfe_monthly (safe default 999)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.empresa_features
WITH (security_invoker = true, security_barrier = true)
AS
SELECT
  e.id AS empresa_id,
  EXISTS (
    SELECT 1
    FROM public.empresa_addons ea
    WHERE ea.empresa_id = e.id
      AND ea.addon_slug = 'REVO_SEND'
      AND ea.status = ANY (ARRAY['active'::text, 'trialing'::text])
      AND COALESCE(ea.cancel_at_period_end, false) = false
  ) AS revo_send_enabled,
  COALESCE(ef.nfe_emissao_enabled, false) AS nfe_emissao_enabled,
  COALESCE(ent.plano_mvp, 'ambos') AS plano_mvp,
  COALESCE(ent.max_users, 999) AS max_users,
  (COALESCE(ent.plano_mvp, 'ambos') IN ('servicos', 'ambos')) AS servicos_enabled,
  (COALESCE(ent.plano_mvp, 'ambos') IN ('industria', 'ambos')) AS industria_enabled,
  COALESCE(ent.max_nfe_monthly, 999) AS max_nfe_monthly
FROM public.empresas e
LEFT JOIN public.empresa_feature_flags ef
  ON ef.empresa_id = e.id
LEFT JOIN public.empresa_entitlements ent
  ON ent.empresa_id = e.id
WHERE EXISTS (
  SELECT 1
  FROM public.empresa_usuarios eu
  WHERE eu.empresa_id = e.id
    AND eu.user_id = public.current_user_id()
);

GRANT SELECT ON public.empresa_features TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) Billing sync: plan_slug -> (plano_mvp, max_users, max_nfe_monthly)
-- -----------------------------------------------------------------------------
-- Importante: não é permitido mudar o "return type" via CREATE OR REPLACE em funções já existentes.
-- Para evitar falha em ambientes com a versão antiga (sem max_nfe_monthly), dropamos e recriamos.
DROP FUNCTION IF EXISTS public.sync_empresa_entitlements_from_subscription(uuid);
DROP FUNCTION IF EXISTS public.billing_plan_entitlements(text);

CREATE FUNCTION public.billing_plan_entitlements(p_plan_slug text)
RETURNS TABLE(plano_mvp text, max_users integer, max_nfe_monthly integer)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
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
    end as max_users,
    case upper(coalesce(p_plan_slug,''))
      when 'ESSENCIAL' then 150
      when 'PRO'       then 500
      when 'MAX'       then 1200
      when 'INDUSTRIA' then 300
      when 'SCALE'     then 5000
      else null
    end as max_nfe_monthly
  where upper(coalesce(p_plan_slug,'')) in ('ESSENCIAL','PRO','MAX','INDUSTRIA','SCALE');
$$;

REVOKE ALL ON FUNCTION public.billing_plan_entitlements(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_plan_entitlements(text) TO authenticated, service_role, postgres;

CREATE OR REPLACE FUNCTION public.sync_empresa_entitlements_from_subscription(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_plan_slug text;
  v_plano_mvp text;
  v_max_users int;
  v_max_nfe_monthly int;
BEGIN
  IF p_empresa_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(s.plan_slug, p.slug)
  INTO v_plan_slug
  FROM public.subscriptions s
  LEFT JOIN public.plans p ON p.stripe_price_id = s.stripe_price_id
  WHERE s.empresa_id = p_empresa_id;

  IF v_plan_slug IS NULL THEN
    RETURN;
  END IF;

  SELECT e.plano_mvp, e.max_users, e.max_nfe_monthly
  INTO v_plano_mvp, v_max_users, v_max_nfe_monthly
  FROM public.billing_plan_entitlements(v_plan_slug) e;

  IF v_plano_mvp IS NULL OR v_max_users IS NULL OR v_max_nfe_monthly IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.empresa_entitlements AS ee (empresa_id, plano_mvp, max_users, max_nfe_monthly)
  VALUES (p_empresa_id, v_plano_mvp, v_max_users, v_max_nfe_monthly)
  ON CONFLICT (empresa_id) DO UPDATE
    SET plano_mvp       = excluded.plano_mvp,
        max_users       = excluded.max_users,
        max_nfe_monthly = excluded.max_nfe_monthly,
        updated_at      = now();
END;
$$;

REVOKE ALL ON FUNCTION public.sync_empresa_entitlements_from_subscription(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sync_empresa_entitlements_from_subscription(uuid) TO service_role, postgres;

-- -----------------------------------------------------------------------------
-- 5) RPC de status (para UI mostrar alertas de uso)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.finops_limits_status();
CREATE FUNCTION public.finops_limits_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_uid uuid := public.current_user_id();
  v_max_users int := 999;
  v_max_nfe int := 999;
  v_users int := 0;
  v_nfe_used int := 0;
  v_month_start timestamptz := date_trunc('month', now());
  v_month_end timestamptz := (date_trunc('month', now()) + interval '1 month');
BEGIN
  IF v_empresa IS NULL OR v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.empresa_usuarios eu
    WHERE eu.empresa_id = v_empresa AND eu.user_id = v_uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_member');
  END IF;

  SELECT coalesce(ent.max_users, 999), coalesce(ent.max_nfe_monthly, 999)
  INTO v_max_users, v_max_nfe
  FROM public.empresa_entitlements ent
  WHERE ent.empresa_id = v_empresa;

  SELECT count(*)::int INTO v_users
  FROM public.empresa_usuarios eu
  WHERE eu.empresa_id = v_empresa;

  IF to_regclass('public.fiscal_nfe_emissoes') IS NOT NULL THEN
    SELECT count(*)::int INTO v_nfe_used
    FROM public.fiscal_nfe_emissoes e
    WHERE e.empresa_id = v_empresa
      AND e.created_at >= v_month_start
      AND e.created_at < v_month_end
      AND coalesce(e.status,'rascunho') <> 'rascunho';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'month_start', v_month_start,
    'month_end', v_month_end,
    'users', jsonb_build_object(
      'current', v_users,
      'max', v_max_users,
      'remaining', greatest(v_max_users - v_users, 0),
      'at_limit', (v_users >= v_max_users)
    ),
    'nfe', jsonb_build_object(
      'used', v_nfe_used,
      'max', v_max_nfe,
      'remaining', greatest(v_max_nfe - v_nfe_used, 0),
      'at_limit', (v_nfe_used >= v_max_nfe)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finops_limits_status() FROM public;
GRANT EXECUTE ON FUNCTION public.finops_limits_status() TO authenticated, service_role;

SELECT pg_notify('pgrst','reload schema');

COMMIT;
