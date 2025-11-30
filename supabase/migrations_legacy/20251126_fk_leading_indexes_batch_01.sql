/*
  [IDX][FK] Leading indexes (batch 01) — DEV

  Impacto / Segurança
  - Cria apenas índices btree; não altera dados nem RLS.

  Compatibilidade
  - Idempotente (CREATE INDEX IF NOT EXISTS).

  Reversibilidade
  - DROP INDEX <nome> se necessário.

  Performance
  - Sem CONCURRENTLY; pode bloquear escrita por tabela durante criação.
  - lock_timeout curto para evitar travas longas.
*/

set local lock_timeout = '2s';
set local statement_timeout = '0';

create index if not exists idx_fk_centros_de_custo_empresa_id_70851a on public.centros_de_custo (empresa_id);
create index if not exists idx_fk_compras_itens_empresa_id_779e9a on public.compras_itens (empresa_id);
create index if not exists idx_fk_compras_itens_pedido_id_0ec0e9 on public.compras_itens (pedido_id);
create index if not exists idx_fk_compras_itens_produto_id_4a7e5e on public.compras_itens (produto_id);
create index if not exists idx_fk_compras_pedidos_empresa_id_ac1fea on public.compras_pedidos (empresa_id);
create index if not exists idx_fk_compras_pedidos_fornecedor_id_b8b227 on public.compras_pedidos (fornecedor_id);
create index if not exists idx_fk_contas_a_receber_cliente_id_0413f6 on public.contas_a_receber (cliente_id);
create index if not exists idx_fk_contas_a_receber_empresa_id_2f5169 on public.contas_a_receber (empresa_id);
create index if not exists idx_fk_crm_etapas_empresa_id_81c585 on public.crm_etapas (empresa_id);
create index if not exists idx_fk_crm_funis_empresa_id_da16e1 on public.crm_funis (empresa_id);
create index if not exists idx_fk_crm_oportunidades_cliente_id_579028 on public.crm_oportunidades (cliente_id);
create index if not exists idx_fk_crm_oportunidades_empresa_id_a3b2a9 on public.crm_oportunidades (empresa_id);
create index if not exists idx_fk_crm_oportunidades_etapa_id_2e185b on public.crm_oportunidades (etapa_id);
create index if not exists idx_fk_crm_oportunidades_funil_id_787e0f on public.crm_oportunidades (funil_id);
create index if not exists idx_fk_empresa_addons_empresa_id_8a454c on public.empresa_addons (empresa_id);
create index if not exists idx_fk_empresa_addons_addon_slug_billing_cycle_9fb4dc on public.empresa_addons (addon_slug, billing_cycle);
create index if not exists idx_fk_empresa_usuarios_empresa_id_89afbe on public.empresa_usuarios (empresa_id);
create index if not exists idx_fk_estoque_movimentos_empresa_id_b49f27 on public.estoque_movimentos (empresa_id);
create index if not exists idx_fk_estoque_saldos_empresa_id_f37397 on public.estoque_saldos (empresa_id);
create index if not exists idx_fk_financeiro_centros_c_empresa_id_4fa97d on public.financeiro_centros_custos (empresa_id);
create index if not exists idx_fk_financeiro_cobrancas_empresa_id_8c8790 on public.financeiro_cobrancas_bancarias (empresa_id);
create index if not exists idx_fk_financeiro_cobrancas_empresa_id_524427 on public.financeiro_cobrancas_bancarias_eventos (empresa_id);
create index if not exists idx_fk_financeiro_contas_co_empresa_id_69bc47 on public.financeiro_contas_correntes (empresa_id);
create index if not exists idx_fk_financeiro_contas_pa_empresa_id_7684b3 on public.financeiro_contas_pagar (empresa_id);
create index if not exists idx_fk_financeiro_extratos__empresa_id_9b6894 on public.financeiro_extratos_bancarios (empresa_id);
create index if not exists idx_fk_financeiro_extratos__movimentacao_id_d60628 on public.financeiro_extratos_bancarios (movimentacao_id);
create index if not exists idx_fk_financeiro_movimenta_empresa_id_10a4f2 on public.financeiro_movimentacoes (empresa_id);
create index if not exists idx_fk_industria_benef_comp_empresa_id_bd4efe on public.industria_benef_componentes (empresa_id);
create index if not exists idx_fk_industria_benef_comp_ordem_id_a84947 on public.industria_benef_componentes (ordem_id);
create index if not exists idx_fk_industria_benef_comp_produto_id_3083e6 on public.industria_benef_componentes (produto_id);
create index if not exists idx_fk_industria_benef_entr_empresa_id_2aa396 on public.industria_benef_entregas (empresa_id);
create index if not exists idx_fk_industria_benef_entr_ordem_id_265367 on public.industria_benef_entregas (ordem_id);
create index if not exists idx_fk_industria_benef_orde_cliente_id_cd8e32 on public.industria_benef_ordens (cliente_id);
create index if not exists idx_fk_industria_benef_orde_empresa_id_a569e0 on public.industria_benef_ordens (empresa_id);
create index if not exists idx_fk_industria_benef_orde_produto_material_cliente_686a14 on public.industria_benef_ordens (produto_material_cliente_id);
create index if not exists idx_fk_industria_benef_orde_produto_servico_id_ea41a2 on public.industria_benef_ordens (produto_servico_id);
create index if not exists idx_fk_industria_boms_empresa_id_8efd53 on public.industria_boms (empresa_id);
create index if not exists idx_fk_industria_boms_compo_empresa_id_f473b4 on public.industria_boms_componentes (empresa_id);
create index if not exists idx_fk_industria_centros_tr_empresa_id_53768d on public.industria_centros_trabalho (empresa_id);
create index if not exists idx_fk_industria_materiais__empresa_id_217671 on public.industria_materiais_cliente (empresa_id);
create index if not exists idx_fk_industria_operacoes_empresa_id_11eb07 on public.industria_operacoes (empresa_id);
create index if not exists idx_fk_industria_operacoes_roteiro_etapa_id_546dd3 on public.industria_operacoes (roteiro_etapa_id);
create index if not exists idx_fk_industria_operacoes_roteiro_id_0bdcab on public.industria_operacoes (roteiro_id);
create index if not exists idx_fk_industria_operacoes__empresa_id_499104 on public.industria_operacoes_apontamentos (empresa_id);
create index if not exists idx_fk_industria_ordem_comp_empresa_id_bfadcc on public.industria_ordem_componentes (empresa_id);
create index if not exists idx_fk_industria_ordem_entr_empresa_id_16f0ed on public.industria_ordem_entregas (empresa_id);
create index if not exists idx_fk_industria_ordens_cliente_id_3c86a3 on public.industria_ordens (cliente_id);
create index if not exists idx_fk_industria_ordens_empresa_id_2513f0 on public.industria_ordens (empresa_id);
create index if not exists idx_fk_industria_ordens_produto_final_id_227f2c on public.industria_ordens (produto_final_id);
create index if not exists idx_fk_industria_ordens_com_empresa_id_69540c on public.industria_ordens_componentes (empresa_id);
create index if not exists idx_fk_industria_ordens_com_ordem_id_667968 on public.industria_ordens_componentes (ordem_id);
create index if not exists idx_fk_industria_ordens_com_produto_id_013c77 on public.industria_ordens_componentes (produto_id);
create index if not exists idx_fk_industria_ordens_ent_empresa_id_0fc9b6 on public.industria_ordens_entregas (empresa_id);
create index if not exists idx_fk_industria_ordens_ent_ordem_id_dfb6ce on public.industria_ordens_entregas (ordem_id);
create index if not exists idx_fk_industria_producao_c_empresa_id_eabb5e on public.industria_producao_componentes (empresa_id);
create index if not exists idx_fk_industria_producao_c_ordem_id_27c4f9 on public.industria_producao_componentes (ordem_id);
create index if not exists idx_fk_industria_producao_c_produto_id_267bb1 on public.industria_producao_componentes (produto_id);
create index if not exists idx_fk_industria_producao_e_empresa_id_91e19c on public.industria_producao_entregas (empresa_id);
create index if not exists idx_fk_industria_producao_e_ordem_id_4f99fc on public.industria_producao_entregas (ordem_id);
create index if not exists idx_fk_industria_producao_o_empresa_id_56193d on public.industria_producao_ordens (empresa_id);
create index if not exists idx_fk_industria_producao_o_produto_final_id_5ed49f on public.industria_producao_ordens (produto_final_id);
create index if not exists idx_fk_industria_roteiros_empresa_id_ce1713 on public.industria_roteiros (empresa_id);
create index if not exists idx_fk_industria_roteiros_e_centro_trabalho_id_962e31 on public.industria_roteiros_etapas (centro_trabalho_id);
create index if not exists idx_fk_industria_roteiros_e_empresa_id_f199b6 on public.industria_roteiros_etapas (empresa_id);
create index if not exists idx_fk_logistica_transporta_empresa_id_978cd2 on public.logistica_transportadoras (empresa_id);
create index if not exists idx_fk_logistica_transporta_pessoa_id_164ea0 on public.logistica_transportadoras (pessoa_id);
create index if not exists idx_fk_metas_vendas_empresa_id_144929 on public.metas_vendas (empresa_id);
create index if not exists idx_fk_metas_vendas_responsavel_id_8b44db on public.metas_vendas (responsavel_id);
create index if not exists idx_fk_ordem_servico_itens_empresa_id_867d34 on public.ordem_servico_itens (empresa_id);
create index if not exists idx_fk_ordem_servico_itens_ordem_servico_id_d47f69 on public.ordem_servico_itens (ordem_servico_id);
create index if not exists idx_fk_ordem_servico_parcel_empresa_id_6c43a5 on public.ordem_servico_parcelas (empresa_id);
create index if not exists idx_fk_ordem_servicos_empresa_id_5486a7 on public.ordem_servicos (empresa_id);
create index if not exists idx_fk_pessoa_contatos_empresa_id_237ab9 on public.pessoa_contatos (empresa_id);
create index if not exists idx_fk_pessoa_enderecos_empresa_id_55a63b on public.pessoa_enderecos (empresa_id);
create index if not exists idx_fk_pessoas_empresa_id_d28700 on public.pessoas (empresa_id);
create index if not exists idx_fk_produto_anuncios_ecommerce_id_d15f42 on public.produto_anuncios (ecommerce_id);
create index if not exists idx_fk_produto_anuncios_produto_id_708f2d on public.produto_anuncios (produto_id);
create index if not exists idx_fk_produto_atributos_atributo_id_118d9c on public.produto_atributos (atributo_id);
create index if not exists idx_fk_produto_componentes_kit_id_e976be on public.produto_componentes (kit_id);
create index if not exists idx_fk_produto_fornecedores_produto_id_8c3169 on public.produto_fornecedores (produto_id);
create index if not exists idx_fk_produto_imagens_produto_id_6c751f on public.produto_imagens (produto_id);
create index if not exists idx_fk_produto_tags_produto_id_c65d3c on public.produto_tags (produto_id);
create index if not exists idx_fk_produtos_produto_pai_id_220894 on public.produtos (produto_pai_id);
create index if not exists idx_fk_profiles_id_276707 on public.profiles (id);
create index if not exists idx_fk_rh_cargo_competencia_competencia_id_2feb1e on public.rh_cargo_competencias (competencia_id);
create index if not exists idx_fk_rh_cargo_competencia_empresa_id_f18267 on public.rh_cargo_competencias (empresa_id);
create index if not exists idx_fk_rh_cargos_empresa_id_72b0d7 on public.rh_cargos (empresa_id);
create index if not exists idx_fk_rh_colaborador_compe_competencia_id_faf9af on public.rh_colaborador_competencias (competencia_id);
create index if not exists idx_fk_rh_colaborador_compe_empresa_id_1e4ede on public.rh_colaborador_competencias (empresa_id);
create index if not exists idx_fk_rh_colaboradores_cargo_id_b0a22b on public.rh_colaboradores (cargo_id);
create index if not exists idx_fk_rh_colaboradores_empresa_id_5d6e0b on public.rh_colaboradores (empresa_id);
create index if not exists idx_fk_rh_colaboradores_user_id_48ffff on public.rh_colaboradores (user_id);
create index if not exists idx_fk_rh_competencias_empresa_id_d47070 on public.rh_competencias (empresa_id);
create index if not exists idx_fk_rh_treinamento_parti_colaborador_id_e99352 on public.rh_treinamento_participantes (colaborador_id);
create index if not exists idx_fk_rh_treinamento_parti_empresa_id_d5a8bd on public.rh_treinamento_participantes (empresa_id);
create index if not exists idx_fk_rh_treinamentos_empresa_id_94ca27 on public.rh_treinamentos (empresa_id);
create index if not exists idx_fk_role_permissions_role_id_4d1d2c on public.role_permissions (role_id);
create index if not exists idx_fk_servicos_empresa_id_30d0ad on public.servicos (empresa_id);
create index if not exists idx_fk_subscriptions_empresa_id_e77643 on public.subscriptions (empresa_id);
create index if not exists idx_fk_transportadoras_empresa_id_61d0d7 on public.transportadoras (empresa_id);
create index if not exists idx_fk_user_active_empresa_empresa_id_93c5cf on public.user_active_empresa (empresa_id);
create index if not exists idx_fk_user_active_empresa_user_id_da73b0 on public.user_active_empresa (user_id);
create index if not exists idx_fk_user_permission_over_empresa_id_888453 on public.user_permission_overrides (empresa_id);
create index if not exists idx_fk_user_permission_over_permission_id_125dcb on public.user_permission_overrides (permission_id);
create index if not exists idx_fk_vendas_itens_pedido_empresa_id_a13e60 on public.vendas_itens_pedido (empresa_id);
create index if not exists idx_fk_vendas_pedidos_empresa_id_5a05c6 on public.vendas_pedidos (empresa_id);
