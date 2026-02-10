/*
  ECOMMERCE-PR2: Base genérica de sincronização para múltiplos marketplaces

  Objetivo:
  - Introduzir estado de sincronização por conexão/provider/entidade.
  - Padronizar direção, política de conflito e agenda automática (base para PR3).
  - Expor RPCs multi-tenant para leitura/gestão sem acesso direto a tabela.
*/

BEGIN;

CREATE TABLE IF NOT EXISTS public.ecommerce_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  ecommerce_id uuid NOT NULL REFERENCES public.ecommerces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  entity text NOT NULL,
  direction text NOT NULL DEFAULT 'bidirectional',
  conflict_policy text NOT NULL DEFAULT 'erp_wins',
  auto_sync_enabled boolean NOT NULL DEFAULT false,
  sync_interval_minutes integer NOT NULL DEFAULT 15,
  cursor jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at timestamptz NULL,
  last_success_at timestamptz NULL,
  last_error_at timestamptz NULL,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ecommerce_sync_state_provider_check CHECK (provider IN ('meli','shopee','woo','custom')),
  CONSTRAINT ecommerce_sync_state_direction_check CHECK (direction IN ('erp_to_marketplace','marketplace_to_erp','bidirectional')),
  CONSTRAINT ecommerce_sync_state_conflict_policy_check CHECK (conflict_policy IN ('erp_wins','marketplace_wins','last_write_wins','manual_review')),
  CONSTRAINT ecommerce_sync_state_interval_check CHECK (sync_interval_minutes >= 5 AND sync_interval_minutes <= 1440),
  CONSTRAINT ecommerce_sync_state_entity_check CHECK (length(trim(entity)) > 0),
  CONSTRAINT ecommerce_sync_state_unique UNIQUE (ecommerce_id, entity)
);

ALTER TABLE public.ecommerce_sync_state ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tg_ecommerce_sync_state_updated_at ON public.ecommerce_sync_state;
CREATE TRIGGER tg_ecommerce_sync_state_updated_at
BEFORE UPDATE ON public.ecommerce_sync_state
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP POLICY IF EXISTS ecommerce_sync_state_select ON public.ecommerce_sync_state;
CREATE POLICY ecommerce_sync_state_select
  ON public.ecommerce_sync_state
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    AND public.has_permission_for_current_user('ecommerce','view')
  );

DROP POLICY IF EXISTS ecommerce_sync_state_write_service_role ON public.ecommerce_sync_state;
CREATE POLICY ecommerce_sync_state_write_service_role
  ON public.ecommerce_sync_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON TABLE public.ecommerce_sync_state TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.ecommerce_sync_state TO service_role;

CREATE INDEX IF NOT EXISTS idx_ecommerce_sync_state_empresa_provider
  ON public.ecommerce_sync_state (empresa_id, provider, entity);

DROP FUNCTION IF EXISTS public.ecommerce_sync_state_list(text);
CREATE FUNCTION public.ecommerce_sync_state_list(p_provider text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  ecommerce_id uuid,
  provider text,
  entity text,
  direction text,
  conflict_policy text,
  auto_sync_enabled boolean,
  sync_interval_minutes integer,
  cursor jsonb,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce','view');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;
  IF p_provider IS NOT NULL AND p_provider NOT IN ('meli','shopee','woo') THEN
    RAISE EXCEPTION 'provider inválido' USING errcode = '22023';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.ecommerce_id,
    s.provider,
    s.entity,
    s.direction,
    s.conflict_policy,
    s.auto_sync_enabled,
    s.sync_interval_minutes,
    s.cursor,
    s.last_sync_at,
    s.last_success_at,
    s.last_error_at,
    s.last_error,
    s.updated_at
  FROM public.ecommerce_sync_state s
  WHERE s.empresa_id = v_empresa
    AND (p_provider IS NULL OR s.provider = p_provider)
  ORDER BY s.provider, s.entity;
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_sync_state_list(text) FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_sync_state_list(text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.ecommerce_sync_state_upsert(uuid, text, text, text, boolean, integer, jsonb, timestamptz, timestamptz, timestamptz, text);
CREATE FUNCTION public.ecommerce_sync_state_upsert(
  p_ecommerce_id uuid,
  p_entity text,
  p_direction text DEFAULT NULL,
  p_conflict_policy text DEFAULT NULL,
  p_auto_sync_enabled boolean DEFAULT NULL,
  p_sync_interval_minutes integer DEFAULT NULL,
  p_cursor jsonb DEFAULT NULL,
  p_last_sync_at timestamptz DEFAULT NULL,
  p_last_success_at timestamptz DEFAULT NULL,
  p_last_error_at timestamptz DEFAULT NULL,
  p_last_error text DEFAULT NULL
)
RETURNS public.ecommerce_sync_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_provider text;
  v_entity text := nullif(trim(coalesce(p_entity, '')), '');
  v_row public.ecommerce_sync_state;
BEGIN
  PERFORM public.require_permission_for_current_user('ecommerce','manage');

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode = '42501';
  END IF;
  IF p_ecommerce_id IS NULL THEN
    RAISE EXCEPTION 'ecommerce_id inválido' USING errcode = '22023';
  END IF;
  IF v_entity IS NULL THEN
    RAISE EXCEPTION 'entity inválida' USING errcode = '22023';
  END IF;

  SELECT e.provider
    INTO v_provider
  FROM public.ecommerces e
  WHERE e.id = p_ecommerce_id
    AND e.empresa_id = v_empresa
  LIMIT 1;

  IF v_provider IS NULL THEN
    RAISE EXCEPTION 'Conexão não encontrada' USING errcode = 'P0002';
  END IF;

  INSERT INTO public.ecommerce_sync_state (
    empresa_id,
    ecommerce_id,
    provider,
    entity,
    direction,
    conflict_policy,
    auto_sync_enabled,
    sync_interval_minutes,
    cursor,
    last_sync_at,
    last_success_at,
    last_error_at,
    last_error
  )
  VALUES (
    v_empresa,
    p_ecommerce_id,
    v_provider,
    v_entity,
    COALESCE(p_direction, 'bidirectional'),
    COALESCE(p_conflict_policy, 'erp_wins'),
    COALESCE(p_auto_sync_enabled, false),
    COALESCE(p_sync_interval_minutes, 15),
    COALESCE(p_cursor, '{}'::jsonb),
    p_last_sync_at,
    p_last_success_at,
    p_last_error_at,
    nullif(trim(coalesce(p_last_error, '')), '')
  )
  ON CONFLICT (ecommerce_id, entity)
  DO UPDATE SET
    provider = EXCLUDED.provider,
    direction = COALESCE(p_direction, public.ecommerce_sync_state.direction),
    conflict_policy = COALESCE(p_conflict_policy, public.ecommerce_sync_state.conflict_policy),
    auto_sync_enabled = COALESCE(p_auto_sync_enabled, public.ecommerce_sync_state.auto_sync_enabled),
    sync_interval_minutes = COALESCE(p_sync_interval_minutes, public.ecommerce_sync_state.sync_interval_minutes),
    cursor = COALESCE(p_cursor, public.ecommerce_sync_state.cursor),
    last_sync_at = COALESCE(p_last_sync_at, public.ecommerce_sync_state.last_sync_at),
    last_success_at = COALESCE(p_last_success_at, public.ecommerce_sync_state.last_success_at),
    last_error_at = COALESCE(p_last_error_at, public.ecommerce_sync_state.last_error_at),
    last_error = COALESCE(nullif(trim(coalesce(p_last_error, '')), ''), public.ecommerce_sync_state.last_error),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_sync_state_upsert(uuid, text, text, text, boolean, integer, jsonb, timestamptz, timestamptz, timestamptz, text) FROM public;
GRANT EXECUTE ON FUNCTION public.ecommerce_sync_state_upsert(uuid, text, text, text, boolean, integer, jsonb, timestamptz, timestamptz, timestamptz, text) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
