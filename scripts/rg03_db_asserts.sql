-- RG-03: asserts de banco para evitar regressões que viram erros no console
-- (ex.: RPC ambígua, grants faltando em JOIN/embeds, colunas inexistentes)

\set ON_ERROR_STOP on

do $$
begin
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

  if not has_table_privilege('authenticated', 'public.vendedores', 'select') then
    raise exception 'RG-03: role authenticated sem SELECT em public.vendedores (MVP menu).';
  end if;
  if not has_table_privilege('authenticated', 'public.servicos_contratos', 'select') then
    raise exception 'RG-03: role authenticated sem SELECT em public.servicos_contratos (MVP menu).';
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

  -- 9) SEC-02: RPCs SECURITY DEFINER usadas pelo app devem exigir permissão (anti-burla via console)
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef IS TRUE
      AND p.proname = ANY(ARRAY[
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
end $$;
