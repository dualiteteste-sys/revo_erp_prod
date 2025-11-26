-- Migration: Final Remediation List (High Priority)
-- Description: Fixes search_path for specific functions, locks down global tables, and adds specific indexes.
-- Author: Antigravity
-- Date: 2025-11-26

-- 1. Fix Search Path for Specific Functions
DO $$
DECLARE
    func_name text;
    r record;
    target_functions text[] := ARRAY[
        '_resolve_tenant_for_request',
        '_seed_partners_for_empresa',
        '_seed_products_for_empresa',
        '_seed_services_for_empresa',
        'add_os_item_for_current_user',
        'add_product_item_to_os_for_current_user',
        'add_service_item_to_os_for_current_user',
        'count_centros_de_custo',
        'count_contas_a_receber',
        'count_users_for_current_empresa',
        'create_empresa_and_link_owner',
        'create_os_clone_for_current_user',
        'create_os_for_current_user',
        'create_product_clone_for_current_user',
        'create_product_for_current_user',
        'create_service_clone_for_current_user',
        'create_service_for_current_user',
        'create_update_carrier',
        'create_update_centro_de_custo',
        'create_update_conta_a_receber',
        'create_update_meta_venda',
        'current_empresa_id',
        'current_role_id',
        'current_user_id',
        'delete_centro_de_custo',
        'delete_conta_a_receber',
        'delete_meta_venda',
        'delete_os_for_current_user',
        'delete_os_item_for_current_user',
        'delete_partner',
        'delete_pending_invitation',
        'delete_product_for_current_user',
        'delete_product_image_db',
        'delete_service_for_current_user',
        'ensure_company_has_owner',
        'ensure_request_context',
        'get_centro_de_custo_details',
        'get_conta_a_receber_details',
        'get_contas_a_receber_summary',
        'get_os_by_id_for_current_user',
        'get_preferred_empresa_for_user',
        'get_service_by_id_for_current_user',
        'handle_new_user',
        'has_permission',
        'has_permission_for_current_user',
        'is_admin_of_empresa',
        'is_user_member_of',
        'list_centros_de_custo',
        'list_contas_a_receber',
        'list_kanban_os',
        'list_members_of_company',
        'list_metas_vendas',
        'list_os_for_current_user',
        'list_os_items_for_current_user',
        'list_os_parcels_for_current_user',
        'list_partners',
        'list_services_for_current_user',
        'list_users_for_current_empresa',
        'list_users_for_current_empresa_v2',
        'next_os_number_for_current_empresa',
        'os_generate_parcels_for_current_user',
        'os_next_numero',
        'os_recalc_totals',
        'os_set_status_for_current_user',
        'pgrst_pre_request',
        'produtos_count_for_current_user',
        'produtos_list_for_current_user',
        'provision_empresa_for_current_user',
        'purge_legacy_products',
        'search_clients_for_current_user',
        'search_items_for_os',
        'search_users_for_goal',
        'seed_os_for_current_user',
        'seed_partners_for_current_user',
        'seed_partners_for_empresa',
        'seed_products_for_current_user',
        'seed_products_for_empresa',
        'seed_services_for_current_user',
        'seed_services_for_empresa',
        'set_active_empresa_for_current_user',
        'set_principal_product_image',
        'set_updated_at',
        'start_trial_for_current_user',
        'tg_set_updated_at',
        'update_active_company',
        'update_os_data_prevista',
        'update_os_for_current_user',
        'update_os_item_for_current_user',
        'update_os_order',
        'update_product_for_current_user',
        'update_service_for_current_user',
        'upsert_subscription',
        'admin_set_active_empresa_for_user',
        'bootstrap_empresa_for_current_user',
        'delete_carrier',
        'get_partner_details',
        'create_update_partner',
        'system_bootstrap_empresa_for_user',
        'secure_bootstrap_empresa_for_current_user',
        'rh_list_cargos',
        'rh_get_cargo_details',
        'rh_upsert_cargo',
        'rh_list_competencias',
        'rh_upsert_competencia',
        'rh_list_colaboradores',
        'rh_get_colaborador_details',
        'rh_upsert_colaborador',
        'rh_get_competency_matrix',
        'rh_list_treinamentos',
        'rh_get_treinamento_details',
        'rh_upsert_treinamento',
        'rh_manage_participante',
        'get_rh_dashboard_stats',
        'seed_rh_module',
        'suprimentos_registrar_movimento',
        'suprimentos_list_posicao_estoque',
        'suprimentos_get_kardex',
        'compras_list_pedidos',
        'compras_get_pedido_details',
        'compras_upsert_pedido',
        'compras_manage_item',
        'compras_recalc_total',
        'compras_receber_pedido',
        'search_suppliers_for_current_user',
        'industria_producao_list_ordens',
        'industria_producao_get_ordem_details',
        'industria_producao_upsert_ordem',
        'industria_producao_manage_componente',
        'industria_producao_manage_entrega',
        'industria_producao_update_status',
        'industria_benef_get_ordem_details',
        'industria_benef_upsert_ordem',
        'industria_benef_manage_componente',
        'industria_benef_manage_entrega',
        'industria_benef_update_status',
        'industria_get_dashboard_stats',
        'industria_bom_list',
        'industria_bom_get_details',
        'industria_bom_upsert',
        'industria_bom_manage_componente',
        'industria_aplicar_bom_em_ordem_producao',
        'industria_aplicar_bom_em_ordem_beneficiamento',
        'industria_centros_trabalho_list',
        'industria_centros_trabalho_upsert',
        'industria_roteiros_list',
        'industria_roteiros_get_details',
        'industria_roteiros_upsert',
        'industria_roteiros_manage_etapa',
        'industria_operacoes_list',
        'industria_operacao_update_status',
        'industria_operacoes_minha_fila',
        'industria_operacao_apontar_execucao',
        'logistica_transportadoras_list',
        'logistica_transportadoras_get',
        'logistica_transportadoras_upsert',
        'logistica_transportadoras_delete',
        'financeiro_contas_pagar_count',
        'financeiro_contas_pagar_list',
        'financeiro_contas_pagar_get',
        'financeiro_contas_pagar_upsert',
        'financeiro_contas_pagar_delete',
        'financeiro_contas_pagar_summary',
        'financeiro_contas_correntes_list',
        'financeiro_contas_correntes_get',
        'financeiro_contas_correntes_upsert',
        'financeiro_contas_correntes_delete',
        'financeiro_movimentacoes_list',
        'financeiro_movimentacoes_get',
        'financeiro_movimentacoes_upsert',
        'financeiro_movimentacoes_delete',
        'financeiro_extratos_bancarios_list',
        'financeiro_extratos_bancarios_importar',
        'financeiro_extratos_bancarios_vincular_movimentacao',
        'financeiro_extratos_bancarios_desvincular',
        'financeiro_centros_custos_list',
        'financeiro_centros_custos_get',
        'financeiro_centros_custos_upsert',
        'financeiro_centros_custos_delete',
        'financeiro_cobrancas_bancarias_list',
        'financeiro_cobrancas_bancarias_get',
        'financeiro_cobrancas_bancarias_upsert',
        'financeiro_cobrancas_bancarias_delete',
        'financeiro_cobrancas_bancarias_summary',
        'financeiro_extrato_bancario_list',
        'financeiro_extrato_bancario_summary',
        'vendas_recalcular_totais',
        'vendas_list_pedidos',
        'vendas_get_pedido_details',
        'vendas_upsert_pedido',
        'vendas_manage_item',
        'vendas_aprovar_pedido',
        'fiscal_nfe_import_register',
        'suprimentos_relatorio_valorizacao',
        'suprimentos_relatorio_baixo_estoque',
        'crm_ensure_default_pipeline',
        'crm_get_kanban_data',
        'crm_move_oportunidade',
        'crm_upsert_oportunidade',
        'crm_delete_oportunidade',
        'industria_materiais_cliente_list',
        'industria_materiais_cliente_get',
        'industria_materiais_cliente_upsert',
        'industria_materiais_cliente_delete',
        'industria_benef_list_ordens',
        'ensure_leading_fk_indexes',
        'manage_role_permissions',
        'upload_product_image_meta',
        'leave_company'
    ];
BEGIN
    FOREACH func_name IN ARRAY target_functions
    LOOP
        FOR r IN
            SELECT p.proname, oidvectortypes(p.proargtypes) as args, p.prokind
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname = func_name
        LOOP
            IF r.prokind = 'p' THEN
                EXECUTE format('ALTER PROCEDURE public.%I(%s) SET search_path = pg_catalog, public;', r.proname, r.args);
            ELSIF r.prokind = 'f' OR r.prokind = 'w' THEN
                EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = pg_catalog, public;', r.proname, r.args);
            END IF;
            RAISE NOTICE 'Fixed search_path for %', r.proname;
        END LOOP;
    END LOOP;
END;
$$;

-- 2. Lock down Global Tables (Read-Only / Restricted)
DO $$
DECLARE
    tbl text;
    -- Read-Only Tables (No INSERT/UPDATE/DELETE via RLS)
    ro_tables text[] := ARRAY['addons', 'permissions', 'plans', 'role_permissions', 'roles'];
    -- Restricted Tables (No INSERT/DELETE, but UPDATE allowed)
    restricted_tables text[] := ARRAY['empresas', 'profiles'];
BEGIN
    -- Read-Only
    FOREACH tbl IN ARRAY ro_tables
    LOOP
        -- Drop existing policies to be clean
        EXECUTE format('DROP POLICY IF EXISTS "policy_deny_write" ON public.%I;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "policy_select_global" ON public.%I;', tbl);
        
        -- Enable RLS
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        
        -- Allow Select
        EXECUTE format('CREATE POLICY "policy_select_global" ON public.%I FOR SELECT USING (true);', tbl);
        
        -- Deny Write (Insert/Update/Delete)
        EXECUTE format('CREATE POLICY "policy_deny_write" ON public.%I FOR ALL USING (false) WITH CHECK (false);', tbl);
        
        RAISE NOTICE 'Locked down global table (Read-Only): %', tbl;
    END LOOP;

    -- Restricted (No Insert/Delete)
    -- MOVED TO 20251126170001_final_remediation_hot_tables.sql TO AVOID DEADLOCKS
    -- FOREACH tbl IN ARRAY restricted_tables ...
END;
$$;

-- 3. Create Specific Indexes
DO $$
DECLARE
    tbl text;
    target_tables text[] := ARRAY['atributos', 'ecommerces', 'fornecedores', 'linhas_produto', 'marcas', 'produto_atributos', 'tabelas_medidas', 'tags'];
BEGIN
    FOREACH tbl IN ARRAY target_tables
    LOOP
        -- Index on empresa_id
        EXECUTE format('CREATE INDEX IF NOT EXISTS "idx_%s_empresa" ON public.%I (empresa_id);', tbl, tbl);
        
        -- Index on (empresa_id, created_at)
        EXECUTE format('CREATE INDEX IF NOT EXISTS "idx_%s_empresa_created" ON public.%I (empresa_id, created_at);', tbl, tbl);
        
        RAISE NOTICE 'Created indexes for %', tbl;
    END LOOP;
END;
$$;

-- 4. Enforce Tenant Predicates (100% Coverage)
-- Re-run standardizer to ensure no gaps remain after all changes
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT t.tablename
        FROM pg_tables t
        JOIN information_schema.columns c ON c.table_name = t.tablename AND c.table_schema = 'public'
        WHERE t.schemaname = 'public'
          AND c.column_name = 'empresa_id'
          AND t.tablename NOT IN ('empresas', 'profiles', 'addons', 'permissions', 'plans', 'role_permissions', 'roles') -- Exclude globals
    LOOP
        -- If policies are missing, create them
        IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = (quote_ident(r.tablename))::regclass AND polname = 'policy_select') THEN
             EXECUTE format('CREATE POLICY "policy_select" ON public.%I FOR SELECT USING (empresa_id = public.current_empresa_id());', r.tablename);
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = (quote_ident(r.tablename))::regclass AND polname = 'policy_insert') THEN
             EXECUTE format('CREATE POLICY "policy_insert" ON public.%I FOR INSERT WITH CHECK (empresa_id = public.current_empresa_id());', r.tablename);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = (quote_ident(r.tablename))::regclass AND polname = 'policy_update') THEN
             EXECUTE format('CREATE POLICY "policy_update" ON public.%I FOR UPDATE USING (empresa_id = public.current_empresa_id()) WITH CHECK (empresa_id = public.current_empresa_id());', r.tablename);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = (quote_ident(r.tablename))::regclass AND polname = 'policy_delete') THEN
             EXECUTE format('CREATE POLICY "policy_delete" ON public.%I FOR DELETE USING (empresa_id = public.current_empresa_id());', r.tablename);
        END IF;
    END LOOP;
END;
$$;
