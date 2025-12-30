/*
  SEC-01/SEC-02 (baseline):
  - Define módulos de permissão para "partners" e "suprimentos"
  - Enforce em RPCs SECURITY DEFINER (anti-burla via console)
  - Mantém compat: renomeia implementações existentes para _* e cria wrappers com guard
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) RBAC: novos módulos (idempotente)
-- -----------------------------------------------------------------------------
INSERT INTO public.permissions(module, action) VALUES
  ('partners','view'),('partners','create'),('partners','update'),('partners','delete'),('partners','manage'),
  ('suprimentos','view'),('suprimentos','create'),('suprimentos','update'),('suprimentos','delete'),('suprimentos','manage')
ON CONFLICT (module, action) DO NOTHING;

-- OWNER/ADMIN: sempre tudo liberado (inclui novos módulos)
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p ON true
WHERE r.slug IN ('OWNER','ADMIN')
ON CONFLICT DO NOTHING;

-- MEMBER: CRUD em partners + suprimentos (MVP)
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p
  ON (
    (p.module='partners' and p.action in ('view','create','update','delete'))
    or (p.module='suprimentos' and p.action in ('view','create','update'))
  )
WHERE r.slug = 'MEMBER'
ON CONFLICT DO NOTHING;

-- OPS: CRUD leve em suprimentos + leitura partners
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p
  ON (
    (p.module='partners' and p.action='view')
    or (p.module='suprimentos' and p.action in ('view','create','update'))
  )
WHERE r.slug = 'OPS'
ON CONFLICT DO NOTHING;

-- FINANCE: leitura partners + suprimentos view (para relatórios/consulta)
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p
  ON (
    (p.module='partners' and p.action='view')
    or (p.module='suprimentos' and p.action='view')
  )
WHERE r.slug = 'FINANCE'
ON CONFLICT DO NOTHING;

-- VIEWER: somente leitura
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p
  ON (
    (p.module in ('partners','suprimentos') and p.action='view')
  )
WHERE r.slug = 'VIEWER'
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2) Enforce: Partners RPCs
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('public.list_partners_v2(text, public.pessoa_tipo, text, integer, integer, text, text)') IS NOT NULL
     AND to_regprocedure('public._list_partners_v2(text, public.pessoa_tipo, text, integer, integer, text, text)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.list_partners_v2(text, public.pessoa_tipo, text, integer, integer, text, text) RENAME TO _list_partners_v2';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.list_partners_v2(
  p_search text DEFAULT NULL,
  p_tipo public.pessoa_tipo DEFAULT NULL,
  p_status text DEFAULT 'active',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_order_by text DEFAULT 'nome',
  p_order_dir text DEFAULT 'asc'
)
RETURNS SETOF public.pessoas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('partners','view');
  RETURN QUERY SELECT * FROM public._list_partners_v2(p_search, p_tipo, p_status, p_limit, p_offset, p_order_by, p_order_dir);
END;
$$;
REVOKE ALL ON FUNCTION public.list_partners_v2(text, public.pessoa_tipo, text, integer, integer, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.list_partners_v2(text, public.pessoa_tipo, text, integer, integer, text, text) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.count_partners_v2(text, public.pessoa_tipo, text)') IS NOT NULL
     AND to_regprocedure('public._count_partners_v2(text, public.pessoa_tipo, text)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.count_partners_v2(text, public.pessoa_tipo, text) RENAME TO _count_partners_v2';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.count_partners_v2(
  p_search text DEFAULT NULL,
  p_tipo public.pessoa_tipo DEFAULT NULL,
  p_status text DEFAULT 'active'
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('partners','view');
  RETURN public._count_partners_v2(p_search, p_tipo, p_status);
END;
$$;
REVOKE ALL ON FUNCTION public.count_partners_v2(text, public.pessoa_tipo, text) FROM public;
GRANT EXECUTE ON FUNCTION public.count_partners_v2(text, public.pessoa_tipo, text) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.get_partner_details(uuid)') IS NOT NULL
     AND to_regprocedure('public._get_partner_details(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.get_partner_details(uuid) RENAME TO _get_partner_details';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.get_partner_details(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('partners','view');
  RETURN public._get_partner_details(p_id);
END;
$$;
REVOKE ALL ON FUNCTION public.get_partner_details(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_partner_details(uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.create_update_partner(jsonb)') IS NOT NULL
     AND to_regprocedure('public._create_update_partner(jsonb)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.create_update_partner(jsonb) RENAME TO _create_update_partner';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.create_update_partner(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  v_id := nullif(p_payload #>> '{pessoa,id}', '')::uuid;
  IF v_id IS NULL THEN
    PERFORM public.require_permission_for_current_user('partners','create');
  ELSE
    PERFORM public.require_permission_for_current_user('partners','update');
  END IF;
  RETURN public._create_update_partner(p_payload);
END;
$$;
REVOKE ALL ON FUNCTION public.create_update_partner(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.create_update_partner(jsonb) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.delete_partner(uuid)') IS NOT NULL
     AND to_regprocedure('public._delete_partner(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.delete_partner(uuid) RENAME TO _delete_partner';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.delete_partner(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('partners','delete');
  PERFORM public._delete_partner(p_id);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_partner(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_partner(uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.restore_partner(uuid)') IS NOT NULL
     AND to_regprocedure('public._restore_partner(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.restore_partner(uuid) RENAME TO _restore_partner';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.restore_partner(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('partners','update');
  PERFORM public._restore_partner(p_id);
END;
$$;
REVOKE ALL ON FUNCTION public.restore_partner(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.restore_partner(uuid) TO authenticated, service_role;

-- Seed partners: apenas admin/owner via manage
DO $$
BEGIN
  IF to_regprocedure('public.seed_partners_for_current_user()') IS NOT NULL
     AND to_regprocedure('public._seed_partners_for_current_user()') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.seed_partners_for_current_user() RENAME TO _seed_partners_for_current_user';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.seed_partners_for_current_user()
RETURNS SETOF public.pessoas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('partners','manage');
  RETURN QUERY SELECT * FROM public._seed_partners_for_current_user();
END;
$$;
REVOKE ALL ON FUNCTION public.seed_partners_for_current_user() FROM public;
GRANT EXECUTE ON FUNCTION public.seed_partners_for_current_user() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) Enforce: Suprimentos/Estoque RPCs
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.suprimentos_list_posicao_estoque(text, boolean)') IS NOT NULL
     AND to_regprocedure('public._suprimentos_list_posicao_estoque(text, boolean)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.suprimentos_list_posicao_estoque(text, boolean) RENAME TO _suprimentos_list_posicao_estoque';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.suprimentos_list_posicao_estoque(
  p_search text DEFAULT NULL,
  p_baixo_estoque boolean DEFAULT false
)
RETURNS TABLE (
  produto_id uuid,
  nome text,
  sku text,
  unidade text,
  saldo numeric,
  custo_medio numeric,
  estoque_min numeric,
  status_estoque text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('suprimentos','view');
  RETURN QUERY SELECT * FROM public._suprimentos_list_posicao_estoque(p_search, p_baixo_estoque);
END;
$$;
REVOKE ALL ON FUNCTION public.suprimentos_list_posicao_estoque(text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.suprimentos_list_posicao_estoque(text, boolean) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.suprimentos_get_kardex(uuid, integer)') IS NOT NULL
     AND to_regprocedure('public._suprimentos_get_kardex(uuid, integer)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.suprimentos_get_kardex(uuid, integer) RENAME TO _suprimentos_get_kardex';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.suprimentos_get_kardex(
  p_produto_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  tipo text,
  quantidade numeric,
  saldo_anterior numeric,
  saldo_novo numeric,
  documento_ref text,
  observacao text,
  created_at timestamptz,
  usuario_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('suprimentos','view');
  RETURN QUERY SELECT * FROM public._suprimentos_get_kardex(p_produto_id, p_limit);
END;
$$;
REVOKE ALL ON FUNCTION public.suprimentos_get_kardex(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.suprimentos_get_kardex(uuid, integer) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.suprimentos_registrar_movimento(uuid, text, numeric, numeric, text, text)') IS NOT NULL
     AND to_regprocedure('public._suprimentos_registrar_movimento(uuid, text, numeric, numeric, text, text)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.suprimentos_registrar_movimento(uuid, text, numeric, numeric, text, text) RENAME TO _suprimentos_registrar_movimento';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.suprimentos_registrar_movimento(
  p_produto_id uuid,
  p_tipo text,
  p_quantidade numeric,
  p_custo_unitario numeric DEFAULT NULL,
  p_documento_ref text DEFAULT NULL,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('suprimentos','update');
  RETURN public._suprimentos_registrar_movimento(p_produto_id, p_tipo, p_quantidade, p_custo_unitario, p_documento_ref, p_observacao);
END;
$$;
REVOKE ALL ON FUNCTION public.suprimentos_registrar_movimento(uuid, text, numeric, numeric, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.suprimentos_registrar_movimento(uuid, text, numeric, numeric, text, text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) Grants (reaplica para tabelas RLS dos módulos, evita 403 por falta de privilege)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity IS TRUE
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I.%I TO authenticated',
      r.schema_name,
      r.table_name
    );
  END LOOP;
END $$;

COMMIT;

