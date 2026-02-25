-- RG-03: asserts de banco para evitar regressões que viram erros no console
-- (ex.: RPC ambígua, grants faltando em JOIN/embeds, colunas inexistentes)

\set ON_ERROR_STOP on

do $$
begin
  -- 0) Woo diagnostics deve ler secrets corretamente (evita "salva e volta a não armazenada")
  -- Guardrails:
  -- - deve usar FOUND (v_conn_found) e NÃO depender de null-check ambíguo em record/rowtype
  -- - deve referenciar woo_consumer_key/woo_consumer_secret no cálculo
  if to_regprocedure('public.ecommerce_connection_diagnostics(text)') is not null then
    if position('v_conn_found' in (select pg_get_functiondef('public.ecommerce_connection_diagnostics(text)'::regprocedure))) = 0 then
      raise exception 'RG-03: public.ecommerce_connection_diagnostics não usa v_conn_found/FOUND (risco de false negative em has_consumer_key).';
    end if;
    if position('woo_consumer_key' in (select pg_get_functiondef('public.ecommerce_connection_diagnostics(text)'::regprocedure))) = 0
       or position('woo_consumer_secret' in (select pg_get_functiondef('public.ecommerce_connection_diagnostics(text)'::regprocedure))) = 0
    then
      raise exception 'RG-03: public.ecommerce_connection_diagnostics não referencia woo_consumer_key/woo_consumer_secret.';
    end if;
    if position('public.ecommerces%rowtype' in lower((select pg_get_functiondef('public.ecommerce_connection_diagnostics(text)'::regprocedure)))) > 0 then
      raise exception 'RG-03: public.ecommerce_connection_diagnostics usa %%ROWTYPE + SELECT explícito (risco de desalinhamento por ordem de colunas).';
    end if;
  end if;

  -- 0.1) RPC de preview da exclusão OPS precisa ser VOLATILE
  -- (usa CREATE TEMP TABLE/INSERT; STABLE quebra em runtime com 0A000)
  if to_regprocedure('public.ops_account_delete_preview_current_empresa()') is not null then
    if not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'ops_account_delete_preview_current_empresa'
        and p.pronargs = 0
        and p.provolatile = 'v'
    ) then
      raise exception 'RG-03: public.ops_account_delete_preview_current_empresa() deve ser VOLATILE (usa TEMP TABLE).';
    end if;
  end if;

  -- 0.2) Hard delete OPS não pode apagar storage.objects diretamente via SQL
  -- (Storage exige Storage API para evitar perda acidental de objetos)
  if to_regprocedure('public.ops_account_delete_current_empresa(text,text)') is not null then
    if position('delete from storage.objects' in lower((select pg_get_functiondef('public.ops_account_delete_current_empresa(text,text)'::regprocedure)))) > 0 then
      raise exception 'RG-03: public.ops_account_delete_current_empresa() não pode executar DELETE direto em storage.objects; use Storage API.';
    end if;
  end if;

  -- 0.3) Fluxo de Caixa (centered): contas a receber deve incluir status "parcial" no previsto
  -- Evita regressão: títulos parcialmente pagos sumirem do gráfico.
  if to_regprocedure('public.financeiro_fluxo_caixa_centered(int)') is not null then
    if position(
      '''parcial''::public.status_conta_receber' in
      (select pg_get_functiondef('public.financeiro_fluxo_caixa_centered(int)'::regprocedure))
    ) = 0 then
      raise exception 'RG-03: public.financeiro_fluxo_caixa_centered(int) deve incluir status_conta_receber=parcial no previsto (receber_previsto).';
    end if;
  end if;

  -- 1) Evita PostgREST HTTP_300 por overload ambíguo
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'compras_list_pedidos'
      and p.pronargs = 2
  ) then
    raise exception 'RG-03: overload de public.compras_list_pedidos com 2 args ainda existe (causa HTTP_300).';
  end if;

  -- 2) View `empresa_features` deve conter campos usados pelo app (evita 400/403)
  if not exists (select 1 from information_schema.views where table_schema = 'public' and table_name = 'empresa_features') then
    raise exception 'RG-03: view public.empresa_features não existe.';
  end if;

  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='empresa_features' and column_name='plano_mvp') then
    raise exception 'RG-03: view public.empresa_features sem coluna plano_mvp.';
  end if;

  -- 3) `fiscal_nfe_emissoes.updated_at` é usado em ordenação; precisa existir
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='fiscal_nfe_emissoes' and column_name='updated_at') then
    raise exception 'RG-03: tabela public.fiscal_nfe_emissoes sem coluna updated_at.';
  end if;

  -- 4) Grants mínimos que evitam 403 em embeds/relatórios no app
  if not has_table_privilege('authenticated', 'public.fiscal_nfe_imports', 'select') then
    raise exception 'RG-03: role authenticated sem SELECT em public.fiscal_nfe_imports (causa 403 em recebimentos).';
  end if;

  if not has_table_privilege('authenticated', 'public.pessoas', 'select') then
    raise exception 'RG-03: role authenticated sem SELECT em public.pessoas (causa 403 em parceiros/RPCs).';
  end if;

  -- 4.0b) Entitlements/audit devem ser RPC-first (evita bypass e 403 intermitente por grants inconsistentes)
  if has_table_privilege('authenticated', 'public.empresa_entitlements', 'select')
     or has_table_privilege('authenticated', 'public.empresa_entitlements', 'insert')
     or has_table_privilege('authenticated', 'public.empresa_entitlements', 'update')
     or has_table_privilege('authenticated', 'public.empresa_entitlements', 'delete')
  then
    raise exception 'RG-03: tabela public.empresa_entitlements ainda possui grants diretos para authenticated (deve ser RPC-first).';
  end if;

  if has_table_privilege('authenticated', 'public.audit_logs', 'select')
     or has_table_privilege('authenticated', 'public.audit_logs', 'insert')
     or has_table_privilege('authenticated', 'public.audit_logs', 'update')
     or has_table_privilege('authenticated', 'public.audit_logs', 'delete')
  then
    raise exception 'RG-03: tabela public.audit_logs ainda possui grants diretos para authenticated (deve ser RPC-first).';
  end if;

  -- 4.0c) Vendedores deve ser RPC-first (evita bypass e inconsistência de grants)
  if has_table_privilege('authenticated', 'public.vendedores', 'select')
     or has_table_privilege('authenticated', 'public.vendedores', 'insert')
     or has_table_privilege('authenticated', 'public.vendedores', 'update')
     or has_table_privilege('authenticated', 'public.vendedores', 'delete')
  then
    raise exception 'RG-03: tabela public.vendedores ainda possui grants diretos para authenticated (deve ser RPC-first).';
  end if;

  -- 4.0) Recebimentos devem ser RPC-first (evita bypass/instabilidade por acesso direto via PostgREST)
  if has_table_privilege('authenticated', 'public.recebimentos', 'select')
     or has_table_privilege('authenticated', 'public.recebimentos', 'insert')
     or has_table_privilege('authenticated', 'public.recebimentos', 'update')
     or has_table_privilege('authenticated', 'public.recebimentos', 'delete')
  then
    raise exception 'RG-03: tabela public.recebimentos ainda possui grants diretos para authenticated (deve ser RPC-first).';
  end if;

  if has_table_privilege('authenticated', 'public.recebimento_itens', 'select')
     or has_table_privilege('authenticated', 'public.recebimento_itens', 'insert')
     or has_table_privilege('authenticated', 'public.recebimento_itens', 'update')
     or has_table_privilege('authenticated', 'public.recebimento_itens', 'delete')
  then
    raise exception 'RG-03: tabela public.recebimento_itens ainda possui grants diretos para authenticated (deve ser RPC-first).';
  end if;

  -- 4.1) MVP Menu: tabelas/perm/grants (evita 403/404 nos novos módulos)
  if not exists (select 1 from public.permissions where module='vendedores' and action='view') then
    raise exception 'RG-03: permissão vendedores:view ausente (MVP menu).';
  end if;
  if not exists (select 1 from public.permissions where module='suporte' and action='view') then
    raise exception 'RG-03: permissão suporte:view ausente (MVP menu).';
  end if;

  if to_regclass('public.vendedores') is null then
    raise exception 'RG-03: tabela public.vendedores ausente (MVP menu).';
  end if;
  if to_regclass('public.vendas_expedicoes') is null then
    raise exception 'RG-03: tabela public.vendas_expedicoes ausente (MVP menu).';
  end if;
  if to_regclass('public.vendas_automacoes') is null then
    raise exception 'RG-03: tabela public.vendas_automacoes ausente (MVP menu).';
  end if;
  if to_regclass('public.vendas_devolucoes') is null then
    raise exception 'RG-03: tabela public.vendas_devolucoes ausente (MVP menu).';
  end if;
  if to_regclass('public.vendas_devolucao_itens') is null then
    raise exception 'RG-03: tabela public.vendas_devolucao_itens ausente (MVP menu).';
  end if;
  if to_regclass('public.servicos_contratos') is null then
    raise exception 'RG-03: tabela public.servicos_contratos ausente (MVP menu).';
  end if;
  if to_regclass('public.servicos_notas') is null then
    raise exception 'RG-03: tabela public.servicos_notas ausente (MVP menu).';
  end if;
  if to_regclass('public.servicos_cobrancas') is null then
    raise exception 'RG-03: tabela public.servicos_cobrancas ausente (MVP menu).';
  end if;

  -- Serviços (MVP): preferir RPC-first. Se as RPCs existirem, as tabelas NÃO devem ter grants diretos para authenticated.
  -- Mantém fallback para ambientes antigos (sem as RPCs) para evitar “menu quebra com 404/403”.
  if to_regprocedure('public.servicos_contratos_list(integer)') is not null then
    if has_table_privilege('authenticated', 'public.servicos_contratos', 'select')
       or has_table_privilege('authenticated', 'public.servicos_contratos', 'insert')
       or has_table_privilege('authenticated', 'public.servicos_contratos', 'update')
       or has_table_privilege('authenticated', 'public.servicos_contratos', 'delete')
    then
      raise exception 'RG-03: tabela public.servicos_contratos ainda possui grants diretos para authenticated (deve ser RPC-first).';
    end if;
  else
    if not has_table_privilege('authenticated', 'public.servicos_contratos', 'select') then
      raise exception 'RG-03: role authenticated sem SELECT em public.servicos_contratos (MVP menu; legacy sem RPC).';
    end if;
  end if;

  if to_regprocedure('public.servicos_notas_list(integer)') is not null then
    if has_table_privilege('authenticated', 'public.servicos_notas', 'select')
       or has_table_privilege('authenticated', 'public.servicos_notas', 'insert')
       or has_table_privilege('authenticated', 'public.servicos_notas', 'update')
       or has_table_privilege('authenticated', 'public.servicos_notas', 'delete')
    then
      raise exception 'RG-03: tabela public.servicos_notas ainda possui grants diretos para authenticated (deve ser RPC-first).';
    end if;
  end if;

  if to_regprocedure('public.servicos_cobrancas_list(integer)') is not null then
    if has_table_privilege('authenticated', 'public.servicos_cobrancas', 'select')
       or has_table_privilege('authenticated', 'public.servicos_cobrancas', 'insert')
       or has_table_privilege('authenticated', 'public.servicos_cobrancas', 'update')
       or has_table_privilege('authenticated', 'public.servicos_cobrancas', 'delete')
    then
      raise exception 'RG-03: tabela public.servicos_cobrancas ainda possui grants diretos para authenticated (deve ser RPC-first).';
    end if;
  end if;

  -- 5) IND-03: Gerar Execução deve aceitar roteiro tipo_bom='ambos' (evita erro em OP/OB sem roteiro específico)
  IF to_regprocedure('public.industria_ordem_gerar_execucao(uuid, uuid)') IS NOT NULL THEN
    <<ind03>>
    DECLARE
      v_user uuid := gen_random_uuid();
      v_empresa uuid := gen_random_uuid();
      v_prod uuid;
      v_cliente uuid;
      v_material uuid;
      v_ct uuid;
      v_roteiro uuid;
      v_ord_op uuid;
      v_ord_ob uuid;
      v_result jsonb;
    BEGIN
      PERFORM set_config('request.jwt.claim.sub', v_user::text, true);

      INSERT INTO auth.users(id, aud, role, email, created_at, updated_at)
      VALUES (v_user, 'authenticated', 'authenticated', 'rg03+' || replace(v_user::text, '-', '') || '@example.com', now(), now())
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.empresas(id, nome_razao_social, razao_social, fantasia, nome)
      VALUES (v_empresa, 'RG03 Empresa LTDA', 'RG03 Empresa LTDA', 'RG03', 'RG03')
      ON CONFLICT DO NOTHING;
      INSERT INTO public.empresa_usuarios(empresa_id, user_id, role) VALUES (v_empresa, v_user, 'admin') ON CONFLICT DO NOTHING;
      INSERT INTO public.user_active_empresa(user_id, empresa_id) VALUES (v_user, v_empresa) ON CONFLICT DO NOTHING;

      INSERT INTO public.produtos(empresa_id, nome, unidade, ativo, icms_origem)
      VALUES (v_empresa, 'RG03 Produto', 'un', true, 0)
      RETURNING id INTO v_prod;
      INSERT INTO public.pessoas(empresa_id, nome, tipo) VALUES (v_empresa, 'RG03 Cliente', 'cliente') RETURNING id INTO v_cliente;
      INSERT INTO public.industria_materiais_cliente(empresa_id, cliente_id, produto_id, unidade, ativo)
      VALUES (v_empresa, v_cliente, v_prod, 'un', true)
      RETURNING id INTO v_material;
      INSERT INTO public.industria_centros_trabalho(empresa_id, nome, ativo) VALUES (v_empresa, 'RG03 CT', true) RETURNING id INTO v_ct;

      INSERT INTO public.industria_roteiros(
        empresa_id, produto_id, tipo_bom, codigo, descricao, versao, ativo, padrao_para_producao, padrao_para_beneficiamento
      ) VALUES (
        v_empresa, v_prod, 'ambos', 'RG03-ROT', 'Roteiro Ambos', '1.0', true, true, true
      ) RETURNING id INTO v_roteiro;

      INSERT INTO public.industria_roteiros_etapas(
        empresa_id, roteiro_id, sequencia, centro_trabalho_id, nome, tipo_operacao, permitir_overlap, tempo_setup_min, tempo_ciclo_min_por_unidade
      ) VALUES (
        v_empresa, v_roteiro, 10, v_ct, 'Operação 1', 'producao', false, 0, 1
      );

      INSERT INTO public.industria_ordens(
        empresa_id, tipo_ordem, produto_final_id, quantidade_planejada, unidade, status
      ) VALUES (
        v_empresa, 'industrializacao', v_prod, 1, 'un', 'rascunho'
      ) RETURNING id INTO v_ord_op;

      INSERT INTO public.industria_ordens(
        empresa_id, tipo_ordem, produto_final_id, quantidade_planejada, unidade, status, cliente_id, usa_material_cliente, material_cliente_id
      ) VALUES (
        v_empresa, 'beneficiamento', v_prod, 1, 'un', 'rascunho', v_cliente, true, v_material
      ) RETURNING id INTO v_ord_ob;

      v_result := public.industria_ordem_gerar_execucao(v_ord_op, null);
      IF coalesce((v_result->>'operacoes')::int, 0) <= 0 THEN
        RAISE EXCEPTION 'RG-03: industria_ordem_gerar_execucao(OP) não gerou operações.';
      END IF;

      v_result := public.industria_ordem_gerar_execucao(v_ord_ob, null);
      IF coalesce((v_result->>'operacoes')::int, 0) <= 0 THEN
        RAISE EXCEPTION 'RG-03: industria_ordem_gerar_execucao(OB) não gerou operações.';
      END IF;
    EXCEPTION WHEN undefined_table THEN
      -- ambiente antigo sem indústria completa: ignora
      NULL;
    END ind03;
  END IF;

  -- 6) IND-05: Qualidade deve ter auditoria (triggers em tabelas críticas)
  IF to_regclass('public.audit_logs') IS NOT NULL AND to_regprocedure('public.process_audit_log()') IS NOT NULL THEN
    IF to_regclass('public.estoque_lotes') IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'audit_logs_trigger'
          AND tgrelid = 'public.estoque_lotes'::regclass
      ) THEN
        RAISE EXCEPTION 'RG-03: audit_logs_trigger ausente em public.estoque_lotes (IND-05).';
      END IF;
    END IF;

    IF to_regclass('public.industria_qualidade_motivos') IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'audit_logs_trigger'
          AND tgrelid = 'public.industria_qualidade_motivos'::regclass
      ) THEN
        RAISE EXCEPTION 'RG-03: audit_logs_trigger ausente em public.industria_qualidade_motivos (IND-05).';
      END IF;
    END IF;

    IF to_regclass('public.industria_qualidade_planos') IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'audit_logs_trigger'
          AND tgrelid = 'public.industria_qualidade_planos'::regclass
      ) THEN
        RAISE EXCEPTION 'RG-03: audit_logs_trigger ausente em public.industria_qualidade_planos (IND-05).';
      END IF;
    END IF;

    IF to_regclass('public.industria_qualidade_plano_caracteristicas') IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'audit_logs_trigger'
          AND tgrelid = 'public.industria_qualidade_plano_caracteristicas'::regclass
      ) THEN
        RAISE EXCEPTION 'RG-03: audit_logs_trigger ausente em public.industria_qualidade_plano_caracteristicas (IND-05).';
      END IF;
    END IF;

    IF to_regclass('public.industria_qualidade_inspecoes') IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'audit_logs_trigger'
          AND tgrelid = 'public.industria_qualidade_inspecoes'::regclass
      ) THEN
        RAISE EXCEPTION 'RG-03: audit_logs_trigger ausente em public.industria_qualidade_inspecoes (IND-05).';
      END IF;
    END IF;
  END IF;

  -- 7) IND-06: Relatórios essenciais devem existir (RPCs leves)
  IF to_regprocedure('public.industria_relatorio_wip(integer)') IS NULL THEN
    RAISE EXCEPTION 'RG-03: RPC public.industria_relatorio_wip(integer) não existe (IND-06).';
  END IF;
  IF to_regprocedure('public.qualidade_kpis(integer)') IS NULL THEN
    RAISE EXCEPTION 'RG-03: RPC public.qualidade_kpis(integer) não existe (IND-06).';
  END IF;

  -- 8) SEC-01: tabelas com empresa_id devem ter RLS habilitado (evita vazamento cross-empresa)
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity IS FALSE
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns ic
        WHERE ic.table_schema = 'public'
          AND ic.table_name = c.relname
          AND ic.column_name = 'empresa_id'
      )
  ) THEN
    RAISE EXCEPTION 'SEC-01/RG-03: existem tabelas com empresa_id sem RLS habilitado (verifique migrations).';
  END IF;

  -- 8.1) SEC-01b: inventário RLS não pode ter itens "MÉDIO" (tabela com grants + empresa_id + RLS ON, mas sem policy current_empresa_id)
  -- Evita regressões que voltam a gerar 403 intermitente em tenants.
  IF EXISTS (
    SELECT 1
    FROM public.ops_rls_inventory_list(NULL, 5000, 0)
    WHERE (grants_select OR grants_insert OR grants_update OR grants_delete)
      AND has_empresa_id
      AND rls_enabled
      AND NOT has_current_empresa_policy
  ) THEN
    RAISE EXCEPTION 'SEC-01b/RG-03: inventário RLS com itens MÉDIO (grants + empresa_id, mas sem policy current_empresa_id).';
  END IF;

  -- 9) SEC-02: RPCs SECURITY DEFINER usadas pelo app devem exigir permissão (anti-burla via console)
	  IF EXISTS (
	    SELECT 1
	    FROM pg_proc p
	    JOIN pg_namespace n ON n.oid = p.pronamespace
	    WHERE n.nspname = 'public'
	      AND p.prosecdef IS TRUE
      AND p.proname = ANY(ARRAY[
        'create_recebimento_from_xml',
        'compras_manage_item',
        'compras_receber_pedido',
        'conferir_item_recebimento',
        'crm_delete_oportunidade',
        'crm_ensure_default_pipeline',
        'crm_move_oportunidade',
        'crm_upsert_oportunidade',
        'delete_conta_a_receber',
        'delete_meta_venda',
        'delete_os_for_current_user',
        'delete_partner',
        'delete_product_for_current_user',
        'delete_product_image_db',
        'set_principal_product_image',
        'list_produto_grupos',
        'upsert_produto_grupo',
        'delete_produto_grupo',
        'finalizar_recebimento',
        'financeiro_centros_custos_delete',
        'financeiro_cobrancas_bancarias_delete',
        'financeiro_conta_pagar_cancelar',
        'financeiro_conta_pagar_estornar',
        'financeiro_conta_pagar_estornar_v2',
        'financeiro_contas_correntes_delete',
        'financeiro_contas_pagar_delete',
        'financeiro_movimentacoes_delete',
        'financeiro_movimentacoes_upsert',
        'fiscal_nfe_preview_xml',
        'fiscal_nfe_recalc_totais',
        'industria_aplicar_bom_em_ordem_beneficiamento',
        'industria_aplicar_bom_em_ordem_producao',
        'industria_automacao_upsert',
        'industria_bom_delete',
        'industria_bom_manage_componente',
        'industria_ct_aps_config_upsert',
        'industria_ct_calendario_upsert',
        'industria_delete_ordem',
        'industria_manage_componente',
        'industria_manage_entrega',
        'industria_materiais_cliente_delete',
        'industria_operacao_apontar_execucao',
        'industria_operacao_aps_lock_set',
        'industria_operacao_doc_delete',
        'industria_operacao_replanejar',
        'industria_operacao_update_status',
        'industria_operador_delete',
        'industria_producao_apontar_producao',
        'industria_producao_consumir',
        'industria_producao_delete_apontamento',
        'industria_producao_fechar',
        'industria_producao_gerar_operacoes',
        'industria_producao_manage_componente',
        'industria_producao_manage_entrega',
        'industria_producao_ordens_delete',
        'industria_producao_registrar_entrega',
        'industria_producao_registrar_evento',
        'industria_producao_reservar',
        'industria_producao_reset_operacao',
        'industria_producao_reset_ordem',
        'industria_producao_set_qa_requirements',
        'industria_producao_transferir_lote',
        'industria_producao_update_status',
        'industria_roteiros_manage_etapa',
        'industria_update_ordem_status',
        'log_app_event',
        'log_app_trace',
        'logistica_transportadoras_delete',
        'mrp_reprocessar_ordem',
        'os_doc_delete',
        'os_set_status_for_current_user',
        'qualidade_adicionar_motivo',
        'qualidade_alterar_status_lote',
        'qualidade_excluir_motivo',
        'qualidade_plano_delete_caracteristica',
        'qualidade_planos_delete',
        'qualidade_registrar_inspecao',
        'recebimento_cancelar',
        'recebimento_delete',
        'recebimento_set_classificacao',
        'recebimento_sync_materiais_cliente',
        'restore_partner',
        'rh_doc_delete',
        'rh_encerrar_afastamento',
        'rh_manage_participante',
        'rh_set_cargo_ativo',
        'rh_set_colaborador_ativo',
        'seed_rh_module',
        'suprimentos_registrar_movimento',
        'update_os_data_prevista',
        'update_os_order',
        'vendas_aprovar_pedido',
        'vendas_manage_item'
      ])
      AND pg_get_functiondef(p.oid) NOT ILIKE '%require_permission_for_current_user%'
	  ) THEN
	    RAISE EXCEPTION 'SEC-02/RG-03: existem RPCs SECURITY DEFINER usadas pelo app sem guard de permissão.';
	  END IF;

	  -- 9.1) SEC-02b: Todas as funções SECURITY DEFINER em `public` devem ter search_path fixo (pg_catalog, public)
	  IF EXISTS (
	    SELECT 1
	    FROM pg_proc p
	    JOIN pg_namespace n ON n.oid = p.pronamespace
	    WHERE n.nspname = 'public'
	      AND p.prosecdef IS TRUE
	      AND NOT EXISTS (
	        SELECT 1
	        FROM unnest(coalesce(p.proconfig, array[]::text[])) cfg
	        WHERE cfg LIKE 'search_path=%'
	          AND cfg LIKE '%pg_catalog%'
	      )
	  ) THEN
	    RAISE EXCEPTION 'SEC-02b/RG-03: existem funções SECURITY DEFINER em public sem search_path fixo (pg_catalog, public).';
	  END IF;

	  -- 9.2) SVC-CT-02: gerar títulos de contrato exige colunas de origem em servicos_cobrancas
	  IF to_regprocedure('public.servicos_contratos_billing_generate_receivables(uuid, date, integer)') IS NOT NULL THEN
	    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name='servicos_cobrancas'
        AND column_name IN ('origem_tipo','origem_id','observacoes')
      GROUP BY table_schema, table_name
      HAVING count(*) = 3
    ) THEN
      RAISE EXCEPTION 'RG-03/SVC-CT-02: public.servicos_cobrancas sem colunas origem_tipo/origem_id/observacoes (gera 400 no RPC de títulos).';
    END IF;

    -- Não depender de enum que pode não existir em ambientes antigos.
    IF pg_get_functiondef('public.servicos_contratos_billing_generate_receivables(uuid, date, integer)'::regprocedure) ILIKE '%::public.status_cobranca%' THEN
      RAISE EXCEPTION 'RG-03/SVC-CT-02: RPC generate_receivables referencia public.status_cobranca (tipo pode não existir).';
    END IF;
  END IF;

  -- 10) OPS-403: observabilidade 403 deve existir (evita regressão de diagnóstico)
  IF to_regclass('public.ops_403_events') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name='ops_403_events'
        AND column_name IN (
          'id',
          'created_at',
          'empresa_id',
          'user_id',
          'request_id',
          'route',
          'rpc_fn',
          'http_status',
          'code',
          'message',
          'details',
          'resolved',
          'kind',
          'plano_mvp',
          'role',
          'recovery_attempted',
          'recovery_ok'
        )
      GROUP BY table_schema, table_name
      HAVING count(*) = 17
    ) THEN
      RAISE EXCEPTION 'RG-03/OPS-403: schema de public.ops_403_events não contém colunas esperadas.';
    END IF;
  END IF;

  -- 10.1) MT-EMPID-01: guardrails empresa_id NN devem estar validados em VERIFY
  -- (em PROD pode haver legado; em VERIFY esperamos schema "limpo" e enforcement real).
  IF EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND con.contype = 'c'
      AND (
        con.conname ~ '^ck_.*_empresa_id_nn$'
        OR con.conname ~ '^ck_empid_nn_.*$'
      )
      AND rel.relname NOT IN (
        'ops_403_events',
        'ops_app_errors',
        'unidades_medida',
        'embalagens'
      )
      AND con.convalidated IS DISTINCT FROM true
  ) THEN
    RAISE EXCEPTION 'RG-03/MT-EMPID-01: existem constraints empresa_id NN (guardrails) ainda NOT VALID no ambiente verify.';
  END IF;

  -- 10.2) MT-RLS-01: não pode haver itens "MÉDIO" no inventário RLS (grants + empresa_id + RLS ON, mas sem policy tenant-safe).
  IF to_regprocedure('public.ops_rls_inventory_list(text, int, int)') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.ops_rls_inventory_list(NULL, 5000, 0) r
      WHERE (r.grants_select OR r.grants_insert OR r.grants_update OR r.grants_delete)
        AND r.has_empresa_id
        AND r.rls_enabled
        AND NOT r.has_current_empresa_policy
        AND r.table_name NOT LIKE 'ops_%'
        AND r.table_name NOT IN ('unidades_medida', 'embalagens')
      LIMIT 1
    ) THEN
      RAISE EXCEPTION 'RG-03/MT-RLS-01: existem tabelas com grants + empresa_id + RLS ON, mas sem policy tenant-safe (current_empresa_id()/membership). Corrija via migrations antes de promover.';
    END IF;
  END IF;

  -- 9.1) SVC-CT-01: evita bug de assignment de composite via SELECT INTO (causa 400 e console sujo)
  -- Em PL/pgSQL, `SELECT func() INTO v_composite;` com select-list de 1 coluna
  -- tenta atribuir ao *primeiro campo* do composite, gerando cast inválido para uuid.
  IF to_regprocedure('public.servicos_contratos_billing_generate_schedule(uuid, integer)') IS NOT NULL THEN
    IF pg_get_functiondef('public.servicos_contratos_billing_generate_schedule(uuid, integer)'::regprocedure) ILIKE '%select%servicos_contratos_billing_ensure_rule%into v_rule%' THEN
      RAISE EXCEPTION 'RG-03/SVC-CT-01: public.servicos_contratos_billing_generate_schedule ainda usa SELECT ... INTO v_rule (use :=).';
    END IF;
  END IF;

  IF to_regprocedure('public.servicos_contratos_billing_generate_receivables(uuid, date, integer)') IS NOT NULL THEN
    IF pg_get_functiondef('public.servicos_contratos_billing_generate_receivables(uuid, date, integer)'::regprocedure) ILIKE '%select%servicos_contratos_billing_ensure_rule%into v_rule%' THEN
      RAISE EXCEPTION 'RG-03/SVC-CT-01: public.servicos_contratos_billing_generate_receivables ainda usa SELECT ... INTO v_rule (use :=).';
    END IF;
  END IF;

  IF to_regprocedure('public.servicos_contratos_billing_add_avulso(uuid, date, numeric, text)') IS NOT NULL THEN
    IF pg_get_functiondef('public.servicos_contratos_billing_add_avulso(uuid, date, numeric, text)'::regprocedure) ILIKE '%select%servicos_contratos_billing_ensure_rule%into v_rule%' THEN
      RAISE EXCEPTION 'RG-03/SVC-CT-01: public.servicos_contratos_billing_add_avulso ainda usa SELECT ... INTO v_rule (use :=).';
    END IF;
  END IF;

  IF to_regprocedure('public.servicos_contratos_billing_recalc_mensal_future(uuid, date)') IS NOT NULL THEN
    IF pg_get_functiondef('public.servicos_contratos_billing_recalc_mensal_future(uuid, date)'::regprocedure) ILIKE '%select%servicos_contratos_billing_ensure_rule%into v_rule%' THEN
      RAISE EXCEPTION 'RG-03/SVC-CT-01: public.servicos_contratos_billing_recalc_mensal_future ainda usa SELECT ... INTO v_rule (use :=).';
    END IF;
  END IF;

  -- 9) FIN-REC-01: gerar recorrências (pagar) não pode falhar em runtime por mismatch de parâmetros ($19)
  IF to_regprocedure('public.financeiro_recorrencias_upsert(jsonb)') IS NOT NULL
     AND to_regprocedure('public.financeiro_recorrencias_generate(uuid, date, int)') IS NOT NULL
     AND to_regclass('public.financeiro_contas_pagar') IS NOT NULL
  THEN
    <<fin_rec01>>
    DECLARE
      v_user uuid := gen_random_uuid();
      v_empresa uuid := gen_random_uuid();
      v_fornecedor uuid;
      v_rec_id uuid;
      v_result jsonb;
    BEGIN
      -- Setup
      INSERT INTO auth.users(id, aud, role, email, created_at, updated_at)
      VALUES (v_user, 'authenticated', 'authenticated', 'finrec01+' || replace(v_user::text, '-', '') || '@example.com', now(), now())
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.empresas(id, nome_razao_social, razao_social, fantasia, nome)
      VALUES (v_empresa, 'FINREC01 Empresa LTDA', 'FINREC01 Empresa LTDA', 'FINREC01', 'FINREC01')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.empresa_usuarios(empresa_id, user_id, role, created_at)
      VALUES (v_empresa, v_user, 'admin', now())
      ON CONFLICT DO NOTHING;

      INSERT INTO public.user_active_empresa(user_id, empresa_id, updated_at)
      VALUES (v_user, v_empresa, now())
      ON CONFLICT (user_id) DO UPDATE SET empresa_id = excluded.empresa_id, updated_at = excluded.updated_at;

      -- Fornecedor mínimo (quando tabela pessoas existir)
      IF to_regclass('public.pessoas') IS NOT NULL THEN
        INSERT INTO public.pessoas(empresa_id, nome, tipo)
        VALUES (v_empresa, 'FINREC01 Fornecedor', 'fornecedor')
        RETURNING id INTO v_fornecedor;
      ELSE
        v_fornecedor := gen_random_uuid();
      END IF;

      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM set_config('request.jwt.claim.sub', v_user::text, true);

      SELECT public.financeiro_recorrencias_upsert(
        jsonb_build_object(
          'tipo','pagar',
          'ativo',true,
          'frequencia','mensal',
          'ajuste_dia_util','proximo_dia_util',
          'start_date',to_char(current_date + 7, 'YYYY-MM-DD'),
          'descricao','FINREC01 Conta recorrente',
          'fornecedor_id',v_fornecedor::text,
          'valor_total','100.00'
        )
      ) INTO v_result;

      v_rec_id := nullif(v_result->>'id','')::uuid;
      IF v_rec_id IS NULL THEN
        RAISE EXCEPTION 'RG-03/FIN-REC-01: upsert não retornou id.';
      END IF;

      -- Deve executar sem erro (era aqui que estourava "there is no parameter $19")
      SELECT public.financeiro_recorrencias_generate(v_rec_id, null, 1) INTO v_result;

      IF coalesce(v_result->>'status','') <> 'ok' THEN
        RAISE EXCEPTION 'RG-03/FIN-REC-01: generate retornou status=%', v_result->>'status';
      END IF;
      IF coalesce((v_result->>'contas_geradas')::int, 0) + coalesce((v_result->>'contas_reparadas')::int, 0) <= 0 THEN
        RAISE EXCEPTION 'RG-03/FIN-REC-01: generate não gerou contas. retorno=%', v_result::text;
      END IF;

      -- Evita vazar SET LOCAL ROLE para os próximos asserts dentro do mesmo bloco.
      EXECUTE 'RESET ROLE';
    EXCEPTION
      WHEN undefined_table THEN
        -- ambientes antigos sem módulo financeiro completo: ignora
        EXECUTE 'RESET ROLE';
        NULL;
    END fin_rec01;
  END IF;

  -- 10) SEC-MT-04: isolamento multi-tenant (A não pode ver B)
  IF to_regclass('public.empresas') IS NOT NULL
     AND to_regclass('public.empresa_usuarios') IS NOT NULL
     AND to_regclass('public.user_active_empresa') IS NOT NULL
     AND to_regclass('public.app_logs') IS NOT NULL
  THEN
    <<sec_mt04>>
    DECLARE
      v_user_a uuid := gen_random_uuid();
      v_user_b uuid := gen_random_uuid();
      v_emp_a uuid := gen_random_uuid();
      v_emp_b uuid := gen_random_uuid();
      v_count int;
    BEGIN
      -- Setup (como postgres) - cria 2 empresas e 2 usuários, cada um em sua empresa
      INSERT INTO auth.users(id, aud, role, email, created_at, updated_at)
      VALUES
        (v_user_a, 'authenticated', 'authenticated', 'secmt04+' || replace(v_user_a::text, '-', '') || '@example.com', now(), now()),
        (v_user_b, 'authenticated', 'authenticated', 'secmt04+' || replace(v_user_b::text, '-', '') || '@example.com', now(), now())
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.empresas(id, nome_razao_social, razao_social, fantasia, nome)
      VALUES
        (v_emp_a, 'SEC MT04 A LTDA', 'SEC MT04 A LTDA', 'A', 'A'),
        (v_emp_b, 'SEC MT04 B LTDA', 'SEC MT04 B LTDA', 'B', 'B')
      ON CONFLICT DO NOTHING;

      -- Vincula usuários à empresa (se o schema tiver colunas extras, ajusta via defaults)
      INSERT INTO public.empresa_usuarios(empresa_id, user_id, role, created_at)
      VALUES
        (v_emp_a, v_user_a, 'member', now()),
        (v_emp_b, v_user_b, 'member', now())
      ON CONFLICT DO NOTHING;

      INSERT INTO public.user_active_empresa(user_id, empresa_id, updated_at)
      VALUES
        (v_user_a, v_emp_a, now()),
        (v_user_b, v_emp_b, now())
      ON CONFLICT (user_id) DO UPDATE SET empresa_id = excluded.empresa_id, updated_at = excluded.updated_at;

      -- Dados de teste
      INSERT INTO public.app_logs(empresa_id, level, source, event, message, context, actor_id, created_at)
      VALUES
        (v_emp_a, 'info', 'test', 'sec_mt04', 'A', '{}'::jsonb, v_user_a, now()),
        (v_emp_b, 'info', 'test', 'sec_mt04', 'B', '{}'::jsonb, v_user_b, now());

      -- A só vê A
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
      SELECT count(*)::int INTO v_count FROM public.app_logs WHERE event='sec_mt04';
      IF v_count <> 1 THEN
        RAISE EXCEPTION 'SEC-MT-04: usuário A consegue ver % linhas (esperado 1).', v_count;
      END IF;
      SELECT count(*)::int INTO v_count FROM public.app_logs WHERE event='sec_mt04' AND message='B';
      IF v_count <> 0 THEN
        RAISE EXCEPTION 'SEC-MT-04: usuário A conseguiu enxergar dados da empresa B.';
      END IF;

      -- B só vê B
      PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
      SELECT count(*)::int INTO v_count FROM public.app_logs WHERE event='sec_mt04';
      IF v_count <> 1 THEN
        RAISE EXCEPTION 'SEC-MT-04: usuário B consegue ver % linhas (esperado 1).', v_count;
      END IF;
      SELECT count(*)::int INTO v_count FROM public.app_logs WHERE event='sec_mt04' AND message='A';
      IF v_count <> 0 THEN
        RAISE EXCEPTION 'SEC-MT-04: usuário B conseguiu enxergar dados da empresa A.';
      END IF;
    END;
  END IF;
end $$;
