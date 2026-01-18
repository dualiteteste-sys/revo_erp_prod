/*
  P0/P1 (multi-tenant stability): empresa_features via RPC (RPC-first)
  - O client usa `empresa_features` para gating de módulos (industria/servicos, limites etc.).
  - Acesso direto via PostgREST pode falhar por cache/RLS timing e virar instabilidade.
  - Migramos para RPCs tenant-safe, e revogamos acesso direto do client.
*/

BEGIN;

-- Bloquear acesso direto do client (RPC-only).
REVOKE ALL ON TABLE public.empresa_features FROM authenticated;
REVOKE ALL ON TABLE public.empresa_features FROM anon;
REVOKE ALL ON TABLE public.empresa_features FROM public;

-- 1) Get (member) — garante row default.
DROP FUNCTION IF EXISTS public.empresa_features_get();

CREATE OR REPLACE FUNCTION public.empresa_features_get()
RETURNS TABLE(
  revo_send_enabled boolean,
  nfe_emissao_enabled boolean,
  plano_mvp text,
  max_users int,
  max_nfe_monthly int,
  servicos_enabled boolean,
  industria_enabled boolean,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('member');

  IF NOT EXISTS (SELECT 1 FROM public.empresa_features f WHERE f.empresa_id = v_empresa) THEN
    INSERT INTO public.empresa_features (empresa_id)
    VALUES (v_empresa)
    ON CONFLICT (empresa_id) DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT
    f.revo_send_enabled,
    f.nfe_emissao_enabled,
    f.plano_mvp::text,
    f.max_users,
    f.max_nfe_monthly,
    f.servicos_enabled,
    f.industria_enabled,
    f.updated_at
  FROM public.empresa_features f
  WHERE f.empresa_id = v_empresa;
END;
$$;

REVOKE ALL ON FUNCTION public.empresa_features_get() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.empresa_features_get() TO authenticated, service_role;

-- 2) Set (admin) — alterações manuais de flags/limites quando aplicável.
DROP FUNCTION IF EXISTS public.empresa_features_set(jsonb);

CREATE OR REPLACE FUNCTION public.empresa_features_set(
  p_patch jsonb
)
RETURNS TABLE(
  revo_send_enabled boolean,
  nfe_emissao_enabled boolean,
  plano_mvp text,
  max_users int,
  max_nfe_monthly int,
  servicos_enabled boolean,
  industria_enabled boolean,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('admin');

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Payload inválido.' USING errcode='22023';
  END IF;

  -- Garantir row existe
  IF NOT EXISTS (SELECT 1 FROM public.empresa_features f WHERE f.empresa_id = v_empresa) THEN
    INSERT INTO public.empresa_features (empresa_id)
    VALUES (v_empresa)
    ON CONFLICT (empresa_id) DO NOTHING;
  END IF;

  UPDATE public.empresa_features f
  SET
    -- Permitimos somente campos explícitos; os demais permanecem.
    revo_send_enabled = COALESCE((p_patch->>'revo_send_enabled')::boolean, f.revo_send_enabled),
    nfe_emissao_enabled = COALESCE((p_patch->>'nfe_emissao_enabled')::boolean, f.nfe_emissao_enabled),
    plano_mvp = COALESCE(NULLIF(btrim(p_patch->>'plano_mvp'), '')::public.plano_mvp, f.plano_mvp),
    max_users = COALESCE(NULLIF(p_patch->>'max_users','')::int, f.max_users),
    max_nfe_monthly = COALESCE(NULLIF(p_patch->>'max_nfe_monthly','')::int, f.max_nfe_monthly),
    servicos_enabled = COALESCE((p_patch->>'servicos_enabled')::boolean, f.servicos_enabled),
    industria_enabled = COALESCE((p_patch->>'industria_enabled')::boolean, f.industria_enabled),
    updated_at = now(),
    updated_by = auth.uid()
  WHERE f.empresa_id = v_empresa;

  RETURN QUERY
  SELECT
    f.revo_send_enabled,
    f.nfe_emissao_enabled,
    f.plano_mvp::text,
    f.max_users,
    f.max_nfe_monthly,
    f.servicos_enabled,
    f.industria_enabled,
    f.updated_at
  FROM public.empresa_features f
  WHERE f.empresa_id = v_empresa;
END;
$$;

REVOKE ALL ON FUNCTION public.empresa_features_set(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.empresa_features_set(jsonb) TO authenticated, service_role;

SELECT pg_notify('pgrst','reload schema');

COMMIT;

