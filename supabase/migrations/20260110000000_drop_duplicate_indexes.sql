-- [CLEANUP] Drop de índices duplicados e sem uso (0 scans)
-- IMPORTANTE: este script **não pode** rodar dentro de transação.
-- Use psql/Supabase SQL Editor sem BEGIN/COMMIT implícitos.
-- Segurança: somente DDL de DROP INDEX CONCURRENTLY IF EXISTS (idempotente).
-- Compatibilidade: mantém sempre um índice equivalente (keep_index).
-- Reversão: recriação opcional dos índices (normalmente desnecessária).
-- Performance: quedas breves de lock por DROP INDEX CONCURRENTLY; seguro online.

SET search_path = pg_catalog, public;

-- Centros de custo
DROP INDEX CONCURRENTLY IF EXISTS public.idx_centros_de_custo_empresa_id_537d54;

-- compras_itens
DROP INDEX CONCURRENTLY IF EXISTS public.idx_compras_itens_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_compras_itens_pedido;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_compras_itens_pedido_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_compras_itens_produto;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_compras_itens_produto_id;

-- compras_pedidos
DROP INDEX CONCURRENTLY IF EXISTS public.idx_compras_pedidos_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_compras_pedidos_fornecedor;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_compras_pedidos_fornecedor_id;

-- contas_a_receber
DROP INDEX CONCURRENTLY IF EXISTS public.idx_contas_a_receber_cliente_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_contas_a_receber_cliente_id_b50fb4;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_contas_a_receber_empresa_id_6f013a;

-- crm_etapas
DROP INDEX CONCURRENTLY IF EXISTS public.idx_crm_etapas_empresa_id;

-- crm_funis
DROP INDEX CONCURRENTLY IF EXISTS public.idx_crm_funis_empresa_id;

-- crm_oportunidades
DROP INDEX CONCURRENTLY IF EXISTS public.idx_crm_oportunidades_cliente_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_crm_oportunidades_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_crm_oportunidades_etapa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_crm_oportunidades_etapa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_crm_oportunidades_funil_id;

-- empresa_addons
DROP INDEX CONCURRENTLY IF EXISTS public.idx_empresa_addons_addon_slug_billing_cycle;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_empresa_addons_addon_slug_billing_cycle_bef8a0;
DROP INDEX CONCURRENTLY IF EXISTS public.empresa_addons_empresa_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.empresa_addons_empresa_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_empresa_addons_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_empresa_addons_empresa_id_f22e99;

-- empresa_usuarios
DROP INDEX CONCURRENTLY IF EXISTS public.idx_empresa_usuarios_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_empresa_usuarios_empresa_id;

-- estoque_movimentos / saldos
DROP INDEX CONCURRENTLY IF EXISTS public.idx_estoque_movimentos_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_estoque_saldos_empresa_id;

-- financeiro_centros_custos
DROP INDEX CONCURRENTLY IF EXISTS public.idx_fin_ccustos_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_financeiro_centros_custos_empresa_id;

-- financeiro_cobrancas_bancarias
DROP INDEX CONCURRENTLY IF EXISTS public.idx_fin_cobr_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_financeiro_cobrancas_bancarias_empresa_id;

-- financeiro_cobrancas_bancarias_eventos
DROP INDEX CONCURRENTLY IF EXISTS public.idx_fin_cobr_evt_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_financeiro_cobrancas_bancarias_eventos_empresa_id;

-- financeiro_contas_correntes
DROP INDEX CONCURRENTLY IF EXISTS public.idx_fin_cc_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_financeiro_contas_correntes_empresa_id;

-- financeiro_contas_pagar
DROP INDEX CONCURRENTLY IF EXISTS public.idx_fin_cp_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_financeiro_contas_pagar_empresa_id;

-- financeiro_extratos_bancarios
DROP INDEX CONCURRENTLY IF EXISTS public.idx_fin_extrato_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_financeiro_extratos_bancarios_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_financeiro_extratos_bancarios_movimentacao_id;

-- financeiro_movimentacoes
DROP INDEX CONCURRENTLY IF EXISTS public.idx_fin_mov_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_financeiro_movimentacoes_empresa_id;

-- industria_benef_*
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_benef_componentes_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_benef_componentes_ordem_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_benef_componentes_produto_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_benef_entregas_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_benef_entregas_ordem_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_ind_benef_ordens_cliente;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_benef_ordens_cliente_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_benef_ordens_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_benef_ordens_matcli;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_benef_ordens_produto_material_cliente_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_benef_ordens_produto_servico_id;

-- industria_boms (+ componentes)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_ind_boms_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_boms_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_boms_componentes_empresa_id;

-- industria_centros_trabalho
DROP INDEX CONCURRENTLY IF EXISTS public.idx_ind_ct_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_centros_trabalho_empresa_id;

-- industria_materiais_cliente
DROP INDEX CONCURRENTLY IF EXISTS public.idx_ind_matcli_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_materiais_cliente_empresa_id;

-- industria_operacoes (+ apontamentos)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_ind_op_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_operacoes_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_operacoes_roteiro_etapa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_operacoes_roteiro_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_operacoes_apontamentos_empresa_id;

-- industria_ordem_componentes
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_ordem_componentes_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_comp_ordem;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_ordens_componentes_ordem_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_ordens_componentes_produto_id;

-- industria_ordem_entregas
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_ordens_entregas_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_entregas_ordem;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_ordens_entregas_ordem_id;

-- industria_ordens
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_ordens_cliente;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_ordens_cliente_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_ordens_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_ordens_produto;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_ordens_produto_final_id;

-- industria_producao_*
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_producao_componentes_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_producao_componentes_ordem_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_producao_componentes_produto_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_producao_entregas_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_producao_entregas_ordem_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_producao_ordens_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_producao_ordens_produto_final_id;

-- industria_roteiros (+ etapas)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_ind_rot_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_roteiros_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_roteiros_etapas_centro_trabalho_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_industria_roteiros_etapas_empresa_id;

-- logistica_transportadoras
DROP INDEX CONCURRENTLY IF EXISTS public.idx_log_transp_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_logistica_transportadoras_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_logistica_transportadoras_pessoa_id;

-- metas_vendas
DROP INDEX CONCURRENTLY IF EXISTS public.idx_metas_vendas_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_metas_vendas_empresa_id_5976fe;
DROP INDEX CONCURRENTLY IF EXISTS public.ix_metas_vendas_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.metas_vendas_empresa_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_metas_vendas_responsavel_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_metas_vendas_responsavel_id_5e109e;

-- ordem_servico_itens
DROP INDEX CONCURRENTLY IF EXISTS public.idx_ordem_servico_itens_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_ordem_servico_itens_empresa_id_a742ca;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_os_itens_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_ordem_servico_itens_ordem_servico_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_ordem_servico_itens_ordem_servico_id_b6ead9;

-- ordem_servico_parcelas
DROP INDEX CONCURRENTLY IF EXISTS public.idx_ordem_servico_parcelas_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_ordem_servico_parcelas_empresa_id_7195f4;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_os_parcela_empresa;

-- ordem_servicos
DROP INDEX CONCURRENTLY IF EXISTS public.idx_ordem_servicos_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_ordem_servicos_empresa_id_30a95d;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_os_empresa;

-- pessoa_contatos / enderecos / pessoas
DROP INDEX CONCURRENTLY IF EXISTS public.idx_pessoa_contatos_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_pessoa_contatos_empresa_id_7dd3bc;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_pessoa_enderecos_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_pessoa_enderecos_empresa_id_060145;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_pessoas_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_pessoas_empresa_id_34796f;

-- products_legacy_archive
DROP INDEX CONCURRENTLY IF EXISTS public.products_legacy_archive_empresa_id_idx;

-- produto_anuncios
DROP INDEX CONCURRENTLY IF EXISTS public.idx_produto_anuncios_ecommerce_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_produto_anuncios_ecommerce_id_aeab34;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_produto_anuncios_produto;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_produto_anuncios_produto_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_produto_anuncios_produto_id_4bb3cc;

-- produto_atributos
DROP INDEX CONCURRENTLY IF EXISTS public.idx_produto_atributos_atributo_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_produto_atributos_atributo_id_f8b9c2;

-- produto_componentes
DROP INDEX CONCURRENTLY IF EXISTS public.idx_produto_componentes_kit_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_produto_componentes_kit_id_30158b;

-- produto_fornecedores
DROP INDEX CONCURRENTLY IF EXISTS public.idx_produto_fornecedores_produto_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_produto_fornecedores_produto_id_b4f98f;

-- produto_imagens
DROP INDEX CONCURRENTLY IF EXISTS public.idx_produto_imagens_produto;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_produto_imagens_produto_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_produto_imagens_produto_id_806f4c;

-- produto_tags
DROP INDEX CONCURRENTLY IF EXISTS public.idx_produto_tags_produto_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_produto_tags_produto_id_cf7bfc;

-- produtos
DROP INDEX CONCURRENTLY IF EXISTS public.idx_produtos_produto_pai_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_produtos_produto_pai_id_bc31c1;

-- profiles
DROP INDEX CONCURRENTLY IF EXISTS public.idx_profiles_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_profiles_id_27b383;

-- rh_*
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_cargo_competencias_competencia_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_cargo_comp_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_cargo_competencias_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_cargos_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_colaborador_competencias_competencia_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_colaborador_competencias_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_colaboradores_cargo_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_colaboradores_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_colaboradores_user_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_competencias_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_part_colaborador;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_part_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_treinamento_participantes_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_rh_treinamentos_empresa_id;

-- role_permissions
DROP INDEX CONCURRENTLY IF EXISTS public.idx_role_permissions__role;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_role_permissions_role_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_role_permissions_role_id_7d3d16;

-- servicos
DROP INDEX CONCURRENTLY IF EXISTS public.idx_servicos_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_servicos_empresa_id_ca3d50;

-- subscriptions
DROP INDEX CONCURRENTLY IF EXISTS public.idx_subscriptions_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_subscriptions_empresa_id_2cc835;

-- transportadoras
DROP INDEX CONCURRENTLY IF EXISTS public.idx_transportadoras_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_transportadoras_empresa_id_38f6bc;

-- user_active_empresa
DROP INDEX CONCURRENTLY IF EXISTS public.idx_user_active_empresa_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_user_active_empresa_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_user_active_empresa_empresa_id_628468;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_user_active_empresa_user_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_user_active_empresa_user_id_5235e7;

-- user_permission_overrides
DROP INDEX CONCURRENTLY IF EXISTS public.idx_user_permission_overrides_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_user_permission_overrides_empresa_id_19d5a9;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_user_permission_overrides_permission_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_user_permission_overrides_permission_id_22011f;

-- vendas_*
DROP INDEX CONCURRENTLY IF EXISTS public.idx_vendas_itens_pedido_empresa_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_vendas_pedidos_empresa;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_vendas_pedidos_empresa_id;
