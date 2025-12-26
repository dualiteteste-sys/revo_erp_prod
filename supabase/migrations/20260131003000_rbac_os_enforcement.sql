/*
  RBAC: Enforcement de permissões no banco (Serviços / OS)

  Objetivo:
  - Evitar bypass via console/PostgREST chamando RPCs diretamente
  - Aplicar o mesmo padrão de enforcement já usado em Financeiro/RH
*/

BEGIN;

-- Helper: renomeia função existente -> __unsafe (se ainda não foi renomeada)
DO $$
BEGIN
  IF to_regprocedure('public.list_os_for_current_user(text, public.status_os[], integer, integer, text, text)') IS NOT NULL
     AND to_regprocedure('public.list_os_for_current_user__unsafe(text, public.status_os[], integer, integer, text, text)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.list_os_for_current_user(text, public.status_os[], integer, integer, text, text) RENAME TO list_os_for_current_user__unsafe';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.list_os_for_current_user(
  p_search text DEFAULT NULL,
  p_status public.status_os[] DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_order_by text DEFAULT 'ordem',
  p_order_dir text DEFAULT 'asc'
)
RETURNS TABLE(
  id uuid,
  empresa_id uuid,
  numero bigint,
  cliente_id uuid,
  descricao text,
  status public.status_os,
  data_inicio date,
  data_prevista date,
  hora time,
  total_itens numeric,
  desconto_valor numeric,
  total_geral numeric,
  forma_recebimento text,
  condicao_pagamento text,
  observacoes text,
  observacoes_internas text,
  created_at timestamptz,
  updated_at timestamptz,
  ordem integer,
  cliente_nome text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('os','view');
  RETURN QUERY SELECT * FROM public.list_os_for_current_user__unsafe(p_search, p_status, p_limit, p_offset, p_order_by, p_order_dir);
END;
$$;

REVOKE ALL ON FUNCTION public.list_os_for_current_user(text, public.status_os[], integer, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_os_for_current_user(text, public.status_os[], integer, integer, text, text) TO authenticated, service_role;

-- get_os_by_id_for_current_user(uuid)
DO $$
BEGIN
  IF to_regprocedure('public.get_os_by_id_for_current_user(uuid)') IS NOT NULL
     AND to_regprocedure('public.get_os_by_id_for_current_user__unsafe(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.get_os_by_id_for_current_user(uuid) RENAME TO get_os_by_id_for_current_user__unsafe';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.get_os_by_id_for_current_user(p_id uuid)
RETURNS public.ordem_servicos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('os','view');
  RETURN public.get_os_by_id_for_current_user__unsafe(p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_os_by_id_for_current_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_os_by_id_for_current_user(uuid) TO authenticated, service_role;

-- create/update/delete OS
DO $$
BEGIN
  IF to_regprocedure('public.create_os_for_current_user(jsonb)') IS NOT NULL
     AND to_regprocedure('public.create_os_for_current_user__unsafe(jsonb)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.create_os_for_current_user(jsonb) RENAME TO create_os_for_current_user__unsafe';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.create_os_for_current_user(payload jsonb)
RETURNS public.ordem_servicos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('os','create');
  RETURN public.create_os_for_current_user__unsafe(payload);
END;
$$;

REVOKE ALL ON FUNCTION public.create_os_for_current_user(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_os_for_current_user(jsonb) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.update_os_for_current_user(uuid, jsonb)') IS NOT NULL
     AND to_regprocedure('public.update_os_for_current_user__unsafe(uuid, jsonb)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.update_os_for_current_user(uuid, jsonb) RENAME TO update_os_for_current_user__unsafe';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.update_os_for_current_user(p_id uuid, payload jsonb)
RETURNS public.ordem_servicos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('os','update');
  RETURN public.update_os_for_current_user__unsafe(p_id, payload);
END;
$$;

REVOKE ALL ON FUNCTION public.update_os_for_current_user(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_os_for_current_user(uuid, jsonb) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.delete_os_for_current_user(uuid)') IS NOT NULL
     AND to_regprocedure('public.delete_os_for_current_user__unsafe(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.delete_os_for_current_user(uuid) RENAME TO delete_os_for_current_user__unsafe';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.delete_os_for_current_user(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('os','delete');
  PERFORM public.delete_os_for_current_user__unsafe(p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_os_for_current_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_os_for_current_user(uuid) TO authenticated, service_role;

-- status
DO $$
BEGIN
  IF to_regprocedure('public.os_set_status_for_current_user(uuid, public.status_os, jsonb)') IS NOT NULL
     AND to_regprocedure('public.os_set_status_for_current_user__unsafe(uuid, public.status_os, jsonb)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.os_set_status_for_current_user(uuid, public.status_os, jsonb) RENAME TO os_set_status_for_current_user__unsafe';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.os_set_status_for_current_user(
  p_os_id uuid,
  p_next public.status_os,
  p_opts jsonb DEFAULT '{}'::jsonb
)
RETURNS public.ordem_servicos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('os','update');
  RETURN public.os_set_status_for_current_user__unsafe(p_os_id, p_next, p_opts);
END;
$$;

REVOKE ALL ON FUNCTION public.os_set_status_for_current_user(uuid, public.status_os, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.os_set_status_for_current_user(uuid, public.status_os, jsonb) TO authenticated, service_role;

-- reorder / schedule
DO $$
BEGIN
  IF to_regprocedure('public.update_os_order(uuid[])') IS NOT NULL
     AND to_regprocedure('public.update_os_order__unsafe(uuid[])') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.update_os_order(uuid[]) RENAME TO update_os_order__unsafe';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.update_os_order(p_os_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('os','update');
  PERFORM public.update_os_order__unsafe(p_os_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.update_os_order(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_os_order(uuid[]) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.update_os_data_prevista(uuid, date)') IS NOT NULL
     AND to_regprocedure('public.update_os_data_prevista__unsafe(uuid, date)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.update_os_data_prevista(uuid, date) RENAME TO update_os_data_prevista__unsafe';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.update_os_data_prevista(p_os_id uuid, p_new_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('os','update');
  PERFORM public.update_os_data_prevista__unsafe(p_os_id, p_new_date);
END;
$$;

REVOKE ALL ON FUNCTION public.update_os_data_prevista(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_os_data_prevista(uuid, date) TO authenticated, service_role;

-- items + autocomplete
DO $$
BEGIN
  IF to_regprocedure('public.list_os_items_for_current_user(uuid)') IS NOT NULL
     AND to_regprocedure('public.list_os_items_for_current_user__unsafe(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.list_os_items_for_current_user(uuid) RENAME TO list_os_items_for_current_user__unsafe';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.list_os_items_for_current_user(p_os_id uuid)
RETURNS SETOF public.ordem_servico_itens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('os','view');
  RETURN QUERY SELECT * FROM public.list_os_items_for_current_user__unsafe(p_os_id);
END;
$$;

REVOKE ALL ON FUNCTION public.list_os_items_for_current_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_os_items_for_current_user(uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.add_os_item_for_current_user(uuid, jsonb)') IS NOT NULL
     AND to_regprocedure('public.add_os_item_for_current_user__unsafe(uuid, jsonb)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.add_os_item_for_current_user(uuid, jsonb) RENAME TO add_os_item_for_current_user__unsafe';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.add_os_item_for_current_user(p_os_id uuid, payload jsonb)
RETURNS public.ordem_servico_itens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('os','update');
  RETURN public.add_os_item_for_current_user__unsafe(p_os_id, payload);
END;
$$;

REVOKE ALL ON FUNCTION public.add_os_item_for_current_user(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_os_item_for_current_user(uuid, jsonb) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.delete_os_item_for_current_user(uuid)') IS NOT NULL
     AND to_regprocedure('public.delete_os_item_for_current_user__unsafe(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.delete_os_item_for_current_user(uuid) RENAME TO delete_os_item_for_current_user__unsafe';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.delete_os_item_for_current_user(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('os','update');
  PERFORM public.delete_os_item_for_current_user__unsafe(p_item_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_os_item_for_current_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_os_item_for_current_user(uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.search_items_for_os(text, integer, boolean, text)') IS NOT NULL
     AND to_regprocedure('public.search_items_for_os__unsafe(text, integer, boolean, text)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.search_items_for_os(text, integer, boolean, text) RENAME TO search_items_for_os__unsafe';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.search_items_for_os(
  p_search text,
  p_limit integer DEFAULT 20,
  p_only_sales boolean DEFAULT true,
  p_type text DEFAULT 'all'
)
RETURNS TABLE(id uuid, type text, descricao text, codigo text, preco_venda numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('os','view');
  RETURN QUERY SELECT * FROM public.search_items_for_os__unsafe(p_search, p_limit, p_only_sales, p_type);
END;
$$;

REVOKE ALL ON FUNCTION public.search_items_for_os(text, integer, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_items_for_os(text, integer, boolean, text) TO authenticated, service_role;

-- kanban / agenda
DO $$
BEGIN
  IF to_regprocedure('public.list_kanban_os()') IS NOT NULL
     AND to_regprocedure('public.list_kanban_os__unsafe()') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.list_kanban_os() RENAME TO list_kanban_os__unsafe';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.list_kanban_os()
RETURNS TABLE(
  id uuid,
  numero bigint,
  descricao text,
  status public.status_os,
  data_prevista date,
  cliente_nome text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('os','view');
  RETURN QUERY SELECT * FROM public.list_kanban_os__unsafe();
END;
$$;

REVOKE ALL ON FUNCTION public.list_kanban_os() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_kanban_os() TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.list_kanban_os_v2(text, public.status_os[])') IS NOT NULL
     AND to_regprocedure('public.list_kanban_os_v2__unsafe(text, public.status_os[])') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.list_kanban_os_v2(text, public.status_os[]) RENAME TO list_kanban_os_v2__unsafe';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.list_kanban_os_v2(
  p_search text DEFAULT NULL,
  p_status public.status_os[] DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  numero bigint,
  descricao text,
  status public.status_os,
  data_prevista date,
  cliente_nome text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('os','view');
  RETURN QUERY SELECT * FROM public.list_kanban_os_v2__unsafe(p_search, p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.list_kanban_os_v2(text, public.status_os[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_kanban_os_v2(text, public.status_os[]) TO authenticated, service_role;

-- seed
DO $$
BEGIN
  IF to_regprocedure('public.seed_os_for_current_user(integer)') IS NOT NULL
     AND to_regprocedure('public.seed_os_for_current_user__unsafe(integer)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.seed_os_for_current_user(integer) RENAME TO seed_os_for_current_user__unsafe';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.seed_os_for_current_user(v_count integer DEFAULT 20)
RETURNS SETOF public.ordem_servicos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('os','manage');
  RETURN QUERY SELECT * FROM public.seed_os_for_current_user__unsafe(v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.seed_os_for_current_user(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_os_for_current_user(integer) TO authenticated, service_role;

-- Força reload do schema no PostgREST
SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

