/*
  RBAC enforcement (RH)

  - Cria permissões do módulo RH (módulo único: 'rh')
  - Seeds por role (OWNER/ADMIN tudo; demais pelo menos 'view')
  - Enforce em RPCs SECURITY DEFINER via wrappers (anti-burla via console)
*/

BEGIN;

-- 1) Permissões
INSERT INTO public.permissions(module, action) VALUES
  ('rh','view'),('rh','create'),('rh','update'),('rh','delete'),('rh','manage')
ON CONFLICT (module, action) DO NOTHING;

-- 2) Seeds incrementais
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p ON true
WHERE r.slug IN ('OWNER','ADMIN')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p
  ON (p.module = 'rh' AND p.action = 'view')
WHERE r.slug IN ('MEMBER','OPS','FINANCE','VIEWER')
ON CONFLICT DO NOTHING;

-- 3) Wrappers (renomeia implementação atual para _rh_* e cria guard)

DO $$
BEGIN
  IF to_regprocedure('public.rh_list_cargos(text, boolean)') IS NOT NULL
     AND to_regprocedure('public._rh_list_cargos(text, boolean)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_list_cargos(text, boolean) RENAME TO _rh_list_cargos';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_list_cargos(
  p_search text DEFAULT NULL,
  p_ativo_only boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  nome text,
  descricao text,
  setor text,
  ativo boolean,
  total_colaboradores bigint,
  total_competencias bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('rh','view');
  RETURN QUERY SELECT * FROM public._rh_list_cargos(p_search, p_ativo_only);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_list_cargos(text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.rh_list_cargos(text, boolean) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.rh_list_competencias(text)') IS NOT NULL
     AND to_regprocedure('public._rh_list_competencias(text)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_list_competencias(text) RENAME TO _rh_list_competencias';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_list_competencias(
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  nome text,
  tipo text,
  descricao text,
  critico_sgq boolean,
  ativo boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('rh','view');
  RETURN QUERY SELECT * FROM public._rh_list_competencias(p_search);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_list_competencias(text) FROM public;
GRANT EXECUTE ON FUNCTION public.rh_list_competencias(text) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.rh_list_competencias_v2(text, boolean)') IS NOT NULL
     AND to_regprocedure('public._rh_list_competencias_v2(text, boolean)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_list_competencias_v2(text, boolean) RENAME TO _rh_list_competencias_v2';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_list_competencias_v2(
  p_search text DEFAULT NULL,
  p_ativo_only boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  nome text,
  tipo text,
  descricao text,
  critico_sgq boolean,
  ativo boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('rh','view');
  RETURN QUERY SELECT * FROM public._rh_list_competencias_v2(p_search, p_ativo_only);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_list_competencias_v2(text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.rh_list_competencias_v2(text, boolean) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.rh_list_colaboradores(text, uuid, boolean)') IS NOT NULL
     AND to_regprocedure('public._rh_list_colaboradores(text, uuid, boolean)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_list_colaboradores(text, uuid, boolean) RENAME TO _rh_list_colaboradores';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_list_colaboradores(
  p_search text DEFAULT NULL,
  p_cargo_id uuid DEFAULT NULL,
  p_ativo_only boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  nome text,
  email text,
  documento text,
  data_admissao date,
  cargo_id uuid,
  cargo_nome text,
  ativo boolean,
  total_competencias_avaliadas bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('rh','view');
  RETURN QUERY SELECT * FROM public._rh_list_colaboradores(p_search, p_cargo_id, p_ativo_only);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_list_colaboradores(text, uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.rh_list_colaboradores(text, uuid, boolean) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.rh_get_cargo_details(uuid)') IS NOT NULL
     AND to_regprocedure('public._rh_get_cargo_details(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_get_cargo_details(uuid) RENAME TO _rh_get_cargo_details';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_get_cargo_details(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('rh','view');
  RETURN public._rh_get_cargo_details(p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_get_cargo_details(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.rh_get_cargo_details(uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.rh_upsert_cargo(jsonb)') IS NOT NULL
     AND to_regprocedure('public._rh_upsert_cargo(jsonb)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_upsert_cargo(jsonb) RENAME TO _rh_upsert_cargo';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_upsert_cargo(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_payload->>'id' IS NULL THEN
    PERFORM public.require_permission_for_current_user('rh','create');
  ELSE
    PERFORM public.require_permission_for_current_user('rh','update');
  END IF;
  RETURN public._rh_upsert_cargo(p_payload);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_upsert_cargo(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.rh_upsert_cargo(jsonb) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.rh_upsert_competencia(jsonb)') IS NOT NULL
     AND to_regprocedure('public._rh_upsert_competencia(jsonb)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_upsert_competencia(jsonb) RENAME TO _rh_upsert_competencia';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_upsert_competencia(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_payload->>'id' IS NULL THEN
    PERFORM public.require_permission_for_current_user('rh','create');
  ELSE
    PERFORM public.require_permission_for_current_user('rh','update');
  END IF;
  RETURN public._rh_upsert_competencia(p_payload);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_upsert_competencia(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.rh_upsert_competencia(jsonb) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.rh_get_colaborador_details(uuid)') IS NOT NULL
     AND to_regprocedure('public._rh_get_colaborador_details(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_get_colaborador_details(uuid) RENAME TO _rh_get_colaborador_details';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_get_colaborador_details(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('rh','view');
  RETURN public._rh_get_colaborador_details(p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_get_colaborador_details(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.rh_get_colaborador_details(uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.rh_upsert_colaborador(jsonb)') IS NOT NULL
     AND to_regprocedure('public._rh_upsert_colaborador(jsonb)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_upsert_colaborador(jsonb) RENAME TO _rh_upsert_colaborador';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_upsert_colaborador(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_payload->>'id' IS NULL THEN
    PERFORM public.require_permission_for_current_user('rh','create');
  ELSE
    PERFORM public.require_permission_for_current_user('rh','update');
  END IF;
  RETURN public._rh_upsert_colaborador(p_payload);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_upsert_colaborador(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.rh_upsert_colaborador(jsonb) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.rh_get_competency_matrix(uuid)') IS NOT NULL
     AND to_regprocedure('public._rh_get_competency_matrix(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_get_competency_matrix(uuid) RENAME TO _rh_get_competency_matrix';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_get_competency_matrix(p_cargo_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('rh','view');
  RETURN public._rh_get_competency_matrix(p_cargo_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_get_competency_matrix(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.rh_get_competency_matrix(uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.rh_list_treinamentos(text, text)') IS NOT NULL
     AND to_regprocedure('public._rh_list_treinamentos(text, text)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_list_treinamentos(text, text) RENAME TO _rh_list_treinamentos';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_list_treinamentos(
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  nome text,
  tipo text,
  status text,
  data_inicio timestamptz,
  instrutor text,
  total_participantes bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('rh','view');
  RETURN QUERY SELECT * FROM public._rh_list_treinamentos(p_search, p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_list_treinamentos(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.rh_list_treinamentos(text, text) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.rh_get_treinamento_details(uuid)') IS NOT NULL
     AND to_regprocedure('public._rh_get_treinamento_details(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_get_treinamento_details(uuid) RENAME TO _rh_get_treinamento_details';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_get_treinamento_details(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('rh','view');
  RETURN public._rh_get_treinamento_details(p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_get_treinamento_details(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.rh_get_treinamento_details(uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.rh_upsert_treinamento(jsonb)') IS NOT NULL
     AND to_regprocedure('public._rh_upsert_treinamento(jsonb)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_upsert_treinamento(jsonb) RENAME TO _rh_upsert_treinamento';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_upsert_treinamento(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_payload->>'id' IS NULL THEN
    PERFORM public.require_permission_for_current_user('rh','create');
  ELSE
    PERFORM public.require_permission_for_current_user('rh','update');
  END IF;
  RETURN public._rh_upsert_treinamento(p_payload);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_upsert_treinamento(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.rh_upsert_treinamento(jsonb) TO authenticated, service_role;

-- rh_manage_participante (2 assinaturas)
DO $$
BEGIN
  IF to_regprocedure('public.rh_manage_participante(uuid, uuid, text, text, numeric, text)') IS NOT NULL
     AND to_regprocedure('public._rh_manage_participante(uuid, uuid, text, text, numeric, text)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_manage_participante(uuid, uuid, text, text, numeric, text) RENAME TO _rh_manage_participante';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_manage_participante(
  p_treinamento_id uuid,
  p_colaborador_id uuid,
  p_action text,
  p_status text default 'inscrito',
  p_nota numeric default null,
  p_certificado_url text default null
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('rh','manage');
  PERFORM public._rh_manage_participante(p_treinamento_id, p_colaborador_id, p_action, p_status, p_nota, p_certificado_url);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_manage_participante(uuid, uuid, text, text, numeric, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_manage_participante(uuid, uuid, text, text, numeric, text) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.rh_manage_participante(uuid, uuid, text, text, numeric, text, text, boolean)') IS NOT NULL
     AND to_regprocedure('public._rh_manage_participante(uuid, uuid, text, text, numeric, text, text, boolean)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_manage_participante(uuid, uuid, text, text, numeric, text, text, boolean) RENAME TO _rh_manage_participante';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_manage_participante(
  p_treinamento_id uuid,
  p_colaborador_id uuid,
  p_action text,
  p_status text default 'inscrito',
  p_nota numeric default null,
  p_certificado_url text default null,
  p_parecer_eficacia text default null,
  p_eficacia_avaliada boolean default false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('rh','manage');
  PERFORM public._rh_manage_participante(p_treinamento_id, p_colaborador_id, p_action, p_status, p_nota, p_certificado_url, p_parecer_eficacia, p_eficacia_avaliada);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_manage_participante(uuid, uuid, text, text, numeric, text, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_manage_participante(uuid, uuid, text, text, numeric, text, text, boolean) TO authenticated, service_role;

-- Listagem de treinamentos por colaborador
DO $$
BEGIN
  IF to_regprocedure('public.rh_list_treinamentos_por_colaborador(uuid)') IS NOT NULL
     AND to_regprocedure('public._rh_list_treinamentos_por_colaborador(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_list_treinamentos_por_colaborador(uuid) RENAME TO _rh_list_treinamentos_por_colaborador';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_list_treinamentos_por_colaborador(p_colaborador_id uuid)
RETURNS TABLE (
  treinamento_id uuid,
  treinamento_nome text,
  treinamento_status text,
  treinamento_tipo text,
  data_inicio timestamptz,
  data_fim timestamptz,
  participante_status text,
  nota_final numeric,
  eficacia_avaliada boolean,
  parecer_eficacia text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('rh','view');
  RETURN QUERY SELECT * FROM public._rh_list_treinamentos_por_colaborador(p_colaborador_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_list_treinamentos_por_colaborador(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_list_treinamentos_por_colaborador(uuid) TO authenticated, service_role;

-- set_ativo
DO $$
BEGIN
  IF to_regprocedure('public.rh_set_cargo_ativo(uuid, boolean)') IS NOT NULL
     AND to_regprocedure('public._rh_set_cargo_ativo(uuid, boolean)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_set_cargo_ativo(uuid, boolean) RENAME TO _rh_set_cargo_ativo';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_set_cargo_ativo(p_id uuid, p_ativo boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('rh','update');
  PERFORM public._rh_set_cargo_ativo(p_id, p_ativo);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_set_cargo_ativo(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_set_cargo_ativo(uuid, boolean) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.rh_set_colaborador_ativo(uuid, boolean)') IS NOT NULL
     AND to_regprocedure('public._rh_set_colaborador_ativo(uuid, boolean)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_set_colaborador_ativo(uuid, boolean) RENAME TO _rh_set_colaborador_ativo';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_set_colaborador_ativo(p_id uuid, p_ativo boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('rh','update');
  PERFORM public._rh_set_colaborador_ativo(p_id, p_ativo);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_set_colaborador_ativo(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_set_colaborador_ativo(uuid, boolean) TO authenticated, service_role;

-- Dashboard stats
DO $$
BEGIN
  IF to_regprocedure('public.get_rh_dashboard_stats()') IS NOT NULL
     AND to_regprocedure('public._get_rh_dashboard_stats()') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.get_rh_dashboard_stats() RENAME TO _get_rh_dashboard_stats';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.get_rh_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('rh','view');
  RETURN public._get_rh_dashboard_stats();
END;
$$;

REVOKE ALL ON FUNCTION public.get_rh_dashboard_stats() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_rh_dashboard_stats() TO authenticated, service_role;

-- Seed (somente admin/owner)
DO $$
BEGIN
  IF to_regprocedure('public.seed_rh_module()') IS NOT NULL
     AND to_regprocedure('public._seed_rh_module()') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.seed_rh_module() RENAME TO _seed_rh_module';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.seed_rh_module()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('rh','manage');
  PERFORM public._seed_rh_module();
END;
$$;

REVOKE ALL ON FUNCTION public.seed_rh_module() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.seed_rh_module() TO authenticated, service_role;

-- Afastamentos e Docs (RPCs novas)
CREATE OR REPLACE FUNCTION public.rh_list_afastamentos(p_colaborador_id uuid)
RETURNS TABLE (
  id uuid,
  tipo text,
  motivo text,
  data_inicio date,
  data_fim date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('rh','view');
  RETURN QUERY
  SELECT a.id, a.tipo, a.motivo, a.data_inicio, a.data_fim
  FROM public.rh_colaborador_afastamentos a
  WHERE a.empresa_id = public.current_empresa_id()
    AND a.colaborador_id = p_colaborador_id
  ORDER BY a.data_inicio DESC, a.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.rh_list_afastamentos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_list_afastamentos(uuid) TO authenticated, service_role;

 -- Afastamentos: renomeia implementação real e cria wrapper com RBAC
DO $$
BEGIN
  IF to_regprocedure('public.rh_add_afastamento(uuid, text, text, date, date)') IS NOT NULL
     AND to_regprocedure('public._rh_add_afastamento(uuid, text, text, date, date)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_add_afastamento(uuid, text, text, date, date) RENAME TO _rh_add_afastamento';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_add_afastamento(
  p_colaborador_id uuid,
  p_tipo text DEFAULT 'outros',
  p_motivo text DEFAULT NULL,
  p_data_inicio date DEFAULT current_date,
  p_data_fim date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('rh','update');
  RETURN public._rh_add_afastamento(p_colaborador_id, p_tipo, p_motivo, p_data_inicio, p_data_fim);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_add_afastamento(uuid, text, text, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_add_afastamento(uuid, text, text, date, date) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.rh_encerrar_afastamento(uuid, date)') IS NOT NULL
     AND to_regprocedure('public._rh_encerrar_afastamento(uuid, date)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_encerrar_afastamento(uuid, date) RENAME TO _rh_encerrar_afastamento';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_encerrar_afastamento(
  p_afastamento_id uuid,
  p_data_fim date DEFAULT current_date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('rh','update');
  PERFORM public._rh_encerrar_afastamento(p_afastamento_id, p_data_fim);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_encerrar_afastamento(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_encerrar_afastamento(uuid, date) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.rh_docs_list(text, uuid, boolean)') IS NOT NULL
     AND to_regprocedure('public._rh_docs_list(text, uuid, boolean)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_docs_list(text, uuid, boolean) RENAME TO _rh_docs_list';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_docs_list(
  p_entity_type text,
  p_entity_id uuid,
  p_only_latest boolean DEFAULT true
)
RETURNS TABLE (
  id uuid,
  titulo text,
  descricao text,
  arquivo_path text,
  tamanho_bytes bigint,
  versao int,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('rh','view');
  RETURN QUERY SELECT * FROM public._rh_docs_list(p_entity_type, p_entity_id, p_only_latest);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_docs_list(text, uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_docs_list(text, uuid, boolean) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.rh_doc_register(text, uuid, text, text, text, bigint)') IS NOT NULL
     AND to_regprocedure('public._rh_doc_register(text, uuid, text, text, text, bigint)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_doc_register(text, uuid, text, text, text, bigint) RENAME TO _rh_doc_register';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_doc_register(
  p_entity_type text,
  p_entity_id uuid,
  p_titulo text,
  p_arquivo_path text,
  p_descricao text DEFAULT NULL,
  p_tamanho_bytes bigint DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('rh','update');
  RETURN public._rh_doc_register(p_entity_type, p_entity_id, p_titulo, p_arquivo_path, p_descricao, p_tamanho_bytes);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_doc_register(text, uuid, text, text, text, bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_doc_register(text, uuid, text, text, text, bigint) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.rh_doc_delete(uuid)') IS NOT NULL
     AND to_regprocedure('public._rh_doc_delete(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.rh_doc_delete(uuid) RENAME TO _rh_doc_delete';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.rh_doc_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_permission_for_current_user('rh','delete');
  PERFORM public._rh_doc_delete(p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rh_doc_delete(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rh_doc_delete(uuid) TO authenticated, service_role;

COMMIT;
