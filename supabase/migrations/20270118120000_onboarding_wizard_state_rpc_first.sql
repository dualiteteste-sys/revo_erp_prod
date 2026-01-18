/*
  P1.2 (RPC-first): Onboarding/Roadmap wizard state
  - Remove acesso direto do client à tabela `public.empresa_onboarding`
  - Fornece RPCs tenant-safe para ler/gravar progresso do assistente
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- Grants: bloquear acesso direto do client (RPC-only)
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.empresa_onboarding FROM authenticated;
REVOKE ALL ON TABLE public.empresa_onboarding FROM anon;
REVOKE ALL ON TABLE public.empresa_onboarding FROM public;

-- -----------------------------------------------------------------------------
-- 1) Get state (member) — também garante que a linha exista
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.onboarding_wizard_state_get();

CREATE OR REPLACE FUNCTION public.onboarding_wizard_state_get()
RETURNS TABLE(
  empresa_id uuid,
  wizard_dismissed_at timestamptz,
  last_step_key text,
  steps jsonb
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

  IF NOT EXISTS (SELECT 1 FROM public.empresa_onboarding eo WHERE eo.empresa_id = v_empresa) THEN
    INSERT INTO public.empresa_onboarding (empresa_id)
    VALUES (v_empresa)
    ON CONFLICT (empresa_id) DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT eo.empresa_id, eo.wizard_dismissed_at, eo.last_step_key, eo.steps
  FROM public.empresa_onboarding eo
  WHERE eo.empresa_id = v_empresa;
END;
$$;

REVOKE ALL ON FUNCTION public.onboarding_wizard_state_get() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.onboarding_wizard_state_get() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) Upsert state (member)
-- - `p_steps`: quando informado, por padrão faz merge no JSON (||) para preservar outras chaves
-- - `p_replace_steps`: quando true, substitui `steps` por completo
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.onboarding_wizard_state_upsert(timestamptz, text, jsonb, boolean);

CREATE OR REPLACE FUNCTION public.onboarding_wizard_state_upsert(
  p_wizard_dismissed_at timestamptz DEFAULT NULL,
  p_last_step_key text DEFAULT NULL,
  p_steps jsonb DEFAULT NULL,
  p_replace_steps boolean DEFAULT false
)
RETURNS TABLE(
  empresa_id uuid,
  wizard_dismissed_at timestamptz,
  last_step_key text,
  steps jsonb
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

  RETURN QUERY
  INSERT INTO public.empresa_onboarding (empresa_id, wizard_dismissed_at, last_step_key, steps, updated_by)
  VALUES (
    v_empresa,
    p_wizard_dismissed_at,
    NULLIF(btrim(COALESCE(p_last_step_key, '')), ''),
    COALESCE(p_steps, '{}'::jsonb),
    auth.uid()
  )
  ON CONFLICT (empresa_id) DO UPDATE
  SET
    wizard_dismissed_at = COALESCE(EXCLUDED.wizard_dismissed_at, public.empresa_onboarding.wizard_dismissed_at),
    last_step_key = COALESCE(EXCLUDED.last_step_key, public.empresa_onboarding.last_step_key),
    steps = CASE
      WHEN p_steps IS NULL THEN public.empresa_onboarding.steps
      WHEN p_replace_steps THEN EXCLUDED.steps
      ELSE public.empresa_onboarding.steps || EXCLUDED.steps
    END,
    updated_by = auth.uid(),
    updated_at = now()
  RETURNING
    public.empresa_onboarding.empresa_id,
    public.empresa_onboarding.wizard_dismissed_at,
    public.empresa_onboarding.last_step_key,
    public.empresa_onboarding.steps;
END;
$$;

REVOKE ALL ON FUNCTION public.onboarding_wizard_state_upsert(timestamptz, text, jsonb, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.onboarding_wizard_state_upsert(timestamptz, text, jsonb, boolean) TO authenticated, service_role;

SELECT pg_notify('pgrst','reload schema');

COMMIT;

