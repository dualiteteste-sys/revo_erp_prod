-- =============================================================================
-- APS v1 (Capacidade finita): calendário semanal por Centro de Trabalho
-- =============================================================================

BEGIN;

-- 1) Calendário semanal: capacidade (horas) por dia da semana (0=Dom .. 6=Sáb)
CREATE TABLE IF NOT EXISTS public.industria_ct_calendario_semana (
  empresa_id uuid NOT NULL,
  centro_trabalho_id uuid NOT NULL,
  dow smallint NOT NULL CHECK (dow BETWEEN 0 AND 6),
  capacidade_horas numeric NOT NULL DEFAULT 0 CHECK (capacidade_horas >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, centro_trabalho_id, dow),
  CONSTRAINT industria_ct_cal_semana_ct_fk FOREIGN KEY (centro_trabalho_id)
    REFERENCES public.industria_centros_trabalho(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_industria_ct_cal_semana_empresa_ct
  ON public.industria_ct_calendario_semana (empresa_id, centro_trabalho_id);

-- 2) Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_industria_ct_cal_semana_updated_at ON public.industria_ct_calendario_semana;
CREATE TRIGGER tg_industria_ct_cal_semana_updated_at
BEFORE UPDATE ON public.industria_ct_calendario_semana
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

-- 3) RPCs (SECURITY DEFINER): leitura e upsert do calendário
DROP FUNCTION IF EXISTS public.industria_ct_calendario_get(uuid);
CREATE OR REPLACE FUNCTION public.industria_ct_calendario_get(p_centro_id uuid)
RETURNS TABLE (
  dow smallint,
  capacidade_horas numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  RETURN QUERY
  SELECT c.dow, c.capacidade_horas
  FROM public.industria_ct_calendario_semana c
  WHERE c.empresa_id = v_empresa_id
    AND c.centro_trabalho_id = p_centro_id
  ORDER BY c.dow;
END;
$$;

DROP FUNCTION IF EXISTS public.industria_ct_calendario_upsert(uuid, jsonb);
CREATE OR REPLACE FUNCTION public.industria_ct_calendario_upsert(
  p_centro_id uuid,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'array' THEN
    RAISE EXCEPTION 'Payload inválido: esperado array JSON.';
  END IF;

  INSERT INTO public.industria_ct_calendario_semana (empresa_id, centro_trabalho_id, dow, capacidade_horas)
  SELECT
    v_empresa_id,
    p_centro_id,
    (item->>'dow')::smallint,
    COALESCE((item->>'capacidade_horas')::numeric, 0)
  FROM jsonb_array_elements(p_payload) AS item
  ON CONFLICT (empresa_id, centro_trabalho_id, dow)
  DO UPDATE SET
    capacidade_horas = EXCLUDED.capacidade_horas,
    updated_at = now();
END;
$$;

COMMIT;

