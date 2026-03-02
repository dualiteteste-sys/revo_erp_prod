-- ============================================================================
-- Fix: partners_search_match was incorrectly declared IMMUTABLE
-- ============================================================================
-- Root cause: migration 20270301120000 introduced public.unaccent() calls
-- inside partners_search_match but kept it IMMUTABLE.
-- PostgreSQL's IMMUTABLE contract forbids calling STABLE/VOLATILE functions.
-- unaccent() is STABLE, so calling it from IMMUTABLE causes PostgreSQL to
-- constant-fold the call at plan time with empty arguments → unaccent('') = ''
-- → '%' || '' || '%' = '%%' → every row matches → search filter is broken.
--
-- Fix: declare the function as STABLE (the correct volatility when calling
-- any STABLE function like unaccent).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.partners_search_match(p_row public.pessoas, p_q text)
RETURNS boolean
LANGUAGE plpgsql
STABLE  -- was IMMUTABLE: calling unaccent() (STABLE) from IMMUTABLE is illegal
AS $$
DECLARE
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  v_digits text;
  v_uq text;
BEGIN
  IF v_q IS NULL THEN
    RETURN true;
  END IF;

  v_digits := regexp_replace(v_q, '\D', '', 'g');
  v_uq := public.unaccent(v_q);

  RETURN (
    public.unaccent(p_row.nome) ILIKE '%' || v_uq || '%'
    OR public.unaccent(coalesce(p_row.fantasia,'')) ILIKE '%' || v_uq || '%'
    OR public.unaccent(coalesce(p_row.email,'')) ILIKE '%' || v_uq || '%'
    OR coalesce(p_row.doc_unico,'') ILIKE '%' || v_digits || '%'
    OR coalesce(p_row.telefone,'') ILIKE '%' || v_digits || '%'
    OR coalesce(p_row.celular,'') ILIKE '%' || v_digits || '%'
  );
END;
$$;
