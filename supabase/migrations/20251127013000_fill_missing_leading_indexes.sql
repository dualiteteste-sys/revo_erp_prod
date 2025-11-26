-- 20251127013000_fill_missing_leading_indexes.sql
-- Idempotente e segura para rodar em produção.
-- Objetivo: garantir índices líderes para (empresa_id) e primeiras colunas de FKs críticas.
-- Notas:
-- - Usa IF NOT EXISTS para evitar erro se já existir.
-- - Sem CONCURRENTLY (compatível com Supabase migrações padrão); se desejar, rode fora de transação com CONCURRENTLY.
-- - search_path fixo para previsibilidade.
SET search_path = pg_catalog, public;

-- ===========================
-- BLOCO A: Índices líder por empresa_id (empresa_leading)
-- ===========================

CREATE INDEX IF NOT EXISTS _bak_empresa_usuarios_empresa_id_idx ON public._bak_empresa_usuarios(empresa_id);
CREATE INDEX IF NOT EXISTS atributos_empresa_id_idx ON public.atributos(empresa_id);
CREATE INDEX IF NOT EXISTS centros_de_custo_empresa_id_idx ON public.centros_de_custo(empresa_id);
CREATE INDEX IF NOT EXISTS compras_itens_empresa_id_idx ON public.compras_itens(empresa_id);
CREATE INDEX IF NOT EXISTS compras_pedidos_empresa_id_idx ON public.compras_pedidos(empresa_id);
CREATE INDEX IF NOT EXISTS contas_a_receber_empresa_id_idx ON public.contas_a_receber(empresa_id);
CREATE INDEX IF NOT EXISTS crm_etapas_empresa_id_idx ON public.crm_etapas(empresa_id);
CREATE INDEX IF NOT EXISTS crm_funis_empresa_id_idx ON public.crm_funis(empresa_id);
CREATE INDEX IF NOT EXISTS crm_oportunidades_empresa_id_idx ON public.crm_oportunidades(empresa_id);
CREATE INDEX IF NOT EXISTS ecommerces_empresa_id_idx ON public.ecommerces(empresa_id);
CREATE INDEX IF NOT EXISTS empresa_addons_empresa_id_idx ON public.empresa_addons(empresa_id);
CREATE INDEX IF NOT EXISTS empresa_usuarios_empresa_id_idx ON public.empresa_usuarios(empresa_id);
CREATE INDEX IF NOT EXISTS estoque_movimentos_empresa_id_idx ON public.estoque_movimentos(empresa_id);
CREATE INDEX IF NOT EXISTS estoque_saldos_empresa_id_idx ON public.estoque_saldos(empresa_id);
CREATE INDEX IF NOT EXISTS financeiro_centros_custos_empresa_id_idx ON public.financeiro_centros_custos(empresa_id);
CREATE INDEX IF NOT EXISTS financeiro_cobrancas_bancarias_empresa_id_idx ON public.financeiro_cobrancas_bancarias(empresa_id);
CREATE INDEX IF NOT EXISTS financeiro_cobrancas_bancarias_eventos_empresa_id_idx ON public.financeiro_cobrancas_bancarias_eventos(empresa_id);
CREATE INDEX IF NOT EXISTS financeiro_contas_correntes_empresa_id_idx ON public.financeiro_contas_correntes(empresa_id);
CREATE INDEX IF NOT EXISTS financeiro_contas_pagar_empresa_id_idx ON public.financeiro_contas_pagar(empresa_id);
CREATE INDEX IF NOT EXISTS financeiro_extratos_bancarios_empresa_id_idx ON public.financeiro_extratos_bancarios(empresa_id);
CREATE INDEX IF NOT EXISTS financeiro_movimentacoes_empresa_id_idx ON public.financeiro_movimentacoes(empresa_id);
CREATE INDEX IF NOT EXISTS fornecedores_empresa_id_idx ON public.fornecedores(empresa_id);
CREATE INDEX IF NOT EXISTS industria_benef_componentes_empresa_id_idx ON public.industria_benef_componentes(empresa_id);
CREATE INDEX IF NOT EXISTS industria_benef_entregas_empresa_id_idx ON public.industria_benef_entregas(empresa_id);
CREATE INDEX IF NOT EXISTS industria_benef_ordens_empresa_id_idx ON public.industria_benef_ordens(empresa_id);
CREATE INDEX IF NOT EXISTS industria_boms_empresa_id_idx ON public.industria_boms(empresa_id);
CREATE INDEX IF NOT EXISTS industria_boms_componentes_empresa_id_idx ON public.industria_boms_componentes(empresa_id);
CREATE INDEX IF NOT EXISTS industria_centros_trabalho_empresa_id_idx ON public.industria_centros_trabalho(empresa_id);
CREATE INDEX IF NOT EXISTS industria_materiais_cliente_empresa_id_idx ON public.industria_materiais_cliente(empresa_id);
CREATE INDEX IF NOT EXISTS industria_operacoes_empresa_id_idx ON public.industria_operacoes(empresa_id);
CREATE INDEX IF NOT EXISTS industria_operacoes_apontamentos_empresa_id_idx ON public.industria_operacoes_apontamentos(empresa_id);
CREATE INDEX IF NOT EXISTS industria_ordem_componentes_empresa_id_idx ON public.industria_ordem_componentes(empresa_id);
CREATE INDEX IF NOT EXISTS industria_ordem_entregas_empresa_id_idx ON public.industria_ordem_entregas(empresa_id);
CREATE INDEX IF NOT EXISTS industria_ordens_empresa_id_idx ON public.industria_ordens(empresa_id);
CREATE INDEX IF NOT EXISTS industria_ordens_componentes_empresa_id_idx ON public.industria_ordens_componentes(empresa_id);
CREATE INDEX IF NOT EXISTS industria_ordens_entregas_empresa_id_idx ON public.industria_ordens_entregas(empresa_id);
CREATE INDEX IF NOT EXISTS industria_producao_componentes_empresa_id_idx ON public.industria_producao_componentes(empresa_id);
CREATE INDEX IF NOT EXISTS industria_producao_entregas_empresa_id_idx ON public.industria_producao_entregas(empresa_id);
CREATE INDEX IF NOT EXISTS industria_producao_ordens_empresa_id_idx ON public.industria_producao_ordens(empresa_id);
CREATE INDEX IF NOT EXISTS industria_roteiros_empresa_id_idx ON public.industria_roteiros(empresa_id);
CREATE INDEX IF NOT EXISTS industria_roteiros_etapas_empresa_id_idx ON public.industria_roteiros_etapas(empresa_id);
CREATE INDEX IF NOT EXISTS linhas_produto_empresa_id_idx ON public.linhas_produto(empresa_id);
CREATE INDEX IF NOT EXISTS logistica_transportadoras_empresa_id_idx ON public.logistica_transportadoras(empresa_id);
CREATE INDEX IF NOT EXISTS marcas_empresa_id_idx ON public.marcas(empresa_id);
CREATE INDEX IF NOT EXISTS metas_vendas_empresa_id_idx ON public.metas_vendas(empresa_id);
CREATE INDEX IF NOT EXISTS ordem_servico_itens_empresa_id_idx ON public.ordem_servico_itens(empresa_id);
CREATE INDEX IF NOT EXISTS ordem_servico_parcelas_empresa_id_idx ON public.ordem_servico_parcelas(empresa_id);
CREATE INDEX IF NOT EXISTS ordem_servicos_empresa_id_idx ON public.ordem_servicos(empresa_id);
CREATE INDEX IF NOT EXISTS pessoa_contatos_empresa_id_idx ON public.pessoa_contatos(empresa_id);
CREATE INDEX IF NOT EXISTS pessoa_enderecos_empresa_id_idx ON public.pessoa_enderecos(empresa_id);
CREATE INDEX IF NOT EXISTS pessoas_empresa_id_idx ON public.pessoas(empresa_id);
CREATE INDEX IF NOT EXISTS products_legacy_archive_empresa_id_idx ON public.products_legacy_archive(empresa_id);
CREATE INDEX IF NOT EXISTS produto_anuncios_empresa_id_idx ON public.produto_anuncios(empresa_id);
CREATE INDEX IF NOT EXISTS produto_atributos_empresa_id_idx ON public.produto_atributos(empresa_id);
CREATE INDEX IF NOT EXISTS produto_componentes_empresa_id_idx ON public.produto_componentes(empresa_id);
CREATE INDEX IF NOT EXISTS produto_fornecedores_empresa_id_idx ON public.produto_fornecedores(empresa_id);
CREATE INDEX IF NOT EXISTS produto_imagens_empresa_id_idx ON public.produto_imagens(empresa_id);
CREATE INDEX IF NOT EXISTS produto_tags_empresa_id_idx ON public.produto_tags(empresa_id);
CREATE INDEX IF NOT EXISTS produtos_empresa_id_idx ON public.produtos(empresa_id);
CREATE INDEX IF NOT EXISTS rh_cargo_competencias_empresa_id_idx ON public.rh_cargo_competencias(empresa_id);
CREATE INDEX IF NOT EXISTS rh_cargos_empresa_id_idx ON public.rh_cargos(empresa_id);
CREATE INDEX IF NOT EXISTS rh_colaborador_competencias_empresa_id_idx ON public.rh_colaborador_competencias(empresa_id);
CREATE INDEX IF NOT EXISTS rh_colaboradores_empresa_id_idx ON public.rh_colaboradores(empresa_id);
CREATE INDEX IF NOT EXISTS rh_competencias_empresa_id_idx ON public.rh_competencias(empresa_id);
CREATE INDEX IF NOT EXISTS rh_treinamento_participantes_empresa_id_idx ON public.rh_treinamento_participantes(empresa_id);
CREATE INDEX IF NOT EXISTS rh_treinamentos_empresa_id_idx ON public.rh_treinamentos(empresa_id);
CREATE INDEX IF NOT EXISTS servicos_empresa_id_idx ON public.servicos(empresa_id);
CREATE INDEX IF NOT EXISTS subscriptions_empresa_id_idx ON public.subscriptions(empresa_id);
CREATE INDEX IF NOT EXISTS tabelas_medidas_empresa_id_idx ON public.tabelas_medidas(empresa_id);
CREATE INDEX IF NOT EXISTS tags_empresa_id_idx ON public.tags(empresa_id);
CREATE INDEX IF NOT EXISTS transportadoras_empresa_id_idx ON public.transportadoras(empresa_id);
CREATE INDEX IF NOT EXISTS user_active_empresa_empresa_id_idx ON public.user_active_empresa(empresa_id);
CREATE INDEX IF NOT EXISTS user_permission_overrides_empresa_id_idx ON public.user_permission_overrides(empresa_id);
CREATE INDEX IF NOT EXISTS vendas_itens_pedido_empresa_id_idx ON public.vendas_itens_pedido(empresa_id);
CREATE INDEX IF NOT EXISTS vendas_pedidos_empresa_id_idx ON public.vendas_pedidos(empresa_id);

-- ===========================
-- BLOCO B: Índices líder da 1ª coluna de FKs (fk_leading)
-- ===========================

CREATE INDEX IF NOT EXISTS compras_itens_pedido_id_idx ON public.compras_itens(pedido_id);
CREATE INDEX IF NOT EXISTS compras_itens_produto_id_idx ON public.compras_itens(produto_id);
CREATE INDEX IF NOT EXISTS compras_pedidos_fornecedor_id_idx ON public.compras_pedidos(fornecedor_id);
CREATE INDEX IF NOT EXISTS contas_a_receber_cliente_id_idx ON public.contas_a_receber(cliente_id);
CREATE INDEX IF NOT EXISTS crm_oportunidades_cliente_id_idx ON public.crm_oportunidades(cliente_id);
CREATE INDEX IF NOT EXISTS crm_oportunidades_etapa_id_idx ON public.crm_oportunidades(etapa_id);
CREATE INDEX IF NOT EXISTS crm_oportunidades_funil_id_idx ON public.crm_oportunidades(funil_id);
CREATE INDEX IF NOT EXISTS financeiro_extratos_bancarios_movimentacao_id_idx ON public.financeiro_extratos_bancarios(movimentacao_id);
CREATE INDEX IF NOT EXISTS industria_benef_componentes_ordem_id_idx ON public.industria_benef_componentes(ordem_id);
CREATE INDEX IF NOT EXISTS industria_benef_componentes_produto_id_idx ON public.industria_benef_componentes(produto_id);
CREATE INDEX IF NOT EXISTS industria_benef_entregas_ordem_id_idx ON public.industria_benef_entregas(ordem_id);
CREATE INDEX IF NOT EXISTS industria_benef_ordens_cliente_id_idx ON public.industria_benef_ordens(cliente_id);
CREATE INDEX IF NOT EXISTS industria_benef_ordens_produto_material_cliente_id_idx ON public.industria_benef_ordens(produto_material_cliente_id);
CREATE INDEX IF NOT EXISTS industria_benef_ordens_produto_servico_id_idx ON public.industria_benef_ordens(produto_servico_id);
CREATE INDEX IF NOT EXISTS industria_operacoes_roteiro_etapa_id_idx ON public.industria_operacoes(roteiro_etapa_id);
CREATE INDEX IF NOT EXISTS industria_operacoes_roteiro_id_idx ON public.industria_operacoes(roteiro_id);
CREATE INDEX IF NOT EXISTS industria_ordens_cliente_id_idx ON public.industria_ordens(cliente_id);
CREATE INDEX IF NOT EXISTS industria_ordens_produto_final_id_idx ON public.industria_ordens(produto_final_id);
CREATE INDEX IF NOT EXISTS industria_ordens_componentes_ordem_id_idx ON public.industria_ordens_componentes(ordem_id);
CREATE INDEX IF NOT EXISTS industria_ordens_componentes_produto_id_idx ON public.industria_ordens_componentes(produto_id);
CREATE INDEX IF NOT EXISTS industria_ordens_entregas_ordem_id_idx ON public.industria_ordens_entregas(ordem_id);
CREATE INDEX IF NOT EXISTS industria_producao_componentes_ordem_id_idx ON public.industria_producao_componentes(ordem_id);
CREATE INDEX IF NOT EXISTS industria_producao_componentes_produto_id_idx ON public.industria_producao_componentes(produto_id);
CREATE INDEX IF NOT EXISTS industria_producao_entregas_ordem_id_idx ON public.industria_producao_entregas(ordem_id);
CREATE INDEX IF NOT EXISTS industria_producao_ordens_produto_final_id_idx ON public.industria_producao_ordens(produto_final_id);
CREATE INDEX IF NOT EXISTS industria_roteiros_etapas_centro_trabalho_id_idx ON public.industria_roteiros_etapas(centro_trabalho_id);
CREATE INDEX IF NOT EXISTS logistica_transportadoras_pessoa_id_idx ON public.logistica_transportadoras(pessoa_id);
CREATE INDEX IF NOT EXISTS metas_vendas_responsavel_id_idx ON public.metas_vendas(responsavel_id);
CREATE INDEX IF NOT EXISTS ordem_servico_itens_ordem_servico_id_idx ON public.ordem_servico_itens(ordem_servico_id);
CREATE INDEX IF NOT EXISTS produto_anuncios_ecommerce_id_idx ON public.produto_anuncios(ecommerce_id);
CREATE INDEX IF NOT EXISTS produto_anuncios_produto_id_idx ON public.produto_anuncios(produto_id);
CREATE INDEX IF NOT EXISTS produto_atributos_atributo_id_idx ON public.produto_atributos(atributo_id);
CREATE INDEX IF NOT EXISTS produto_componentes_kit_id_idx ON public.produto_componentes(kit_id);
CREATE INDEX IF NOT EXISTS produto_fornecedores_produto_id_idx ON public.produto_fornecedores(produto_id);
CREATE INDEX IF NOT EXISTS produto_imagens_produto_id_idx ON public.produto_imagens(produto_id);
CREATE INDEX IF NOT EXISTS produto_tags_produto_id_idx ON public.produto_tags(produto_id);
CREATE INDEX IF NOT EXISTS produtos_produto_pai_id_idx ON public.produtos(produto_pai_id);
CREATE INDEX IF NOT EXISTS profiles_id_idx ON public.profiles(id);
CREATE INDEX IF NOT EXISTS role_permissions_role_id_idx ON public.role_permissions(role_id);
CREATE INDEX IF NOT EXISTS user_active_empresa_user_id_idx ON public.user_active_empresa(user_id);
CREATE INDEX IF NOT EXISTS user_permission_overrides_permission_id_idx ON public.user_permission_overrides(permission_id);
