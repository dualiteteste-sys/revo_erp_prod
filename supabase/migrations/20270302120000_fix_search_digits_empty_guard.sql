-- ============================================================================
-- Fix: search RPCs showing unrelated results when search term has no digits
-- ============================================================================
-- Root cause: migration 20270301120000 changed the digit-extraction regex from
-- '\\D' to '\D'. With standard_conforming_strings=on (Supabase default):
--   '\D'  → regex pattern \D → correctly removes all non-digits
--   '\\D' → regex pattern \\D → matches literal \D sequences → removes nothing
--
-- Because '\D' correctly removes non-digits, when the search term has NO digits
-- (e.g., "Meta serviços"), v_digits becomes '' (empty string).
-- Then:  coalesce(doc_unico,'') ILIKE '%' || '' || '%'
--      = coalesce(doc_unico,'') ILIKE '%%'
--      = TRUE for EVERY row
-- The OR condition causes ALL clients to match regardless of the name filter.
--
-- Fix: use NULLIF(regexp_replace(...), '') so v_digits is NULL (not '') when
-- the search term has no digits, and guard the filter with IS NOT NULL.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. search_clients_for_current_user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_clients_for_current_user(
  p_search text,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  label text,
  nome text,
  doc_unico text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_q      text := nullif(trim(coalesce(p_search, '')), '');
  -- Extract digits only; NULLIF converts empty-string (no digits) to NULL
  -- so the digit-based filters are skipped entirely for text-only searches,
  -- preventing the '%%' wildcard that matched every record.
  v_digits text := nullif(regexp_replace(coalesce(p_search, ''), '\D', '', 'g'), '');
  v_uq     text;
BEGIN
  IF v_q IS NULL THEN
    RETURN;
  END IF;

  v_uq := public.unaccent(v_q);

  RETURN QUERY
  SELECT
    p.id,
    (p.nome || CASE WHEN p.doc_unico IS NOT NULL AND p.doc_unico <> '' THEN ' - ' || p.doc_unico ELSE '' END) AS label,
    p.nome,
    p.doc_unico
  FROM public.pessoas p
  WHERE p.empresa_id = public.current_empresa_id()
    AND p.deleted_at IS NULL
    AND p.tipo IN ('cliente'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo)
    AND (
      public.unaccent(p.nome) ILIKE '%' || v_uq || '%'
      OR public.unaccent(coalesce(p.fantasia, '')) ILIKE '%' || v_uq || '%'
      -- Only filter by doc_unico when the search term actually contains digits
      OR (v_digits IS NOT NULL AND coalesce(p.doc_unico, '') LIKE '%' || v_digits || '%')
    )
  ORDER BY p.nome ASC
  LIMIT greatest(p_limit, 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. search_suppliers_for_current_user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_suppliers_for_current_user(
  p_search text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (id uuid, nome text, doc_unico text, label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id uuid := public.current_empresa_id();
  v_uq         text;
  v_digits     text := nullif(regexp_replace(coalesce(p_search, ''), '\D', '', 'g'), '');
BEGIN
  IF p_search IS NULL OR trim(p_search) = '' THEN
    RETURN;
  END IF;

  v_uq := public.unaccent(coalesce(p_search, ''));

  RETURN QUERY
  SELECT
    p.id,
    p.nome,
    p.doc_unico,
    (p.nome || coalesce(' (' || p.doc_unico || ')', '')) AS label
  FROM public.pessoas p
  WHERE p.empresa_id = v_empresa_id
    AND p.deleted_at IS NULL
    AND (p.tipo = 'fornecedor' OR p.tipo = 'ambos')
    AND (
      public.unaccent(p.nome) ILIKE '%' || v_uq || '%'
      -- Only filter by doc_unico when the search term actually contains digits
      OR (v_digits IS NOT NULL AND coalesce(p.doc_unico, '') LIKE '%' || v_digits || '%')
    )
  ORDER BY p.nome ASC
  LIMIT p_limit;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. partners_search_match — also fix v_digits guard for consistency
--    (was using '\\D' which didn't extract digits correctly, now uses NULLIF)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partners_search_match(p_row public.pessoas, p_q text)
RETURNS boolean
LANGUAGE plpgsql
STABLE  -- STABLE: calls public.unaccent() which is STABLE (cannot be IMMUTABLE)
AS $$
DECLARE
  v_q      text := nullif(trim(coalesce(p_q, '')), '');
  -- Extract digits only; NULLIF converts empty-string (no digits) to NULL
  v_digits text;
  v_uq     text;
BEGIN
  IF v_q IS NULL THEN
    RETURN true;
  END IF;

  v_digits := nullif(regexp_replace(v_q, '\D', '', 'g'), '');
  v_uq     := public.unaccent(v_q);

  RETURN (
    public.unaccent(p_row.nome) ILIKE '%' || v_uq || '%'
    OR public.unaccent(coalesce(p_row.fantasia, '')) ILIKE '%' || v_uq || '%'
    OR public.unaccent(coalesce(p_row.email, '')) ILIKE '%' || v_uq || '%'
    -- Only apply digit-based filters when the search term contains digits
    OR (v_digits IS NOT NULL AND coalesce(p_row.doc_unico, '') LIKE '%' || v_digits || '%')
    OR (v_digits IS NOT NULL AND coalesce(p_row.telefone, '') LIKE '%' || v_digits || '%')
    OR (v_digits IS NOT NULL AND coalesce(p_row.celular, '') LIKE '%' || v_digits || '%')
  );
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'Fix: search digit-empty guard applied to search_clients, search_suppliers, partners_search_match.';
END $$;
