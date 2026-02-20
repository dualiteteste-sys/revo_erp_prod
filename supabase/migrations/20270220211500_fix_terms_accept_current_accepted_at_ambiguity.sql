BEGIN;

CREATE OR REPLACE FUNCTION public.terms_accept_current(
  p_key text,
  p_origin text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS TABLE (
  acceptance_id uuid,
  accepted_at timestamptz,
  version text,
  document_sha256 text
)
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_headers json;
  v_header_val text;
  v_header_emp uuid;
  v_emp uuid := public.current_empresa_id();
  v_doc_id uuid;
  v_doc_version text;
  v_doc_sha text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'terms_accept_current: not_authenticated';
  END IF;

  BEGIN
    v_headers := current_setting('request.headers', true)::json;
    v_header_val := v_headers ->> 'x-empresa-id';
  EXCEPTION WHEN OTHERS THEN
    v_header_val := NULL;
  END;

  IF v_header_val IS NULL THEN
    RAISE EXCEPTION 'terms_accept_current: missing_x_empresa_id';
  END IF;

  BEGIN
    v_header_emp := v_header_val::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_header_emp := NULL;
  END;

  IF v_header_emp IS NULL OR v_emp IS NULL OR v_header_emp <> v_emp THEN
    RAISE EXCEPTION 'terms_accept_current: tenant_mismatch';
  END IF;

  SELECT d.id, d.version, d.body_sha256
  INTO v_doc_id, v_doc_version, v_doc_sha
  FROM public.terms_documents d
  WHERE d.key = p_key AND d.is_current = true
  LIMIT 1;

  IF v_doc_id IS NULL THEN
    RAISE EXCEPTION 'terms_accept_current: missing_terms_document';
  END IF;

  RETURN QUERY
  WITH upserted AS (
    INSERT INTO public.terms_acceptances (
      empresa_id,
      user_id,
      terms_document_id,
      accepted_at,
      origin,
      user_agent,
      document_sha256
    )
    VALUES (
      v_emp,
      auth.uid(),
      v_doc_id,
      now(),
      nullif(trim(coalesce(p_origin, '')), ''),
      nullif(trim(coalesce(p_user_agent, '')), ''),
      v_doc_sha
    )
    ON CONFLICT (empresa_id, user_id, terms_document_id) DO UPDATE
      SET accepted_at = public.terms_acceptances.accepted_at
    RETURNING
      public.terms_acceptances.id AS acceptance_id_row,
      public.terms_acceptances.accepted_at AS accepted_at_row
  )
  SELECT
    upserted.acceptance_id_row,
    upserted.accepted_at_row,
    v_doc_version,
    v_doc_sha
  FROM upserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.terms_accept_current(text, text, text) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
