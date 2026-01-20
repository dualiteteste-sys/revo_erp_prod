/*
  SEC: RPC-first (piloto) — vendedores
  - Remove acesso direto a tabela public.vendedores (authenticated)
  - Fornece RPCs para CRUD e listagem (com permission checks)
  - Mantém RPC existente vendedores_list_for_current_empresa(int) para filtros (dashboard)
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- Vendedores: listagem completa (RPC-first)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.vendedores_list_full_for_current_empresa(text, boolean, int);
CREATE OR REPLACE FUNCTION public.vendedores_list_full_for_current_empresa(
  p_q text DEFAULT NULL,
  p_ativo_only boolean DEFAULT false,
  p_limit int DEFAULT 500
)
RETURNS SETOF public.vendedores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_q text := NULLIF(btrim(COALESCE(p_q, '')), '');
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.require_permission_for_current_user('vendedores','view');

  RETURN QUERY
  SELECT v.*
  FROM public.vendedores v
  WHERE v.empresa_id = v_empresa
    AND (p_ativo_only IS NOT TRUE OR v.ativo IS TRUE)
    AND (v_q IS NULL OR v.nome ILIKE ('%' || v_q || '%'))
  ORDER BY v.nome ASC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.vendedores_list_full_for_current_empresa(text, boolean, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vendedores_list_full_for_current_empresa(text, boolean, int) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Vendedores: get (RPC-first)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.vendedores_get_for_current_empresa(uuid);
CREATE OR REPLACE FUNCTION public.vendedores_get_for_current_empresa(
  p_id uuid
)
RETURNS public.vendedores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_row public.vendedores;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'ID inválido.' USING errcode='22023';
  END IF;

  PERFORM public.require_permission_for_current_user('vendedores','view');

  SELECT v.*
  INTO v_row
  FROM public.vendedores v
  WHERE v.id = p_id
    AND v.empresa_id = v_empresa
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Vendedor não encontrado.' USING errcode='P0001';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.vendedores_get_for_current_empresa(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vendedores_get_for_current_empresa(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Vendedores: upsert (RPC-first)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.vendedores_upsert_for_current_empresa(uuid, text, text, text, numeric, boolean, text);
CREATE OR REPLACE FUNCTION public.vendedores_upsert_for_current_empresa(
  p_id uuid DEFAULT NULL,
  p_nome text,
  p_email text DEFAULT NULL,
  p_telefone text DEFAULT NULL,
  p_comissao_percent numeric DEFAULT NULL,
  p_ativo boolean DEFAULT true,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.vendedores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_nome text := NULLIF(btrim(COALESCE(p_nome, '')), '');
  v_email text := NULLIF(btrim(COALESCE(p_email, '')), '');
  v_tel text := NULLIF(btrim(COALESCE(p_telefone, '')), '');
  v_comissao numeric := COALESCE(p_comissao_percent, 0);
  v_ativo boolean := COALESCE(p_ativo, true);
  v_idemp text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_row public.vendedores;
  v_is_create boolean := (p_id IS NULL);
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  IF v_is_create THEN
    PERFORM public.require_permission_for_current_user('vendedores','create');
  ELSE
    PERFORM public.require_permission_for_current_user('vendedores','update');
  END IF;

  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Nome é obrigatório.' USING errcode='22023';
  END IF;
  IF v_comissao < 0 OR v_comissao > 100 THEN
    RAISE EXCEPTION 'Comissão inválida (0–100).' USING errcode='22023';
  END IF;

  -- Best-effort: evita double-submit criar duplicado
  IF v_idemp IS NOT NULL THEN
    IF NOT public.idempotency_try_acquire(v_idemp, 'vendedores_upsert', interval '24 hours') THEN
      RAISE EXCEPTION 'Requisição duplicada. Tente novamente.' USING errcode='P0001';
    END IF;
  END IF;

  IF v_is_create THEN
    INSERT INTO public.vendedores (empresa_id, nome, email, telefone, comissao_percent, ativo)
    VALUES (v_empresa, v_nome, v_email, v_tel, v_comissao, v_ativo)
    RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  UPDATE public.vendedores v
  SET
    nome = v_nome,
    email = v_email,
    telefone = v_tel,
    comissao_percent = v_comissao,
    ativo = v_ativo,
    updated_at = now()
  WHERE v.id = p_id
    AND v.empresa_id = v_empresa
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Vendedor não encontrado.' USING errcode='P0001';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.vendedores_upsert_for_current_empresa(uuid, text, text, text, numeric, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vendedores_upsert_for_current_empresa(uuid, text, text, text, numeric, boolean, text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Vendedores: delete (RPC-first)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.vendedores_delete_for_current_empresa(uuid);
CREATE OR REPLACE FUNCTION public.vendedores_delete_for_current_empresa(
  p_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_count int := 0;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'ID inválido.' USING errcode='22023';
  END IF;

  PERFORM public.require_permission_for_current_user('vendedores','delete');

  DELETE FROM public.vendedores v
  WHERE v.id = p_id
    AND v.empresa_id = v_empresa;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <= 0 THEN
    RAISE EXCEPTION 'Vendedor não encontrado.' USING errcode='P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.vendedores_delete_for_current_empresa(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vendedores_delete_for_current_empresa(uuid) TO authenticated, service_role;

-- Remove acesso direto via PostgREST (RPC-first)
REVOKE ALL ON TABLE public.vendedores FROM public;
REVOKE ALL ON TABLE public.vendedores FROM anon;
REVOKE ALL ON TABLE public.vendedores FROM authenticated;
GRANT ALL ON TABLE public.vendedores TO service_role;

SELECT pg_notify('pgrst','reload schema');

COMMIT;

