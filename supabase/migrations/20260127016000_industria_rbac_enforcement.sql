/*
  # Indústria: Enforcement RBAC no banco (anti-bypass via console)

  Estratégia (por RPC mutadora):
  - Renomeia a função original para `__unsafe`
  - Revoga EXECUTE do `__unsafe` para `authenticated`
  - Recria a função com o nome original como wrapper que valida `empresa_usuarios.role`

  Observação:
  - Algumas RPCs podem existir apenas em ambientes legados; por isso tudo é best-effort
    e condicionado via `to_regprocedure(...)`.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- Helpers de role (empresa_usuarios.role)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_empresa_role(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_role, ''))
    WHEN 'owner' THEN 'owner'
    WHEN 'dono' THEN 'owner'
    WHEN 'admin' THEN 'admin'
    WHEN 'administrador' THEN 'admin'
    WHEN 'member' THEN 'member'
    WHEN 'membro' THEN 'member'
    WHEN 'ops' THEN 'member'
    WHEN 'operador' THEN 'member'
    WHEN 'readonly' THEN 'viewer'
    WHEN 'read_only' THEN 'viewer'
    WHEN 'viewer' THEN 'viewer'
    WHEN 'leitura' THEN 'viewer'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.empresa_role_rank(p_role text)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE public.normalize_empresa_role(p_role)
    WHEN 'viewer' THEN 1
    WHEN 'member' THEN 2
    WHEN 'admin' THEN 3
    WHEN 'owner' THEN 4
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.current_jwt_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(auth.role(), ''),
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), ''),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.current_jwt_role() = 'service_role';
$$;

CREATE OR REPLACE FUNCTION public.current_empresa_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_emp uuid := public.current_empresa_id();
  v_role text;
BEGIN
  IF public.is_service_role() THEN
    RETURN 'owner';
  END IF;

  IF v_uid IS NULL OR v_emp IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT eu.role
    INTO v_role
    FROM public.empresa_usuarios eu
   WHERE eu.empresa_id = v_emp
     AND eu.user_id = v_uid
   LIMIT 1;

  RETURN public.normalize_empresa_role(v_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_empresa_role_at_least(p_min_role text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text;
  v_have int;
  v_need int;
BEGIN
  IF public.is_service_role() THEN
    RETURN;
  END IF;

  v_role := public.current_empresa_role();
  v_have := public.empresa_role_rank(v_role);
  v_need := public.empresa_role_rank(p_min_role);

  IF v_need <= 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Configuração inválida de permissão (role mínima).';
  END IF;

  IF v_have < v_need THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = format('Sem permissão para executar esta ação (necessário: %s).', p_min_role);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_empresa_role(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.empresa_role_rank(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.current_jwt_role() FROM public, anon;
REVOKE ALL ON FUNCTION public.is_service_role() FROM public, anon;
REVOKE ALL ON FUNCTION public.current_empresa_role() FROM public, anon;
REVOKE ALL ON FUNCTION public.assert_empresa_role_at_least(text) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.normalize_empresa_role(text) TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.empresa_role_rank(text) TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.current_jwt_role() TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.is_service_role() TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.current_empresa_role() TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.assert_empresa_role_at_least(text) TO authenticated, service_role, postgres;

-- -----------------------------------------------------------------------------
-- Wrappers RBAC (best-effort / conditional)
-- -----------------------------------------------------------------------------

-- Helper macro mental: para mutações padrão => member; para config/destrutivo => admin

DO $rbac$
BEGIN
  -- OP/OB (unificado)
  IF to_regprocedure('public.industria_upsert_ordem(jsonb)') IS NOT NULL
     AND to_regprocedure('public.industria_upsert_ordem__unsafe(jsonb)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_upsert_ordem(jsonb) RENAME TO industria_upsert_ordem__unsafe';
  END IF;
  IF to_regprocedure('public.industria_upsert_ordem__unsafe(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_upsert_ordem__unsafe(jsonb) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_upsert_ordem__unsafe(jsonb) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_upsert_ordem(p_payload jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        RETURN public.industria_upsert_ordem__unsafe(p_payload);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_upsert_ordem(jsonb) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_upsert_ordem(jsonb) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_manage_componente(uuid, uuid, uuid, numeric, text, text)') IS NOT NULL
     AND to_regprocedure('public.industria_manage_componente__unsafe(uuid, uuid, uuid, numeric, text, text)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_manage_componente(uuid, uuid, uuid, numeric, text, text) RENAME TO industria_manage_componente__unsafe';
  END IF;
  IF to_regprocedure('public.industria_manage_componente__unsafe(uuid, uuid, uuid, numeric, text, text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_manage_componente__unsafe(uuid, uuid, uuid, numeric, text, text) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_manage_componente__unsafe(uuid, uuid, uuid, numeric, text, text) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_manage_componente(
        p_ordem_id uuid,
        p_componente_id uuid,
        p_produto_id uuid,
        p_quantidade_planejada numeric,
        p_unidade text,
        p_action text
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        PERFORM public.industria_manage_componente__unsafe(p_ordem_id, p_componente_id, p_produto_id, p_quantidade_planejada, p_unidade, p_action);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_manage_componente(uuid, uuid, uuid, numeric, text, text) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_manage_componente(uuid, uuid, uuid, numeric, text, text) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_manage_entrega(uuid, uuid, date, numeric, text, text, text, text)') IS NOT NULL
     AND to_regprocedure('public.industria_manage_entrega__unsafe(uuid, uuid, date, numeric, text, text, text, text)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_manage_entrega(uuid, uuid, date, numeric, text, text, text, text) RENAME TO industria_manage_entrega__unsafe';
  END IF;
  IF to_regprocedure('public.industria_manage_entrega__unsafe(uuid, uuid, date, numeric, text, text, text, text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_manage_entrega__unsafe(uuid, uuid, date, numeric, text, text, text, text) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_manage_entrega__unsafe(uuid, uuid, date, numeric, text, text, text, text) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_manage_entrega(
        p_ordem_id uuid,
        p_entrega_id uuid,
        p_data_entrega date,
        p_quantidade_entregue numeric,
        p_status_faturamento text,
        p_documento_ref text,
        p_observacoes text,
        p_action text
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        PERFORM public.industria_manage_entrega__unsafe(
          p_ordem_id, p_entrega_id, p_data_entrega, p_quantidade_entregue, p_status_faturamento, p_documento_ref, p_observacoes, p_action
        );
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_manage_entrega(uuid, uuid, date, numeric, text, text, text, text) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_manage_entrega(uuid, uuid, date, numeric, text, text, text, text) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_update_ordem_status(uuid, text, integer)') IS NOT NULL
     AND to_regprocedure('public.industria_update_ordem_status__unsafe(uuid, text, integer)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_update_ordem_status(uuid, text, integer) RENAME TO industria_update_ordem_status__unsafe';
  END IF;
  IF to_regprocedure('public.industria_update_ordem_status__unsafe(uuid, text, integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_update_ordem_status__unsafe(uuid, text, integer) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_update_ordem_status__unsafe(uuid, text, integer) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_update_ordem_status(
        p_id uuid,
        p_status text,
        p_prioridade int DEFAULT 0
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        PERFORM public.industria_update_ordem_status__unsafe(p_id, p_status, p_prioridade);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_update_ordem_status(uuid, text, integer) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_update_ordem_status(uuid, text, integer) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_ordem_gerar_execucao(uuid, uuid)') IS NOT NULL
     AND to_regprocedure('public.industria_ordem_gerar_execucao__unsafe(uuid, uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_ordem_gerar_execucao(uuid, uuid) RENAME TO industria_ordem_gerar_execucao__unsafe';
  END IF;
  IF to_regprocedure('public.industria_ordem_gerar_execucao__unsafe(uuid, uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_ordem_gerar_execucao__unsafe(uuid, uuid) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_ordem_gerar_execucao__unsafe(uuid, uuid) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_ordem_gerar_execucao(
        p_ordem_id uuid,
        p_roteiro_id uuid DEFAULT NULL
      )
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        RETURN public.industria_ordem_gerar_execucao__unsafe(p_ordem_id, p_roteiro_id);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_ordem_gerar_execucao(uuid, uuid) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_ordem_gerar_execucao(uuid, uuid) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_clone_ordem(uuid)') IS NOT NULL
     AND to_regprocedure('public.industria_clone_ordem__unsafe(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_clone_ordem(uuid) RENAME TO industria_clone_ordem__unsafe';
  END IF;
  IF to_regprocedure('public.industria_clone_ordem__unsafe(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_clone_ordem__unsafe(uuid) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_clone_ordem__unsafe(uuid) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_clone_ordem(p_source_id uuid)
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        RETURN public.industria_clone_ordem__unsafe(p_source_id);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_clone_ordem(uuid) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_clone_ordem(uuid) TO authenticated, service_role';
  END IF;

  -- OP Produção
  IF to_regprocedure('public.industria_producao_upsert_ordem(jsonb)') IS NOT NULL
     AND to_regprocedure('public.industria_producao_upsert_ordem__unsafe(jsonb)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_producao_upsert_ordem(jsonb) RENAME TO industria_producao_upsert_ordem__unsafe';
  END IF;
  IF to_regprocedure('public.industria_producao_upsert_ordem__unsafe(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_upsert_ordem__unsafe(jsonb) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_upsert_ordem__unsafe(jsonb) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_producao_upsert_ordem(p_payload jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        RETURN public.industria_producao_upsert_ordem__unsafe(p_payload);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_upsert_ordem(jsonb) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_upsert_ordem(jsonb) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_producao_manage_componente(uuid, uuid, uuid, numeric, text, text)') IS NOT NULL
     AND to_regprocedure('public.industria_producao_manage_componente__unsafe(uuid, uuid, uuid, numeric, text, text)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_producao_manage_componente(uuid, uuid, uuid, numeric, text, text) RENAME TO industria_producao_manage_componente__unsafe';
  END IF;
  IF to_regprocedure('public.industria_producao_manage_componente__unsafe(uuid, uuid, uuid, numeric, text, text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_manage_componente__unsafe(uuid, uuid, uuid, numeric, text, text) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_manage_componente__unsafe(uuid, uuid, uuid, numeric, text, text) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_producao_manage_componente(
        p_ordem_id uuid,
        p_componente_id uuid,
        p_produto_id uuid,
        p_quantidade_planejada numeric,
        p_unidade text,
        p_action text
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        PERFORM public.industria_producao_manage_componente__unsafe(
          p_ordem_id, p_componente_id, p_produto_id, p_quantidade_planejada, p_unidade, p_action
        );
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_manage_componente(uuid, uuid, uuid, numeric, text, text) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_manage_componente(uuid, uuid, uuid, numeric, text, text) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_producao_manage_entrega(uuid, uuid, date, numeric, text, text, text)') IS NOT NULL
     AND to_regprocedure('public.industria_producao_manage_entrega__unsafe(uuid, uuid, date, numeric, text, text, text)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_producao_manage_entrega(uuid, uuid, date, numeric, text, text, text) RENAME TO industria_producao_manage_entrega__unsafe';
  END IF;
  IF to_regprocedure('public.industria_producao_manage_entrega__unsafe(uuid, uuid, date, numeric, text, text, text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_manage_entrega__unsafe(uuid, uuid, date, numeric, text, text, text) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_manage_entrega__unsafe(uuid, uuid, date, numeric, text, text, text) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_producao_manage_entrega(
        p_ordem_id uuid,
        p_entrega_id uuid,
        p_data_entrega date,
        p_quantidade_entregue numeric,
        p_documento_ref text,
        p_observacoes text,
        p_action text
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        PERFORM public.industria_producao_manage_entrega__unsafe(
          p_ordem_id, p_entrega_id, p_data_entrega, p_quantidade_entregue, p_documento_ref, p_observacoes, p_action
        );
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_manage_entrega(uuid, uuid, date, numeric, text, text, text) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_manage_entrega(uuid, uuid, date, numeric, text, text, text) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_producao_update_status(uuid, text, integer)') IS NOT NULL
     AND to_regprocedure('public.industria_producao_update_status__unsafe(uuid, text, integer)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_producao_update_status(uuid, text, integer) RENAME TO industria_producao_update_status__unsafe';
  END IF;
  IF to_regprocedure('public.industria_producao_update_status__unsafe(uuid, text, integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_update_status__unsafe(uuid, text, integer) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_update_status__unsafe(uuid, text, integer) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_producao_update_status(
        p_id uuid,
        p_status text,
        p_prioridade int
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        PERFORM public.industria_producao_update_status__unsafe(p_id, p_status, p_prioridade);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_update_status(uuid, text, integer) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_update_status(uuid, text, integer) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_producao_gerar_operacoes(uuid)') IS NOT NULL
     AND to_regprocedure('public.industria_producao_gerar_operacoes__unsafe(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_producao_gerar_operacoes(uuid) RENAME TO industria_producao_gerar_operacoes__unsafe';
  END IF;
  IF to_regprocedure('public.industria_producao_gerar_operacoes__unsafe(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_gerar_operacoes__unsafe(uuid) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_gerar_operacoes__unsafe(uuid) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_producao_gerar_operacoes(p_ordem_id uuid)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        PERFORM public.industria_producao_gerar_operacoes__unsafe(p_ordem_id);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_gerar_operacoes(uuid) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_gerar_operacoes(uuid) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_producao_registrar_evento(uuid, text)') IS NOT NULL
     AND to_regprocedure('public.industria_producao_registrar_evento__unsafe(uuid, text)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_producao_registrar_evento(uuid, text) RENAME TO industria_producao_registrar_evento__unsafe';
  END IF;
  IF to_regprocedure('public.industria_producao_registrar_evento__unsafe(uuid, text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_registrar_evento__unsafe(uuid, text) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_registrar_evento__unsafe(uuid, text) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_producao_registrar_evento(p_operacao_id uuid, p_tipo text)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        PERFORM public.industria_producao_registrar_evento__unsafe(p_operacao_id, p_tipo);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_registrar_evento(uuid, text) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_registrar_evento(uuid, text) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_producao_apontar_producao(uuid, numeric, numeric, text, text, boolean, uuid)') IS NOT NULL
     AND to_regprocedure('public.industria_producao_apontar_producao__unsafe(uuid, numeric, numeric, text, text, boolean, uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_producao_apontar_producao(uuid, numeric, numeric, text, text, boolean, uuid) RENAME TO industria_producao_apontar_producao__unsafe';
  END IF;
  IF to_regprocedure('public.industria_producao_apontar_producao__unsafe(uuid, numeric, numeric, text, text, boolean, uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_apontar_producao__unsafe(uuid, numeric, numeric, text, text, boolean, uuid) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_apontar_producao__unsafe(uuid, numeric, numeric, text, text, boolean, uuid) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_producao_apontar_producao(
        p_operacao_id uuid,
        p_quantidade_produzida numeric,
        p_quantidade_refugo numeric,
        p_motivo_refugo text,
        p_observacoes text,
        p_finalizar boolean,
        p_motivo_refugo_id uuid DEFAULT NULL
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        PERFORM public.industria_producao_apontar_producao__unsafe(
          p_operacao_id, p_quantidade_produzida, p_quantidade_refugo, p_motivo_refugo, p_observacoes, p_finalizar, p_motivo_refugo_id
        );
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_apontar_producao(uuid, numeric, numeric, text, text, boolean, uuid) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_apontar_producao(uuid, numeric, numeric, text, text, boolean, uuid) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_producao_delete_apontamento(uuid)') IS NOT NULL
     AND to_regprocedure('public.industria_producao_delete_apontamento__unsafe(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_producao_delete_apontamento(uuid) RENAME TO industria_producao_delete_apontamento__unsafe';
  END IF;
  IF to_regprocedure('public.industria_producao_delete_apontamento__unsafe(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_delete_apontamento__unsafe(uuid) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_delete_apontamento__unsafe(uuid) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_producao_delete_apontamento(p_id uuid)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        PERFORM public.industria_producao_delete_apontamento__unsafe(p_id);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_delete_apontamento(uuid) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_delete_apontamento(uuid) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_producao_transferir_lote(uuid, numeric)') IS NOT NULL
     AND to_regprocedure('public.industria_producao_transferir_lote__unsafe(uuid, numeric)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_producao_transferir_lote(uuid, numeric) RENAME TO industria_producao_transferir_lote__unsafe';
  END IF;
  IF to_regprocedure('public.industria_producao_transferir_lote__unsafe(uuid, numeric)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_transferir_lote__unsafe(uuid, numeric) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_transferir_lote__unsafe(uuid, numeric) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_producao_transferir_lote(p_operacao_id uuid, p_qtd numeric)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        PERFORM public.industria_producao_transferir_lote__unsafe(p_operacao_id, p_qtd);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_transferir_lote(uuid, numeric) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_transferir_lote(uuid, numeric) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_producao_reservar(uuid, uuid, text, numeric)') IS NOT NULL
     AND to_regprocedure('public.industria_producao_reservar__unsafe(uuid, uuid, text, numeric)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_producao_reservar(uuid, uuid, text, numeric) RENAME TO industria_producao_reservar__unsafe';
  END IF;
  IF to_regprocedure('public.industria_producao_reservar__unsafe(uuid, uuid, text, numeric)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_reservar__unsafe(uuid, uuid, text, numeric) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_reservar__unsafe(uuid, uuid, text, numeric) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_producao_reservar(
        p_ordem_id uuid,
        p_componente_id uuid,
        p_lote text,
        p_quantidade numeric
      )
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        RETURN public.industria_producao_reservar__unsafe(p_ordem_id, p_componente_id, p_lote, p_quantidade);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_reservar(uuid, uuid, text, numeric) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_reservar(uuid, uuid, text, numeric) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_producao_consumir(uuid, uuid, text, numeric, uuid)') IS NOT NULL
     AND to_regprocedure('public.industria_producao_consumir__unsafe(uuid, uuid, text, numeric, uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_producao_consumir(uuid, uuid, text, numeric, uuid) RENAME TO industria_producao_consumir__unsafe';
  END IF;
  IF to_regprocedure('public.industria_producao_consumir__unsafe(uuid, uuid, text, numeric, uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_consumir__unsafe(uuid, uuid, text, numeric, uuid) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_consumir__unsafe(uuid, uuid, text, numeric, uuid) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_producao_consumir(
        p_ordem_id uuid,
        p_componente_id uuid,
        p_lote text,
        p_quantidade numeric,
        p_etapa_id uuid DEFAULT NULL
      )
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        RETURN public.industria_producao_consumir__unsafe(p_ordem_id, p_componente_id, p_lote, p_quantidade, p_etapa_id);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_consumir(uuid, uuid, text, numeric, uuid) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_consumir(uuid, uuid, text, numeric, uuid) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_producao_registrar_entrega(uuid, numeric, date, text, date, text, text)') IS NOT NULL
     AND to_regprocedure('public.industria_producao_registrar_entrega__unsafe(uuid, numeric, date, text, date, text, text)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_producao_registrar_entrega(uuid, numeric, date, text, date, text, text) RENAME TO industria_producao_registrar_entrega__unsafe';
  END IF;
  IF to_regprocedure('public.industria_producao_registrar_entrega__unsafe(uuid, numeric, date, text, date, text, text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_registrar_entrega__unsafe(uuid, numeric, date, text, date, text, text) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_registrar_entrega__unsafe(uuid, numeric, date, text, date, text, text) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_producao_registrar_entrega(
        p_ordem_id uuid,
        p_quantidade numeric,
        p_data_entrega date,
        p_lote text DEFAULT NULL,
        p_validade date DEFAULT NULL,
        p_documento_ref text DEFAULT NULL,
        p_observacoes text DEFAULT NULL
      )
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        RETURN public.industria_producao_registrar_entrega__unsafe(
          p_ordem_id, p_quantidade, p_data_entrega, p_lote, p_validade, p_documento_ref, p_observacoes
        );
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_registrar_entrega(uuid, numeric, date, text, date, text, text) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_registrar_entrega(uuid, numeric, date, text, date, text, text) TO authenticated, service_role';
  END IF;

  -- Admin-only (destrutivo/config)
  IF to_regprocedure('public.industria_producao_fechar(uuid)') IS NOT NULL
     AND to_regprocedure('public.industria_producao_fechar__unsafe(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_producao_fechar(uuid) RENAME TO industria_producao_fechar__unsafe';
  END IF;
  IF to_regprocedure('public.industria_producao_fechar__unsafe(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_fechar__unsafe(uuid) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_fechar__unsafe(uuid) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_producao_fechar(p_ordem_id uuid)
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('admin');
        RETURN public.industria_producao_fechar__unsafe(p_ordem_id);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_fechar(uuid) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_fechar(uuid) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_producao_ordens_delete(uuid)') IS NOT NULL
     AND to_regprocedure('public.industria_producao_ordens_delete__unsafe(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_producao_ordens_delete(uuid) RENAME TO industria_producao_ordens_delete__unsafe';
  END IF;
  IF to_regprocedure('public.industria_producao_ordens_delete__unsafe(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_ordens_delete__unsafe(uuid) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_ordens_delete__unsafe(uuid) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_producao_ordens_delete(p_id uuid)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('admin');
        PERFORM public.industria_producao_ordens_delete__unsafe(p_id);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_ordens_delete(uuid) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_ordens_delete(uuid) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_producao_set_qa_requirements(uuid, boolean, boolean)') IS NOT NULL
     AND to_regprocedure('public.industria_producao_set_qa_requirements__unsafe(uuid, boolean, boolean)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_producao_set_qa_requirements(uuid, boolean, boolean) RENAME TO industria_producao_set_qa_requirements__unsafe';
  END IF;
  IF to_regprocedure('public.industria_producao_set_qa_requirements__unsafe(uuid, boolean, boolean)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_set_qa_requirements__unsafe(uuid, boolean, boolean) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_set_qa_requirements__unsafe(uuid, boolean, boolean) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_producao_set_qa_requirements(
        p_operacao_id uuid,
        p_require_ip boolean,
        p_require_if boolean
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('admin');
        PERFORM public.industria_producao_set_qa_requirements__unsafe(p_operacao_id, p_require_ip, p_require_if);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_set_qa_requirements(uuid, boolean, boolean) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_set_qa_requirements(uuid, boolean, boolean) TO authenticated, service_role';
  END IF;

  -- Execução (operacoes)
  IF to_regprocedure('public.industria_operacao_update_status(uuid, text, integer, uuid)') IS NOT NULL
     AND to_regprocedure('public.industria_operacao_update_status__unsafe(uuid, text, integer, uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_operacao_update_status(uuid, text, int, uuid) RENAME TO industria_operacao_update_status__unsafe';
  END IF;
  IF to_regprocedure('public.industria_operacao_update_status__unsafe(uuid, text, integer, uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_operacao_update_status__unsafe(uuid, text, integer, uuid) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_operacao_update_status__unsafe(uuid, text, integer, uuid) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_operacao_update_status(
        p_id uuid,
        p_status text,
        p_prioridade int DEFAULT NULL,
        p_centro_trabalho_id uuid DEFAULT NULL
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, extensions, pg_catalog
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        PERFORM public.industria_operacao_update_status__unsafe(p_id, p_status, p_prioridade, p_centro_trabalho_id);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_operacao_update_status(uuid, text, integer, uuid) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_operacao_update_status(uuid, text, integer, uuid) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_operacao_apontar_execucao(uuid, text, numeric, numeric, text, text)') IS NOT NULL
     AND to_regprocedure('public.industria_operacao_apontar_execucao__unsafe(uuid, text, numeric, numeric, text, text)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_operacao_apontar_execucao(uuid, text, numeric, numeric, text, text) RENAME TO industria_operacao_apontar_execucao__unsafe';
  END IF;
  IF to_regprocedure('public.industria_operacao_apontar_execucao__unsafe(uuid, text, numeric, numeric, text, text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_operacao_apontar_execucao__unsafe(uuid, text, numeric, numeric, text, text) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_operacao_apontar_execucao__unsafe(uuid, text, numeric, numeric, text, text) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_operacao_apontar_execucao(
        p_operacao_id uuid,
        p_acao text,
        p_qtd_boas numeric DEFAULT 0,
        p_qtd_refugadas numeric DEFAULT 0,
        p_motivo_refugo text DEFAULT NULL,
        p_observacoes text DEFAULT NULL
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, extensions, pg_catalog
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        PERFORM public.industria_operacao_apontar_execucao__unsafe(
          p_operacao_id, p_acao, p_qtd_boas, p_qtd_refugadas, p_motivo_refugo, p_observacoes
        );
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_operacao_apontar_execucao(uuid, text, numeric, numeric, text, text) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_operacao_apontar_execucao(uuid, text, numeric, numeric, text, text) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_operacao_replanejar(uuid, uuid, integer)') IS NOT NULL
     AND to_regprocedure('public.industria_operacao_replanejar__unsafe(uuid, uuid, integer)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_operacao_replanejar(uuid, uuid, int) RENAME TO industria_operacao_replanejar__unsafe';
  END IF;
  IF to_regprocedure('public.industria_operacao_replanejar__unsafe(uuid, uuid, integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_operacao_replanejar__unsafe(uuid, uuid, integer) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_operacao_replanejar__unsafe(uuid, uuid, integer) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_operacao_replanejar(
        p_operacao_id uuid,
        p_novo_centro uuid,
        p_nova_prioridade int DEFAULT NULL
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, extensions, pg_catalog
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('admin');
        PERFORM public.industria_operacao_replanejar__unsafe(p_operacao_id, p_novo_centro, p_nova_prioridade);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_operacao_replanejar(uuid, uuid, integer) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_operacao_replanejar(uuid, uuid, integer) TO authenticated, service_role';
  END IF;

  -- Configurações APS / Centros / QA (admin)
  IF to_regprocedure('public.industria_centros_trabalho_upsert(jsonb)') IS NOT NULL
     AND to_regprocedure('public.industria_centros_trabalho_upsert__unsafe(jsonb)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_centros_trabalho_upsert(jsonb) RENAME TO industria_centros_trabalho_upsert__unsafe';
  END IF;
  IF to_regprocedure('public.industria_centros_trabalho_upsert__unsafe(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_centros_trabalho_upsert__unsafe(jsonb) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_centros_trabalho_upsert__unsafe(jsonb) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_centros_trabalho_upsert(p_payload jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('admin');
        RETURN public.industria_centros_trabalho_upsert__unsafe(p_payload);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_centros_trabalho_upsert(jsonb) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_centros_trabalho_upsert(jsonb) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_centros_trabalho_delete(uuid)') IS NOT NULL
     AND to_regprocedure('public.industria_centros_trabalho_delete__unsafe(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_centros_trabalho_delete(uuid) RENAME TO industria_centros_trabalho_delete__unsafe';
  END IF;
  IF to_regprocedure('public.industria_centros_trabalho_delete__unsafe(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_centros_trabalho_delete__unsafe(uuid) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_centros_trabalho_delete__unsafe(uuid) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_centros_trabalho_delete(p_id uuid)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('admin');
        PERFORM public.industria_centros_trabalho_delete__unsafe(p_id);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_centros_trabalho_delete(uuid) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_centros_trabalho_delete(uuid) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_ct_calendario_upsert(uuid, jsonb)') IS NOT NULL
     AND to_regprocedure('public.industria_ct_calendario_upsert__unsafe(uuid, jsonb)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_ct_calendario_upsert(uuid, jsonb) RENAME TO industria_ct_calendario_upsert__unsafe';
  END IF;
  IF to_regprocedure('public.industria_ct_calendario_upsert__unsafe(uuid, jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_ct_calendario_upsert__unsafe(uuid, jsonb) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_ct_calendario_upsert__unsafe(uuid, jsonb) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_ct_calendario_upsert(p_centro_id uuid, p_payload jsonb)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('admin');
        PERFORM public.industria_ct_calendario_upsert__unsafe(p_centro_id, p_payload);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_ct_calendario_upsert(uuid, jsonb) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_ct_calendario_upsert(uuid, jsonb) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_ct_aps_config_upsert(uuid, integer)') IS NOT NULL
     AND to_regprocedure('public.industria_ct_aps_config_upsert__unsafe(uuid, integer)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_ct_aps_config_upsert(uuid, int) RENAME TO industria_ct_aps_config_upsert__unsafe';
  END IF;
  IF to_regprocedure('public.industria_ct_aps_config_upsert__unsafe(uuid, integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_ct_aps_config_upsert__unsafe(uuid, integer) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_ct_aps_config_upsert__unsafe(uuid, integer) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_ct_aps_config_upsert(p_centro_id uuid, p_freeze_dias int)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('admin');
        PERFORM public.industria_ct_aps_config_upsert__unsafe(p_centro_id, p_freeze_dias);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_ct_aps_config_upsert(uuid, integer) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_ct_aps_config_upsert(uuid, integer) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_operacao_aps_lock_set(uuid, boolean, text)') IS NOT NULL
     AND to_regprocedure('public.industria_operacao_aps_lock_set__unsafe(uuid, boolean, text)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_operacao_aps_lock_set(uuid, boolean, text) RENAME TO industria_operacao_aps_lock_set__unsafe';
  END IF;
  IF to_regprocedure('public.industria_operacao_aps_lock_set__unsafe(uuid, boolean, text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_operacao_aps_lock_set__unsafe(uuid, boolean, text) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_operacao_aps_lock_set__unsafe(uuid, boolean, text) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_operacao_aps_lock_set(
        p_operacao_id uuid,
        p_locked boolean,
        p_reason text DEFAULT NULL
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('admin');
        PERFORM public.industria_operacao_aps_lock_set__unsafe(p_operacao_id, p_locked, p_reason);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_operacao_aps_lock_set(uuid, boolean, text) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_operacao_aps_lock_set(uuid, boolean, text) TO authenticated, service_role';
  END IF;

  -- Operadores (admin)
  IF to_regprocedure('public.industria_operador_upsert(uuid, text, text, text, uuid[], boolean)') IS NOT NULL
     AND to_regprocedure('public.industria_operador_upsert__unsafe(uuid, text, text, text, uuid[], boolean)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_operador_upsert(uuid, text, text, text, uuid[], boolean) RENAME TO industria_operador_upsert__unsafe';
  END IF;
  IF to_regprocedure('public.industria_operador_upsert__unsafe(uuid, text, text, text, uuid[], boolean)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_operador_upsert__unsafe(uuid, text, text, text, uuid[], boolean) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_operador_upsert__unsafe(uuid, text, text, text, uuid[], boolean) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_operador_upsert(
        p_id uuid,
        p_nome text,
        p_email text,
        p_pin text,
        p_centros uuid[],
        p_ativo boolean
      )
      RETURNS uuid
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, extensions, pg_catalog
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('admin');
        RETURN public.industria_operador_upsert__unsafe(p_id, p_nome, p_email, p_pin, p_centros, p_ativo);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_operador_upsert(uuid, text, text, text, uuid[], boolean) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_operador_upsert(uuid, text, text, text, uuid[], boolean) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_operador_delete(uuid)') IS NOT NULL
     AND to_regprocedure('public.industria_operador_delete__unsafe(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_operador_delete(uuid) RENAME TO industria_operador_delete__unsafe';
  END IF;
  IF to_regprocedure('public.industria_operador_delete__unsafe(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_operador_delete__unsafe(uuid) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_operador_delete__unsafe(uuid) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_operador_delete(p_id uuid)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('admin');
        PERFORM public.industria_operador_delete__unsafe(p_id);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_operador_delete(uuid) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_operador_delete(uuid) TO authenticated, service_role';
  END IF;

  -- Automação (admin)
  IF to_regprocedure('public.industria_automacao_upsert(text, boolean, jsonb)') IS NOT NULL
     AND to_regprocedure('public.industria_automacao_upsert__unsafe(text, boolean, jsonb)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_automacao_upsert(text, boolean, jsonb) RENAME TO industria_automacao_upsert__unsafe';
  END IF;
  IF to_regprocedure('public.industria_automacao_upsert__unsafe(text, boolean, jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_automacao_upsert__unsafe(text, boolean, jsonb) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_automacao_upsert__unsafe(text, boolean, jsonb) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_automacao_upsert(
        p_chave text,
        p_enabled boolean,
        p_config jsonb
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, pg_catalog
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('admin');
        PERFORM public.industria_automacao_upsert__unsafe(p_chave, p_enabled, p_config);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_automacao_upsert(text, boolean, jsonb) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_automacao_upsert(text, boolean, jsonb) TO authenticated, service_role';
  END IF;

  -- Documentos de operação (member)
  IF to_regprocedure('public.industria_operacao_doc_register(uuid, text, text, text, bigint)') IS NOT NULL
     AND to_regprocedure('public.industria_operacao_doc_register__unsafe(uuid, text, text, text, bigint)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_operacao_doc_register(uuid, text, text, text, bigint) RENAME TO industria_operacao_doc_register__unsafe';
  END IF;
  IF to_regprocedure('public.industria_operacao_doc_register__unsafe(uuid, text, text, text, bigint)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_operacao_doc_register__unsafe(uuid, text, text, text, bigint) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_operacao_doc_register__unsafe(uuid, text, text, text, bigint) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_operacao_doc_register(
        p_operacao_id uuid,
        p_titulo text,
        p_descricao text,
        p_arquivo_path text,
        p_tamanho_bytes bigint DEFAULT NULL
      )
      RETURNS uuid
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, pg_catalog
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        RETURN public.industria_operacao_doc_register__unsafe(p_operacao_id, p_titulo, p_descricao, p_arquivo_path, p_tamanho_bytes);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_operacao_doc_register(uuid, text, text, text, bigint) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_operacao_doc_register(uuid, text, text, text, bigint) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_operacao_doc_delete(uuid)') IS NOT NULL
     AND to_regprocedure('public.industria_operacao_doc_delete__unsafe(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_operacao_doc_delete(uuid) RENAME TO industria_operacao_doc_delete__unsafe';
  END IF;
  IF to_regprocedure('public.industria_operacao_doc_delete__unsafe(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_operacao_doc_delete__unsafe(uuid) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_operacao_doc_delete__unsafe(uuid) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_operacao_doc_delete(p_id uuid)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, pg_catalog
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        PERFORM public.industria_operacao_doc_delete__unsafe(p_id);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_operacao_doc_delete(uuid) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_operacao_doc_delete(uuid) TO authenticated, service_role';
  END IF;

  -- Roteiros (admin): upsert/delete/manage_etapa (se existir)
  IF to_regprocedure('public.industria_roteiros_upsert(jsonb)') IS NOT NULL
     AND to_regprocedure('public.industria_roteiros_upsert__unsafe(jsonb)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_roteiros_upsert(jsonb) RENAME TO industria_roteiros_upsert__unsafe';
  END IF;
  IF to_regprocedure('public.industria_roteiros_upsert__unsafe(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_roteiros_upsert__unsafe(jsonb) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_roteiros_upsert__unsafe(jsonb) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_roteiros_upsert(p_payload jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('admin');
        RETURN public.industria_roteiros_upsert__unsafe(p_payload);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_roteiros_upsert(jsonb) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_roteiros_upsert(jsonb) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_roteiros_delete(uuid)') IS NOT NULL
     AND to_regprocedure('public.industria_roteiros_delete__unsafe(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_roteiros_delete(uuid) RENAME TO industria_roteiros_delete__unsafe';
  END IF;
  IF to_regprocedure('public.industria_roteiros_delete__unsafe(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_roteiros_delete__unsafe(uuid) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_roteiros_delete__unsafe(uuid) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_roteiros_delete(p_id uuid)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('admin');
        PERFORM public.industria_roteiros_delete__unsafe(p_id);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_roteiros_delete(uuid) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_roteiros_delete(uuid) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_roteiros_manage_etapa(uuid, uuid, jsonb, text)') IS NOT NULL
     AND to_regprocedure('public.industria_roteiros_manage_etapa__unsafe(uuid, uuid, jsonb, text)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_roteiros_manage_etapa(uuid, uuid, jsonb, text) RENAME TO industria_roteiros_manage_etapa__unsafe';
  END IF;
  IF to_regprocedure('public.industria_roteiros_manage_etapa__unsafe(uuid, uuid, jsonb, text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_roteiros_manage_etapa__unsafe(uuid, uuid, jsonb, text) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_roteiros_manage_etapa__unsafe(uuid, uuid, jsonb, text) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_roteiros_manage_etapa(
        p_roteiro_id uuid,
        p_etapa_id uuid,
        p_payload jsonb,
        p_action text
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('admin');
        PERFORM public.industria_roteiros_manage_etapa__unsafe(p_roteiro_id, p_etapa_id, p_payload, p_action);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_roteiros_manage_etapa(uuid, uuid, jsonb, text) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_roteiros_manage_etapa(uuid, uuid, jsonb, text) TO authenticated, service_role';
  END IF;

  -- BOM (admin) + aplicar BOM (member) (se existir)
  IF to_regprocedure('public.industria_bom_upsert(jsonb)') IS NOT NULL
     AND to_regprocedure('public.industria_bom_upsert__unsafe(jsonb)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_bom_upsert(jsonb) RENAME TO industria_bom_upsert__unsafe';
  END IF;
  IF to_regprocedure('public.industria_bom_upsert__unsafe(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_bom_upsert__unsafe(jsonb) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_bom_upsert__unsafe(jsonb) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_bom_upsert(p_payload jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('admin');
        RETURN public.industria_bom_upsert__unsafe(p_payload);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_bom_upsert(jsonb) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_bom_upsert(jsonb) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_bom_manage_componente(uuid, uuid, uuid, numeric, text, numeric, boolean, text, text)') IS NOT NULL
     AND to_regprocedure('public.industria_bom_manage_componente__unsafe(uuid, uuid, uuid, numeric, text, numeric, boolean, text, text)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_bom_manage_componente(uuid, uuid, uuid, numeric, text, numeric, boolean, text, text) RENAME TO industria_bom_manage_componente__unsafe';
  END IF;
  IF to_regprocedure('public.industria_bom_manage_componente__unsafe(uuid, uuid, uuid, numeric, text, numeric, boolean, text, text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_bom_manage_componente__unsafe(uuid, uuid, uuid, numeric, text, numeric, boolean, text, text) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_bom_manage_componente__unsafe(uuid, uuid, uuid, numeric, text, numeric, boolean, text, text) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_bom_manage_componente(
        p_bom_id uuid,
        p_componente_id uuid,
        p_produto_id uuid,
        p_quantidade numeric,
        p_unidade text,
        p_perda_percentual numeric,
        p_obrigatorio boolean,
        p_observacoes text,
        p_action text
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('admin');
        PERFORM public.industria_bom_manage_componente__unsafe(
          p_bom_id, p_componente_id, p_produto_id, p_quantidade, p_unidade, p_perda_percentual, p_obrigatorio, p_observacoes, p_action
        );
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_bom_manage_componente(uuid, uuid, uuid, numeric, text, numeric, boolean, text, text) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_bom_manage_componente(uuid, uuid, uuid, numeric, text, numeric, boolean, text, text) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_bom_delete(uuid)') IS NOT NULL
     AND to_regprocedure('public.industria_bom_delete__unsafe(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_bom_delete(uuid) RENAME TO industria_bom_delete__unsafe';
  END IF;
  IF to_regprocedure('public.industria_bom_delete__unsafe(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_bom_delete__unsafe(uuid) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_bom_delete__unsafe(uuid) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_bom_delete(p_id uuid)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('admin');
        PERFORM public.industria_bom_delete__unsafe(p_id);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_bom_delete(uuid) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_bom_delete(uuid) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_aplicar_bom_em_ordem_producao(uuid, uuid, text)') IS NOT NULL
     AND to_regprocedure('public.industria_aplicar_bom_em_ordem_producao__unsafe(uuid, uuid, text)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_aplicar_bom_em_ordem_producao(uuid, uuid, text) RENAME TO industria_aplicar_bom_em_ordem_producao__unsafe';
  END IF;
  IF to_regprocedure('public.industria_aplicar_bom_em_ordem_producao__unsafe(uuid, uuid, text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_aplicar_bom_em_ordem_producao__unsafe(uuid, uuid, text) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_aplicar_bom_em_ordem_producao__unsafe(uuid, uuid, text) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_aplicar_bom_em_ordem_producao(
        p_bom_id uuid,
        p_ordem_id uuid,
        p_modo text DEFAULT 'substituir'
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        PERFORM public.industria_aplicar_bom_em_ordem_producao__unsafe(p_bom_id, p_ordem_id, p_modo);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_aplicar_bom_em_ordem_producao(uuid, uuid, text) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_aplicar_bom_em_ordem_producao(uuid, uuid, text) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_aplicar_bom_em_ordem_beneficiamento(uuid, uuid, text)') IS NOT NULL
     AND to_regprocedure('public.industria_aplicar_bom_em_ordem_beneficiamento__unsafe(uuid, uuid, text)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_aplicar_bom_em_ordem_beneficiamento(uuid, uuid, text) RENAME TO industria_aplicar_bom_em_ordem_beneficiamento__unsafe';
  END IF;
  IF to_regprocedure('public.industria_aplicar_bom_em_ordem_beneficiamento__unsafe(uuid, uuid, text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_aplicar_bom_em_ordem_beneficiamento__unsafe(uuid, uuid, text) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_aplicar_bom_em_ordem_beneficiamento__unsafe(uuid, uuid, text) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_aplicar_bom_em_ordem_beneficiamento(
        p_bom_id uuid,
        p_ordem_id uuid,
        p_modo text DEFAULT 'substituir'
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        PERFORM public.industria_aplicar_bom_em_ordem_beneficiamento__unsafe(p_bom_id, p_ordem_id, p_modo);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_aplicar_bom_em_ordem_beneficiamento(uuid, uuid, text) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_aplicar_bom_em_ordem_beneficiamento(uuid, uuid, text) TO authenticated, service_role';
  END IF;

  -- Materiais do Cliente (member) (se existir)
  IF to_regprocedure('public.industria_materiais_cliente_upsert(jsonb)') IS NOT NULL
     AND to_regprocedure('public.industria_materiais_cliente_upsert__unsafe(jsonb)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_materiais_cliente_upsert(jsonb) RENAME TO industria_materiais_cliente_upsert__unsafe';
  END IF;
  IF to_regprocedure('public.industria_materiais_cliente_upsert__unsafe(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_materiais_cliente_upsert__unsafe(jsonb) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_materiais_cliente_upsert__unsafe(jsonb) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_materiais_cliente_upsert(p_payload jsonb)
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        RETURN public.industria_materiais_cliente_upsert__unsafe(p_payload);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_materiais_cliente_upsert(jsonb) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_materiais_cliente_upsert(jsonb) TO authenticated, service_role';
  END IF;

  IF to_regprocedure('public.industria_materiais_cliente_delete(uuid)') IS NOT NULL
     AND to_regprocedure('public.industria_materiais_cliente_delete__unsafe(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_materiais_cliente_delete(uuid) RENAME TO industria_materiais_cliente_delete__unsafe';
  END IF;
  IF to_regprocedure('public.industria_materiais_cliente_delete__unsafe(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_materiais_cliente_delete__unsafe(uuid) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_materiais_cliente_delete__unsafe(uuid) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_materiais_cliente_delete(p_id uuid)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        PERFORM public.industria_materiais_cliente_delete__unsafe(p_id);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_materiais_cliente_delete(uuid) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_materiais_cliente_delete(uuid) TO authenticated, service_role';
  END IF;

  -- Clone OP Produção (member)
  IF to_regprocedure('public.industria_producao_clone_ordem(uuid)') IS NOT NULL
     AND to_regprocedure('public.industria_producao_clone_ordem__unsafe(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.industria_producao_clone_ordem(uuid) RENAME TO industria_producao_clone_ordem__unsafe';
  END IF;
  IF to_regprocedure('public.industria_producao_clone_ordem__unsafe(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_clone_ordem__unsafe(uuid) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_clone_ordem__unsafe(uuid) TO service_role, postgres';
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_producao_clone_ordem(p_source_id uuid)
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_empresa_role_at_least('member');
        RETURN public.industria_producao_clone_ordem__unsafe(p_source_id);
      END;
      $body$;
    $sql$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_clone_ordem(uuid) FROM public, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_clone_ordem(uuid) TO authenticated, service_role';
  END IF;

END
$rbac$;

COMMIT;
