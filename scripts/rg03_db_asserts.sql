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
end $$;
