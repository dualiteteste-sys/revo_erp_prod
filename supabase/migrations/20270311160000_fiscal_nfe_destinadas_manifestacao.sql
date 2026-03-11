-- Phase 4: Manifestação do Destinatário — additional columns + RPC update
BEGIN;

-- Add columns for event protocol tracking
ALTER TABLE public.fiscal_nfe_destinadas
  ADD COLUMN IF NOT EXISTS evento_protocolo text,
  ADD COLUMN IF NOT EXISTS evento_cstat text,
  ADD COLUMN IF NOT EXISTS evento_dh_registro timestamptz;

-- Update the manifestar RPC to also accept evento metadata from edge function
CREATE OR REPLACE FUNCTION public.fiscal_nfe_destinadas_manifestar(
  p_ids uuid[],
  p_status text,
  p_justificativa text DEFAULT NULL,
  p_evento_protocolo text DEFAULT NULL,
  p_evento_cstat text DEFAULT NULL,
  p_evento_dh_registro timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_updated int := 0;
  v_terminal_states text[] := ARRAY['confirmada','desconhecida','nao_realizada'];
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'EMPRESA_REQUIRED';
  END IF;

  IF p_status NOT IN ('pendente','ciencia','confirmada','desconhecida','nao_realizada','ignorada') THEN
    RAISE EXCEPTION 'INVALID_STATUS: %', p_status;
  END IF;

  -- For nao_realizada, justificativa is required (15-255 chars)
  IF p_status = 'nao_realizada' THEN
    IF p_justificativa IS NULL OR length(trim(p_justificativa)) < 15 THEN
      RAISE EXCEPTION 'JUSTIFICATIVA_REQUIRED: mínimo 15 caracteres';
    END IF;
    IF length(trim(p_justificativa)) > 255 THEN
      RAISE EXCEPTION 'JUSTIFICATIVA_TOO_LONG: máximo 255 caracteres';
    END IF;
  END IF;

  -- Update only non-terminal NF-e belonging to this empresa
  UPDATE public.fiscal_nfe_destinadas
  SET
    status = p_status,
    manifestado_em = CASE
      WHEN p_status IN ('ciencia','confirmada','desconhecida','nao_realizada') THEN now()
      ELSE manifestado_em
    END,
    justificativa = CASE
      WHEN p_status = 'nao_realizada' THEN trim(p_justificativa)
      ELSE justificativa
    END,
    evento_protocolo = COALESCE(p_evento_protocolo, evento_protocolo),
    evento_cstat = COALESCE(p_evento_cstat, evento_cstat),
    evento_dh_registro = COALESCE(p_evento_dh_registro, evento_dh_registro),
    updated_at = now()
  WHERE id = ANY(p_ids)
    AND empresa_id = v_empresa
    AND status != ALL(v_terminal_states);

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'updated', v_updated,
    'total', array_length(p_ids, 1)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fiscal_nfe_destinadas_manifestar(uuid[], text, text, text, text, timestamptz) TO authenticated;

COMMIT;
