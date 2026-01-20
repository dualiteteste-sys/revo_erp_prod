/*
  P1.2 (RPC-first): remover hotspots de `supabase.from()` (client-side) apontados no
  INVENTARIO-SUPABASE-FROM.md e em pontos de instabilidade.

  Objetivo
  - Evitar dependência de PostgREST/schema cache em telas críticas e ferramentas.
  - Garantir tenant-safety (empresa ativa) e permission/role gates quando aplicável.

  Nota
  - Para landing pública, expomos uma RPC com GRANT para `anon` e retorno mínimo.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- Helpers locais (inline): membership gate
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- Cadastros: Embalagens (RPC-first)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.embalagens_list_for_current_empresa(text, int);
CREATE OR REPLACE FUNCTION public.embalagens_list_for_current_empresa(
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 500
)
RETURNS SETOF public.embalagens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('member');

  RETURN QUERY
  SELECT e.*
  FROM public.embalagens e
  WHERE (e.empresa_id IS NULL OR e.empresa_id = v_empresa)
    AND (
      p_search IS NULL OR btrim(p_search) = ''
      OR lower(e.nome) LIKE '%'||lower(btrim(p_search))||'%'
    )
  ORDER BY e.nome ASC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.embalagens_list_for_current_empresa(text, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.embalagens_list_for_current_empresa(text, int) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.embalagens_get_for_current_empresa(uuid);
CREATE OR REPLACE FUNCTION public.embalagens_get_for_current_empresa(
  p_id uuid
)
RETURNS public.embalagens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_row public.embalagens;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('member');

  SELECT e.*
  INTO v_row
  FROM public.embalagens e
  WHERE e.id = p_id
    AND (e.empresa_id IS NULL OR e.empresa_id = v_empresa)
  LIMIT 1;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.embalagens_get_for_current_empresa(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.embalagens_get_for_current_empresa(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.embalagens_upsert_for_current_empresa(jsonb);
CREATE OR REPLACE FUNCTION public.embalagens_upsert_for_current_empresa(
  p_payload jsonb
)
RETURNS public.embalagens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_in public.embalagens;
  v_out public.embalagens;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('member');

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Payload inválido.' USING errcode='22023';
  END IF;

  v_in := jsonb_populate_record(NULL::public.embalagens, p_payload);
  v_in.empresa_id := v_empresa;

  IF v_in.id IS NULL THEN
    INSERT INTO public.embalagens (
      empresa_id,
      nome,
      tipo,
      ativo,
      largura,
      altura,
      comprimento,
      diametro,
      codigo_interno,
      unidade_base,
      capacidade_embalagem
    )
    VALUES (
      v_empresa,
      v_in.nome,
      v_in.tipo,
      COALESCE(v_in.ativo, true),
      v_in.largura,
      v_in.altura,
      v_in.comprimento,
      v_in.diametro,
      v_in.codigo_interno,
      v_in.unidade_base,
      v_in.capacidade_embalagem
    )
    RETURNING * INTO v_out;
    RETURN v_out;
  END IF;

  UPDATE public.embalagens e
  SET
    nome = COALESCE(v_in.nome, e.nome),
    tipo = COALESCE(v_in.tipo, e.tipo),
    ativo = COALESCE(v_in.ativo, e.ativo),
    largura = v_in.largura,
    altura = v_in.altura,
    comprimento = v_in.comprimento,
    diametro = v_in.diametro,
    codigo_interno = v_in.codigo_interno,
    unidade_base = v_in.unidade_base,
    capacidade_embalagem = v_in.capacidade_embalagem,
    updated_at = now()
  WHERE e.id = v_in.id
    AND e.empresa_id = v_empresa
  RETURNING * INTO v_out;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Embalagem não encontrada ou acesso negado.' USING errcode='P0002';
  END IF;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.embalagens_upsert_for_current_empresa(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.embalagens_upsert_for_current_empresa(jsonb) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.embalagens_delete_for_current_empresa(uuid);
CREATE OR REPLACE FUNCTION public.embalagens_delete_for_current_empresa(
  p_id uuid
)
RETURNS void
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

  DELETE FROM public.embalagens e
  WHERE e.id = p_id
    AND e.empresa_id = v_empresa;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Embalagem não encontrada ou acesso negado.' USING errcode='P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.embalagens_delete_for_current_empresa(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.embalagens_delete_for_current_empresa(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RBAC: overrides por usuário (RPC-first)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.user_permission_overrides_list_for_current_empresa(uuid);
CREATE OR REPLACE FUNCTION public.user_permission_overrides_list_for_current_empresa(
  p_user_id uuid
)
RETURNS SETOF public.user_permission_overrides
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

  PERFORM public.require_permission_for_current_user('usuarios','manage');

  RETURN QUERY
  SELECT u.*
  FROM public.user_permission_overrides u
  WHERE u.empresa_id = v_empresa
    AND u.user_id = p_user_id
  ORDER BY u.permission_id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.user_permission_overrides_list_for_current_empresa(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.user_permission_overrides_list_for_current_empresa(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.user_permission_overrides_upsert_for_current_empresa(uuid, uuid, boolean);
CREATE OR REPLACE FUNCTION public.user_permission_overrides_upsert_for_current_empresa(
  p_user_id uuid,
  p_permission_id uuid,
  p_allow boolean
)
RETURNS public.user_permission_overrides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_row public.user_permission_overrides;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.require_permission_for_current_user('usuarios','manage');

  INSERT INTO public.user_permission_overrides (empresa_id, user_id, permission_id, allow)
  VALUES (v_empresa, p_user_id, p_permission_id, COALESCE(p_allow, true))
  ON CONFLICT (empresa_id, user_id, permission_id)
  DO UPDATE SET allow = excluded.allow, updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.user_permission_overrides_upsert_for_current_empresa(uuid, uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.user_permission_overrides_upsert_for_current_empresa(uuid, uuid, boolean) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.user_permission_overrides_delete_for_current_empresa(uuid, uuid);
CREATE OR REPLACE FUNCTION public.user_permission_overrides_delete_for_current_empresa(
  p_user_id uuid,
  p_permission_id uuid
)
RETURNS void
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

  PERFORM public.require_permission_for_current_user('usuarios','manage');

  DELETE FROM public.user_permission_overrides u
  WHERE u.empresa_id = v_empresa
    AND u.user_id = p_user_id
    AND u.permission_id = p_permission_id;
END;
$$;

REVOKE ALL ON FUNCTION public.user_permission_overrides_delete_for_current_empresa(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.user_permission_overrides_delete_for_current_empresa(uuid, uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Logs (audit trail): listar por tabelas (RPC-first)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.audit_logs_list_for_tables(text[], int);
CREATE OR REPLACE FUNCTION public.audit_logs_list_for_tables(
  p_tables text[],
  p_limit int DEFAULT 300
)
RETURNS TABLE(
  id uuid,
  empresa_id uuid,
  table_name text,
  record_id uuid,
  operation text,
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 300), 1), 1000);
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.require_permission_for_current_user('logs','view');

  RETURN QUERY
  SELECT
    l.id,
    l.empresa_id,
    l.table_name,
    l.record_id,
    l.operation::text,
    l.old_data,
    l.new_data,
    l.changed_by,
    l.changed_at
  FROM public.audit_logs l
  WHERE l.empresa_id = v_empresa
    AND (p_tables IS NULL OR array_length(p_tables, 1) IS NULL OR l.table_name = ANY(p_tables))
  ORDER BY l.changed_at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_logs_list_for_tables(text[], int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.audit_logs_list_for_tables(text[], int) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Produtos: obter detalhes / defaults fiscais (RPC-first)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.produtos_get_for_current_user(uuid);
CREATE OR REPLACE FUNCTION public.produtos_get_for_current_user(
  p_id uuid
)
RETURNS public.produtos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_row public.produtos;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.require_permission_for_current_user('produtos','view');

  SELECT p.*
  INTO v_row
  FROM public.produtos p
  WHERE p.id = p_id
    AND p.empresa_id = v_empresa
  LIMIT 1;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.produtos_get_for_current_user(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.produtos_get_for_current_user(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.produtos_fiscal_defaults_get_for_current_user(uuid);
CREATE OR REPLACE FUNCTION public.produtos_fiscal_defaults_get_for_current_user(
  p_id uuid
)
RETURNS TABLE(
  ncm text,
  cfop_padrao text,
  cst_padrao text,
  csosn_padrao text
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

  PERFORM public.require_permission_for_current_user('produtos','view');

  RETURN QUERY
  SELECT p.ncm, p.cfop_padrao, p.cst_padrao, p.csosn_padrao
  FROM public.produtos p
  WHERE p.id = p_id
    AND p.empresa_id = v_empresa
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.produtos_fiscal_defaults_get_for_current_user(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.produtos_fiscal_defaults_get_for_current_user(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Vendedores: listar para filtro do dashboard (RPC-first)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.vendedores_list_for_current_empresa(int);
CREATE OR REPLACE FUNCTION public.vendedores_list_for_current_empresa(
  p_limit int DEFAULT 500
)
RETURNS TABLE(id uuid, nome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.require_permission_for_current_user('vendedores','view');

  RETURN QUERY
  SELECT v.id, v.nome
  FROM public.vendedores v
  WHERE v.empresa_id = v_empresa
  ORDER BY v.nome ASC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.vendedores_list_for_current_empresa(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vendedores_list_for_current_empresa(int) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Billing: empresa_addons (RPC-first para settings)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.empresa_addons_list_for_current_empresa();
CREATE OR REPLACE FUNCTION public.empresa_addons_list_for_current_empresa()
RETURNS SETOF public.empresa_addons
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
  SELECT ea.*
  FROM public.empresa_addons ea
  WHERE ea.empresa_id = v_empresa
  ORDER BY ea.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.empresa_addons_list_for_current_empresa() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.empresa_addons_list_for_current_empresa() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Indústria: hidratar nomes de usuários (profiles) de forma tenant-safe
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.profiles_names_for_current_empresa(uuid[]);
CREATE OR REPLACE FUNCTION public.profiles_names_for_current_empresa(
  p_ids uuid[]
)
RETURNS TABLE(id uuid, nome_completo text)
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
  SELECT p.id, p.nome_completo
  FROM public.profiles p
  WHERE p.id = ANY(p_ids)
    AND (
      p.id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.empresa_usuarios eu
        WHERE eu.empresa_id = v_empresa
          AND eu.user_id = p.id
      )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.profiles_names_for_current_empresa(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.profiles_names_for_current_empresa(uuid[]) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- LGPD: listar exports do usuário atual (RPC-first)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.lgpd_exports_list_for_current_user(int);
CREATE OR REPLACE FUNCTION public.lgpd_exports_list_for_current_user(
  p_limit int DEFAULT 20
)
RETURNS TABLE(
  id uuid,
  status text,
  file_path text,
  created_at timestamptz,
  completed_at timestamptz,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 200);
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;

  PERFORM public.assert_empresa_role_at_least('member');

  RETURN QUERY
  SELECT e.id, e.status::text, e.file_path, e.created_at, e.completed_at, e.error_message
  FROM public.lgpd_exports e
  WHERE e.empresa_id = v_empresa
    AND e.requester_id = auth.uid()
  ORDER BY e.created_at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.lgpd_exports_list_for_current_user(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lgpd_exports_list_for_current_user(int) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Landing pública: Addons (somente dados mínimos, sem depender de tabela via PostgREST)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.addons_public_list_active_by_slug(text);
CREATE OR REPLACE FUNCTION public.addons_public_list_active_by_slug(
  p_slug text
)
RETURNS TABLE(
  id uuid,
  slug text,
  name text,
  billing_cycle text,
  currency text,
  amount_cents int,
  trial_days int,
  active boolean,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT a.id, a.slug, a.name, a.billing_cycle, a.currency, a.amount_cents, a.trial_days, a.active, a.created_at
  FROM public.addons a
  WHERE a.active = true
    AND a.slug = p_slug
  ORDER BY a.billing_cycle ASC, a.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.addons_public_list_active_by_slug(text) FROM public;
GRANT EXECUTE ON FUNCTION public.addons_public_list_active_by_slug(text) TO anon, authenticated, service_role;

SELECT pg_notify('pgrst','reload schema');

COMMIT;
