/*
  P1.2 (Inventário supabase.from): migrar hotspots para RPC-first (sem quebrar módulos existentes)
  - parceiros/pessoas: dedupe + endereços/contatos (evitar leitura direta por tabela)
  - empresa_usuarios: contagem por status + sair da empresa (sem delete direto da tabela)
  - unidades_medida: CRUD via RPC (primeiro foco: delete)
  - OS equipamentos: CRUD via RPC
  - produto_imagens: listar/inserir via RPC (delete/principal já existiam por RPC)
*/

BEGIN;

-- ---------------------------------------------------------------------------
-- Parceiros: dedupe (por email/telefone/celular) dentro da empresa ativa
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.pessoas_find_duplicates(text, text, text, uuid);
CREATE OR REPLACE FUNCTION public.pessoas_find_duplicates(
  p_email text DEFAULT NULL,
  p_telefone text DEFAULT NULL,
  p_celular text DEFAULT NULL,
  p_exclude_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  nome text,
  doc_unico text,
  email text,
  telefone text,
  celular text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH params AS (
    SELECT
      public.current_empresa_id() AS empresa_id,
      NULLIF(LOWER(BTRIM(COALESCE(p_email,''))), '') AS email_norm,
      NULLIF(REGEXP_REPLACE(COALESCE(p_telefone,''), '\\D', '', 'g'), '') AS tel_norm,
      NULLIF(REGEXP_REPLACE(COALESCE(p_celular,''), '\\D', '', 'g'), '') AS cel_norm,
      p_exclude_id AS exclude_id
  ),
  base AS (
    SELECT p.*
    FROM public.pessoas p
    JOIN params x ON x.empresa_id = p.empresa_id
    WHERE p.deleted_at IS NULL
      AND (x.exclude_id IS NULL OR p.id <> x.exclude_id)
  )
  SELECT
    b.id,
    b.nome,
    b.doc_unico,
    b.email,
    b.telefone,
    b.celular
  FROM base b
  JOIN params x ON TRUE
  WHERE (x.email_norm IS NOT NULL AND LOWER(COALESCE(b.email,'')) = x.email_norm)
     OR (x.tel_norm IS NOT NULL AND REGEXP_REPLACE(COALESCE(b.telefone,''), '\\D', '', 'g') = x.tel_norm)
     OR (x.cel_norm IS NOT NULL AND REGEXP_REPLACE(COALESCE(b.celular,''), '\\D', '', 'g') = x.cel_norm)
  ORDER BY b.updated_at DESC NULLS LAST, b.created_at DESC NULLS LAST
  LIMIT 20;
$$;

REVOKE ALL ON FUNCTION public.pessoas_find_duplicates(text, text, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pessoas_find_duplicates(text, text, text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Parceiros: endereços/contatos (compat com drift de nomes de tabela)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.partner_enderecos_list(uuid);
CREATE OR REPLACE FUNCTION public.partner_enderecos_list(p_pessoa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_table regclass := COALESCE(to_regclass('public.pessoa_enderecos'), to_regclass('public.pessoas_enderecos'));
  v_sql text;
  v_rows jsonb;
BEGIN
  IF public.current_empresa_id() IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF v_table IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  v_sql := format(
    'select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at asc), ''[]''::jsonb) from %s e where e.pessoa_id = $1',
    v_table::text
  );
  EXECUTE v_sql INTO v_rows USING p_pessoa_id;
  RETURN COALESCE(v_rows, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.partner_enderecos_list(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.partner_enderecos_list(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.partner_contatos_list(uuid);
CREATE OR REPLACE FUNCTION public.partner_contatos_list(p_pessoa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_table regclass := COALESCE(to_regclass('public.pessoa_contatos'), to_regclass('public.pessoas_contatos'));
  v_sql text;
  v_rows jsonb;
BEGIN
  IF public.current_empresa_id() IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF v_table IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  v_sql := format(
    'select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at asc), ''[]''::jsonb) from %s c where c.pessoa_id = $1',
    v_table::text
  );
  EXECUTE v_sql INTO v_rows USING p_pessoa_id;
  RETURN COALESCE(v_rows, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.partner_contatos_list(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.partner_contatos_list(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Empresa usuários: contagem por status (evita supabase.from head/count)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.empresa_usuarios_count_for_current_empresa(text);
CREATE OR REPLACE FUNCTION public.empresa_usuarios_count_for_current_empresa(p_status text)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COUNT(*)::int
  FROM public.empresa_usuarios eu
  WHERE eu.empresa_id = public.current_empresa_id()
    AND eu.status = p_status;
$$;

REVOKE ALL ON FUNCTION public.empresa_usuarios_count_for_current_empresa(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.empresa_usuarios_count_for_current_empresa(text) TO authenticated, service_role;

-- Sair da empresa (delete seguro do próprio vínculo)
DROP FUNCTION IF EXISTS public.empresa_leave_for_current_user(uuid);
CREATE OR REPLACE FUNCTION public.empresa_leave_for_current_user(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text;
  v_owners int;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING errcode='42501';
  END IF;

  SELECT eu.role INTO v_role
  FROM public.empresa_usuarios eu
  WHERE eu.empresa_id = p_empresa_id
    AND eu.user_id = v_user
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Vínculo não encontrado.' USING errcode='P0001';
  END IF;

  IF LOWER(v_role) = 'owner' THEN
    SELECT COUNT(*)::int INTO v_owners
    FROM public.empresa_usuarios eu
    WHERE eu.empresa_id = p_empresa_id
      AND LOWER(COALESCE(eu.role,'')) = 'owner'
      AND eu.status = 'ACTIVE';

    IF COALESCE(v_owners, 0) <= 1 THEN
      RAISE EXCEPTION 'Não é possível sair: esta empresa ficaria sem owner.' USING errcode='P0001';
    END IF;
  END IF;

  DELETE FROM public.empresa_usuarios
  WHERE empresa_id = p_empresa_id
    AND user_id = v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.empresa_leave_for_current_user(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.empresa_leave_for_current_user(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Cadastros: Unidades de medida (RPC-first)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.unidades_medida_list_for_current_user();
CREATE OR REPLACE FUNCTION public.unidades_medida_list_for_current_user()
RETURNS SETOF public.unidades_medida
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT *
  FROM public.unidades_medida
  WHERE empresa_id IS NULL OR empresa_id = public.current_empresa_id()
  ORDER BY sigla ASC;
$$;

REVOKE ALL ON FUNCTION public.unidades_medida_list_for_current_user() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.unidades_medida_list_for_current_user() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.unidades_medida_upsert_for_current_user(uuid, text, text, boolean);
CREATE OR REPLACE FUNCTION public.unidades_medida_upsert_for_current_user(
  p_id uuid DEFAULT NULL,
  p_sigla text DEFAULT NULL,
  p_descricao text DEFAULT NULL,
  p_ativo boolean DEFAULT true
)
RETURNS public.unidades_medida
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_sigla text := NULLIF(BTRIM(COALESCE(p_sigla,'')), '');
  v_desc text := NULLIF(BTRIM(COALESCE(p_descricao,'')), '');
  v_row public.unidades_medida%rowtype;
BEGIN
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode='42501';
  END IF;
  IF v_sigla IS NULL THEN
    RAISE EXCEPTION 'sigla é obrigatória' USING errcode='22004';
  END IF;
  IF v_desc IS NULL THEN
    RAISE EXCEPTION 'descrição é obrigatória' USING errcode='22004';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.unidades_medida (empresa_id, sigla, descricao, ativo)
    VALUES (v_emp, v_sigla, v_desc, COALESCE(p_ativo, true))
    RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  UPDATE public.unidades_medida
  SET sigla = v_sigla,
      descricao = v_desc,
      ativo = COALESCE(p_ativo, true),
      updated_at = now()
  WHERE id = p_id
    AND empresa_id = v_emp
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unidade não encontrada.' USING errcode='P0001';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.unidades_medida_upsert_for_current_user(uuid, text, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.unidades_medida_upsert_for_current_user(uuid, text, text, boolean) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.unidades_medida_delete_for_current_user(uuid);
CREATE OR REPLACE FUNCTION public.unidades_medida_delete_for_current_user(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
BEGIN
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode='42501';
  END IF;

  DELETE FROM public.unidades_medida
  WHERE id = p_id
    AND empresa_id = v_emp;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unidade não encontrada ou é padrão do sistema.' USING errcode='P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.unidades_medida_delete_for_current_user(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.unidades_medida_delete_for_current_user(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- OS: Equipamentos (RPC-first)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.os_equipamentos_list_for_current_user(uuid, int);
CREATE OR REPLACE FUNCTION public.os_equipamentos_list_for_current_user(
  p_cliente_id uuid,
  p_limit int DEFAULT 50
)
RETURNS SETOF public.os_equipamentos
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT *
  FROM public.os_equipamentos
  WHERE empresa_id = public.current_empresa_id()
    AND cliente_id = p_cliente_id
  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 50), 1);
$$;

REVOKE ALL ON FUNCTION public.os_equipamentos_list_for_current_user(uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.os_equipamentos_list_for_current_user(uuid, int) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.os_equipamentos_upsert_for_current_user(uuid, uuid, jsonb);
CREATE OR REPLACE FUNCTION public.os_equipamentos_upsert_for_current_user(
  p_id uuid DEFAULT NULL,
  p_cliente_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS public.os_equipamentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_modelo text := NULLIF(BTRIM(COALESCE(p_payload->>'modelo','')), '');
  v_numero_serie text := NULLIF(BTRIM(COALESCE(p_payload->>'numero_serie','')), '');
  v_imei text := NULLIF(BTRIM(COALESCE(p_payload->>'imei','')), '');
  v_acessorios text := NULLIF(BTRIM(COALESCE(p_payload->>'acessorios','')), '');
  v_obs text := NULLIF(BTRIM(COALESCE(p_payload->>'observacoes','')), '');
  v_garantia date := NULLIF(BTRIM(COALESCE(p_payload->>'garantia_ate','')), '')::date;
  v_row public.os_equipamentos%rowtype;
BEGIN
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode='42501';
  END IF;
  IF v_modelo IS NULL THEN
    RAISE EXCEPTION 'modelo é obrigatório' USING errcode='22004';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.os_equipamentos (
      empresa_id, cliente_id, modelo, numero_serie, imei, acessorios, garantia_ate, observacoes
    ) VALUES (
      v_emp, p_cliente_id, v_modelo, v_numero_serie, v_imei, v_acessorios, v_garantia, v_obs
    )
    RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  UPDATE public.os_equipamentos
  SET cliente_id = p_cliente_id,
      modelo = v_modelo,
      numero_serie = v_numero_serie,
      imei = v_imei,
      acessorios = v_acessorios,
      garantia_ate = v_garantia,
      observacoes = v_obs,
      updated_at = now()
  WHERE id = p_id
    AND empresa_id = v_emp
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Equipamento não encontrado.' USING errcode='P0001';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.os_equipamentos_upsert_for_current_user(uuid, uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.os_equipamentos_upsert_for_current_user(uuid, uuid, jsonb) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.os_equipamentos_delete_for_current_user(uuid);
CREATE OR REPLACE FUNCTION public.os_equipamentos_delete_for_current_user(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
BEGIN
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode='42501';
  END IF;

  DELETE FROM public.os_equipamentos
  WHERE id = p_id
    AND empresa_id = v_emp;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Equipamento não encontrado.' USING errcode='P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.os_equipamentos_delete_for_current_user(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.os_equipamentos_delete_for_current_user(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Produtos: Imagens (list/insert via RPC; delete/principal já existiam)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.produto_imagens_list_for_current_user(uuid);
CREATE OR REPLACE FUNCTION public.produto_imagens_list_for_current_user(p_produto_id uuid)
RETURNS SETOF public.produto_imagens
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT pi.*
  FROM public.produto_imagens pi
  JOIN public.produtos p ON p.id = pi.produto_id
  WHERE p.id = p_produto_id
    AND p.empresa_id = public.current_empresa_id()
    AND pi.empresa_id = p.empresa_id
  ORDER BY pi.principal DESC, pi.ordem ASC, pi.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.produto_imagens_list_for_current_user(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.produto_imagens_list_for_current_user(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.produto_imagens_insert_for_current_user(uuid, text, int, boolean);
CREATE OR REPLACE FUNCTION public.produto_imagens_insert_for_current_user(
  p_produto_id uuid,
  p_url text,
  p_ordem int DEFAULT 0,
  p_principal boolean DEFAULT false
)
RETURNS public.produto_imagens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_prod_id uuid;
  v_row public.produto_imagens%rowtype;
BEGIN
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'empresa_id inválido' USING errcode='42501';
  END IF;

  SELECT id INTO v_prod_id
  FROM public.produtos
  WHERE id = p_produto_id
    AND empresa_id = v_emp
  LIMIT 1;

  IF v_prod_id IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado.' USING errcode='P0001';
  END IF;

  INSERT INTO public.produto_imagens (empresa_id, produto_id, url, ordem, principal)
  VALUES (v_emp, p_produto_id, p_url, COALESCE(p_ordem, 0), COALESCE(p_principal, false))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.produto_imagens_insert_for_current_user(uuid, text, int, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.produto_imagens_insert_for_current_user(uuid, text, int, boolean) TO authenticated, service_role;

SELECT pg_notify('pgrst','reload schema');

COMMIT;
