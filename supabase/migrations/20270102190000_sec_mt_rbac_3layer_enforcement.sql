/*
  Lote 1 (Estado da Arte - Segurança/RBAC)

  - SEC-MT-01: RLS consistente por empresa (multi-tenant)
  - SEC-MT-03: remover bypass óbvio via console (ex.: empresas com SELECT público)
  - SEC-RBAC-02: enforcement DB (RLS) para tabelas acessadas direto pelo app

  Estratégia:
  - Fixar `public.empresas` para ser "membership-only" (não público).
  - Para tabelas chave com `empresa_id` (NOT NULL) e acesso direto via PostgREST:
    recriar policies de CRUD com:
      - empresa_id = current_empresa_id()
      - has_permission_for_current_user(module, action)
    e sempre permitir service_role (jobs/webhooks).
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Fix: public.empresas não pode ser SELECT público
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  pol record;
BEGIN
  IF to_regclass('public.empresas') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.empresas FORCE ROW LEVEL SECURITY';

  -- Remove todas as policies existentes (inclui "Enable read access for all users").
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'empresas'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.empresas', pol.policyname);
  END LOOP;

  -- Select apenas para membros (ou owner_id), e sempre para service_role.
  EXECUTE $p$
    CREATE POLICY empresas_select_members
    ON public.empresas
    FOR SELECT
    TO authenticated, service_role
    USING (
      public.is_service_role()
      OR owner_id = public.current_user_id()
      OR EXISTS (
        SELECT 1
        FROM public.empresa_usuarios eu
        WHERE eu.empresa_id = public.empresas.id
          AND eu.user_id = public.current_user_id()
      )
    );
  $p$;

  -- Grants mínimos (RLS faz o enforcement).
  EXECUTE 'GRANT SELECT ON TABLE public.empresas TO authenticated, service_role';
END $$;

-- -----------------------------------------------------------------------------
-- 2) RLS + RBAC para tabelas "direto no app" (CRUD por permissão)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t record;
  pol record;
  v_table regclass;
  v_sql text;
BEGIN
  FOR t IN
    SELECT *
    FROM (VALUES
      -- Cadastros
      ('pessoas', 'partners'),
      ('pessoa_enderecos', 'partners'),
      ('pessoa_contatos', 'partners'),
      ('produtos', 'produtos'),
      ('produto_grupos', 'produtos'),
      ('produto_imagens', 'produtos'),
      ('transportadoras', 'logistica'),

      -- Serviços (contratos/notas/cobranças) - acesso direto no MVP
      ('servicos_contratos', 'servicos'),
      ('servicos_notas', 'servicos'),
      ('servicos_cobrancas', 'servicos'),

      -- Suprimentos (recebimentos)
      ('recebimentos', 'suprimentos'),
      ('recebimento_itens', 'suprimentos'),
      ('recebimento_conferencias', 'suprimentos'),

      -- Vendas
      ('vendedores', 'vendedores'),
      ('vendas_pedidos', 'vendas'),
      ('vendas_itens_pedido', 'vendas'),
      ('vendas_expedicoes', 'vendas'),
      ('vendas_expedicao_eventos', 'vendas'),
      ('vendas_automacoes', 'vendas'),
      ('vendas_devolucoes', 'vendas'),
      ('vendas_devolucao_itens', 'vendas'),
      ('metas_vendas', 'vendas'),

      -- Financeiro (onboarding e tesouraria)
      ('financeiro_contas_correntes', 'tesouraria'),
      ('financeiro_movimentacoes', 'tesouraria'),
      ('financeiro_extratos_bancarios', 'tesouraria'),
      ('centros_de_custo', 'centros_de_custo')
    ) AS v(table_name, module)
  LOOP
    v_table := to_regclass('public.' || t.table_name);
    IF v_table IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t.table_name);

    -- Drop policies existentes para evitar bypass via console (mantemos apenas o que recriamos aqui).
    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t.table_name
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t.table_name);
    END LOOP;

    -- service_role: sempre liberado (jobs/webhooks/ops).
    v_sql := format($pol$
      CREATE POLICY sec_rbac_%1$I_service_role
      ON public.%1$I
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    $pol$, t.table_name);
    EXECUTE v_sql;

    -- authenticated: empresa ativa + permissão por ação.
    v_sql := format($pol$
      CREATE POLICY sec_rbac_%1$I_select
      ON public.%1$I
      FOR SELECT
      TO authenticated
      USING (
        empresa_id = public.current_empresa_id()
        AND public.has_permission_for_current_user(%2$L, 'view')
      );

      CREATE POLICY sec_rbac_%1$I_insert
      ON public.%1$I
      FOR INSERT
      TO authenticated
      WITH CHECK (
        empresa_id = public.current_empresa_id()
        AND public.has_permission_for_current_user(%2$L, 'create')
      );

      CREATE POLICY sec_rbac_%1$I_update
      ON public.%1$I
      FOR UPDATE
      TO authenticated
      USING (
        empresa_id = public.current_empresa_id()
        AND public.has_permission_for_current_user(%2$L, 'update')
      )
      WITH CHECK (
        empresa_id = public.current_empresa_id()
        AND public.has_permission_for_current_user(%2$L, 'update')
      );

      CREATE POLICY sec_rbac_%1$I_delete
      ON public.%1$I
      FOR DELETE
      TO authenticated
      USING (
        empresa_id = public.current_empresa_id()
        AND public.has_permission_for_current_user(%2$L, 'delete')
      );
    $pol$, t.table_name, t.module);
    EXECUTE v_sql;

    -- Grants (RLS faz o enforcement; sem GRANT vira 403 “permission denied”).
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated, service_role', t.table_name);
  END LOOP;
END $$;

-- Reload do cache do PostgREST
SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

