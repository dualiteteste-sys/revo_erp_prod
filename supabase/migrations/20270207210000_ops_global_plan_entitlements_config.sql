/*
  OPS Console — Config global de entitlements por plano (Ultria)

  Objetivo:
  - Permitir que a Ultria configure, de forma global, os entitlements padrão por plano (plan_slug),
    sem precisar alterar código/migrations para cada ajuste pequeno.
  - Primeira fatia: plano_mvp (Serviços/Indústria/Ambos) + limites (max_users, max_nfe_monthly).

  Segurança:
  - Escrita/leitura do catálogo é feita por RPCs SECURITY DEFINER, guardadas por RBAC `ops/manage`.
  - A função pública `billing_plan_entitlements(plan_slug)` continua executável por authenticated,
    mas retorna apenas limites/módulos (não expõe segredos).
*/

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Tabela global: overrides de entitlements por plan_slug
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_plan_entitlements_config (
  plan_slug text PRIMARY KEY,
  plano_mvp text NOT NULL CHECK (plano_mvp IN ('servicos','industria','ambos')),
  max_users integer NOT NULL CHECK (max_users >= 1),
  max_nfe_monthly integer NOT NULL CHECK (max_nfe_monthly >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_plan_entitlements_config_updated_at_idx
  ON public.billing_plan_entitlements_config (updated_at DESC);

-- Best-effort updated_at trigger (mantém padrão do repo quando existir).
DO $$
BEGIN
  IF to_regprocedure('public.tg_set_updated_at()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS tg_billing_plan_entitlements_config_updated_at ON public.billing_plan_entitlements_config;
    CREATE TRIGGER tg_billing_plan_entitlements_config_updated_at
    BEFORE UPDATE ON public.billing_plan_entitlements_config
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
END $$;

REVOKE ALL ON TABLE public.billing_plan_entitlements_config FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Função pública: plan_slug -> entitlements (agora com override via tabela)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_plan_entitlements(p_plan_slug text)
RETURNS TABLE(plano_mvp text, max_users integer, max_nfe_monthly integer)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  with normalized as (
    select upper(trim(coalesce(p_plan_slug,''))) as plan_slug
  ),
  base as (
    select
      n.plan_slug,
      case n.plan_slug
        when 'ESSENCIAL' then 'servicos'
        when 'PRO'       then 'servicos'
        when 'MAX'       then 'servicos'
        when 'INDUSTRIA' then 'industria'
        when 'SCALE'     then 'ambos'
        else null
      end as plano_mvp,
      case n.plan_slug
        when 'ESSENCIAL' then 2
        when 'PRO'       then 5
        when 'MAX'       then 8
        when 'INDUSTRIA' then 10
        when 'SCALE'     then 999
        else null
      end as max_users,
      case n.plan_slug
        when 'ESSENCIAL' then 150
        when 'PRO'       then 500
        when 'MAX'       then 1200
        when 'INDUSTRIA' then 300
        when 'SCALE'     then 5000
        else null
      end as max_nfe_monthly
    from normalized n
    where n.plan_slug in ('ESSENCIAL','PRO','MAX','INDUSTRIA','SCALE')
  )
  select
    coalesce(cfg.plano_mvp, b.plano_mvp) as plano_mvp,
    coalesce(cfg.max_users, b.max_users) as max_users,
    coalesce(cfg.max_nfe_monthly, b.max_nfe_monthly) as max_nfe_monthly
  from base b
  left join public.billing_plan_entitlements_config cfg
    on cfg.plan_slug = b.plan_slug;
$$;

REVOKE ALL ON FUNCTION public.billing_plan_entitlements(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.billing_plan_entitlements(text) TO authenticated, service_role, postgres;

-- ---------------------------------------------------------------------------
-- 3) OPS RPCs: gerenciar overrides (RBAC ops/manage)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ops_billing_plan_entitlements_list();
CREATE FUNCTION public.ops_billing_plan_entitlements_list()
RETURNS TABLE(
  plan_slug text,
  plano_mvp text,
  max_users integer,
  max_nfe_monthly integer,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  select
    c.plan_slug,
    c.plano_mvp,
    c.max_users,
    c.max_nfe_monthly,
    c.created_at,
    c.updated_at
  from public.billing_plan_entitlements_config c
  where public.has_permission_for_current_user('ops','manage')
  order by c.plan_slug asc;
$$;

REVOKE ALL ON FUNCTION public.ops_billing_plan_entitlements_list() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_billing_plan_entitlements_list() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.ops_billing_plan_entitlements_upsert(text, text, integer, integer);
CREATE FUNCTION public.ops_billing_plan_entitlements_upsert(
  p_plan_slug text,
  p_plano_mvp text,
  p_max_users integer,
  p_max_nfe_monthly integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_slug text := upper(trim(coalesce(p_plan_slug,'')));
  v_plano text := lower(trim(coalesce(p_plano_mvp,'')));
BEGIN
  PERFORM public.require_permission_for_current_user('ops','manage');

  IF v_slug NOT IN ('ESSENCIAL','PRO','MAX','INDUSTRIA','SCALE') THEN
    RAISE EXCEPTION 'plan_slug inválido' USING errcode = '22023';
  END IF;
  IF v_plano NOT IN ('servicos','industria','ambos') THEN
    RAISE EXCEPTION 'plano_mvp inválido' USING errcode = '22023';
  END IF;
  IF p_max_users IS NULL OR p_max_users < 1 THEN
    RAISE EXCEPTION 'max_users inválido' USING errcode = '22023';
  END IF;
  IF p_max_nfe_monthly IS NULL OR p_max_nfe_monthly < 0 THEN
    RAISE EXCEPTION 'max_nfe_monthly inválido' USING errcode = '22023';
  END IF;

  INSERT INTO public.billing_plan_entitlements_config AS c (plan_slug, plano_mvp, max_users, max_nfe_monthly)
  VALUES (v_slug, v_plano, p_max_users, p_max_nfe_monthly)
  ON CONFLICT (plan_slug) DO UPDATE
    SET plano_mvp = EXCLUDED.plano_mvp,
        max_users = EXCLUDED.max_users,
        max_nfe_monthly = EXCLUDED.max_nfe_monthly,
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.ops_billing_plan_entitlements_upsert(text, text, integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_billing_plan_entitlements_upsert(text, text, integer, integer) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.ops_billing_plan_entitlements_delete(text);
CREATE FUNCTION public.ops_billing_plan_entitlements_delete(p_plan_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_slug text := upper(trim(coalesce(p_plan_slug,'')));
BEGIN
  PERFORM public.require_permission_for_current_user('ops','manage');
  DELETE FROM public.billing_plan_entitlements_config c
  WHERE c.plan_slug = v_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.ops_billing_plan_entitlements_delete(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ops_billing_plan_entitlements_delete(text) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

