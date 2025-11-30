-- [PERF][FK IDX] Índices líderes de FK ausentes (schema public)
-- Idempotente: usa CREATE INDEX IF NOT EXISTS e nomes únicos.

set local search_path = pg_catalog, public;

-- centros_de_custo
create index if not exists idx_centros_de_custo_empresa_id_ee4907 on public.centros_de_custo using btree (empresa_id);

-- compras_itens
create index if not exists idx_compras_itens_empresa_id_114b3b on public.compras_itens using btree (empresa_id);
create index if not exists idx_compras_itens_pedido_id_8ab9b0 on public.compras_itens using btree (pedido_id);
create index if not exists idx_compras_itens_produto_id_0ba593 on public.compras_itens using btree (produto_id);

-- compras_pedidos
create index if not exists idx_compras_pedidos_empresa_id_296469 on public.compras_pedidos using btree (empresa_id);
create index if not exists idx_compras_pedidos_fornecedor_id_7d5f9e on public.compras_pedidos using btree (fornecedor_id);

-- contas_a_receber
create index if not exists idx_contas_a_receber_cliente_id_7e25f4 on public.contas_a_receber using btree (cliente_id);
create index if not exists idx_contas_a_receber_empresa_id_295162 on public.contas_a_receber using btree (empresa_id);

-- CRM
create index if not exists idx_crm_etapas_empresa_id_f613dc        on public.crm_etapas        using btree (empresa_id);
create index if not exists idx_crm_funis_empresa_id_d92a0c         on public.crm_funis         using btree (empresa_id);
create index if not exists idx_crm_oportunidades_cliente_id_1767ea on public.crm_oportunidades using btree (cliente_id);
create index if not exists idx_crm_oportunidades_empresa_id_551b9b on public.crm_oportunidades using btree (empresa_id);
create index if not exists idx_crm_oportunidades_etapa_id_57d18e   on public.crm_oportunidades using btree (etapa_id);
create index if not exists idx_crm_oportunidades_funil_id_35d633   on public.crm_oportunidades using btree (funil_id);

-- empresa_addons
create index if not exists idx_empresa_addons_empresa_id_f22e99 on public.empresa_addons using btree (empresa_id);
create index if not exists idx_empresa_addons_addon_slug_billing_cycle_bef8a0
  on public.empresa_addons using btree (addon_slug, billing_cycle);

-- empresa_usuarios
create index if not exists idx_empresa_usuarios_empresa_id_89002f on public.empresa_usuarios using btree (empresa_id);

-- estoque
create index if not exists idx_estoque_movimentos_empresa_id_1df11b on public.estoque_movimentos using btree (empresa_id);
create index if not exists idx_estoque_saldos_empresa_id_61f63c     on public.estoque_saldos     using btree (empresa_id);

-- financeiro (cadastros/ops)
create index if not exists idx_financeiro_centros_custos_empresa_id_47bf78
  on public.financeiro_centros_custos using btree (empresa_id);
create index if not exists idx_financeiro_cobrancas_bancarias_empresa_id_7ae876
  on public.financeiro_cobrancas_bancarias using btree (empresa_id);
create index if not exists idx_financeiro_cobrancas_bancarias_eventos_empresa_id_b6b047
  on public.financeiro_cobrancas_bancarias_eventos using btree (empresa_id);
create index if not exists idx_financeiro_contas_correntes_empresa_id_c4ac1a
  on public.financeiro_contas_correntes using btree (empresa_id);
create index if not exists idx_financeiro_contas_pagar_empresa_id_672367
  on public.financeiro_contas_pagar using btree (empresa_id);
create index if not exists idx_financeiro_extratos_bancarios_empresa_id_79e988
  on public.financeiro_extratos_bancarios using btree (empresa_id);
create index if not exists idx_financeiro_extratos_bancarios_movimentacao_id_d3d9ac
  on public.financeiro_extratos_bancarios using btree (movimentacao_id);
create index if not exists idx_financeiro_movimentacoes_empresa_id_c8e047
  on public.financeiro_movimentacoes using btree (empresa_id);

-- indústria (beneficia/ordens/BOM/roteiros/produção)
create index if not exists idx_industria_benef_componentes_empresa_id_16aa8e
  on public.industria_benef_componentes using btree (empresa_id);
create index if not exists idx_industria_benef_componentes_ordem_id_6052c0
  on public.industria_benef_componentes using btree (ordem_id);
create index if not exists idx_industria_benef_componentes_produto_id_081c4a
  on public.industria_benef_componentes using btree (produto_id);
create index if not exists idx_industria_benef_entregas_empresa_id_eca06b
  on public.industria_benef_entregas using btree (empresa_id);
create index if not exists idx_industria_benef_entregas_ordem_id_82d66b
  on public.industria_benef_entregas using btree (ordem_id);
create index if not exists idx_industria_benef_ordens_cliente_id_1d7a4b
  on public.industria_benef_ordens using btree (cliente_id);
create index if not exists idx_industria_benef_ordens_empresa_id_baa558
  on public.industria_benef_ordens using btree (empresa_id);
create index if not exists idx_industria_benef_ordens_produto_material_cliente_id_0809a8
  on public.industria_benef_ordens using btree (produto_material_cliente_id);
create index if not exists idx_industria_benef_ordens_produto_servico_id_2c1f82
  on public.industria_benef_ordens using btree (produto_servico_id);

create index if not exists idx_industria_boms_empresa_id_47063f
  on public.industria_boms using btree (empresa_id);
create index if not exists idx_industria_boms_componentes_empresa_id_1fe0bf
  on public.industria_boms_componentes using btree (empresa_id);
create index if not exists idx_industria_centros_trabalho_empresa_id_c4e00a
  on public.industria_centros_trabalho using btree (empresa_id);
create index if not exists idx_industria_materiais_cliente_empresa_id_d7cc8c
  on public.industria_materiais_cliente using btree (empresa_id);

create index if not exists idx_industria_operacoes_empresa_id_c7ea9e
  on public.industria_operacoes using btree (empresa_id);
create index if not exists idx_industria_operacoes_roteiro_etapa_id_7d3283
  on public.industria_operacoes using btree (roteiro_etapa_id);
create index if not exists idx_industria_operacoes_roteiro_id_0ca081
  on public.industria_operacoes using btree (roteiro_id);
create index if not exists idx_industria_operacoes_apontamentos_empresa_id_60d0ce
  on public.industria_operacoes_apontamentos using btree (empresa_id);

create index if not exists idx_industria_ordem_componentes_empresa_id_bdd6e0
  on public.industria_ordem_componentes using btree (empresa_id);
create index if not exists idx_industria_ordem_entregas_empresa_id_f7709d
  on public.industria_ordem_entregas using btree (empresa_id);

create index if not exists idx_industria_ordens_cliente_id_9aa899
  on public.industria_ordens using btree (cliente_id);
create index if not exists idx_industria_ordens_empresa_id_af84ef
  on public.industria_ordens using btree (empresa_id);
create index if not exists idx_industria_ordens_produto_final_id_febfd1
  on public.industria_ordens using btree (produto_final_id);

create index if not exists idx_industria_ordens_componentes_empresa_id_726ac5
  on public.industria_ordens_componentes using btree (empresa_id);
create index if not exists idx_industria_ordens_componentes_ordem_id_0a15f7
  on public.industria_ordens_componentes using btree (ordem_id);
create index if not exists idx_industria_ordens_componentes_produto_id_f28249
  on public.industria_ordens_componentes using btree (produto_id);

create index if not exists idx_industria_ordens_entregas_empresa_id_018121
  on public.industria_ordens_entregas using btree (empresa_id);
create index if not exists idx_industria_ordens_entregas_ordem_id_be12e3
  on public.industria_ordens_entregas using btree (ordem_id);

create index if not exists idx_industria_producao_componentes_empresa_id_35174b
  on public.industria_producao_componentes using btree (empresa_id);
create index if not exists idx_industria_producao_componentes_ordem_id_de9448
  on public.industria_producao_componentes using btree (ordem_id);
create index if not exists idx_industria_producao_componentes_produto_id_10674d
  on public.industria_producao_componentes using btree (produto_id);

create index if not exists idx_industria_producao_entregas_empresa_id_774fa8
  on public.industria_producao_entregas using btree (empresa_id);
create index if not exists idx_industria_producao_entregas_ordem_id_871d29
  on public.industria_producao_entregas using btree (ordem_id);

create index if not exists idx_industria_producao_ordens_empresa_id_79cc2c
  on public.industria_producao_ordens using btree (empresa_id);
create index if not exists idx_industria_producao_ordens_produto_final_id_bb0003
  on public.industria_producao_ordens using btree (produto_final_id);

create index if not exists idx_industria_roteiros_empresa_id_72d42c
  on public.industria_roteiros using btree (empresa_id);
create index if not exists idx_industria_roteiros_etapas_centro_trabalho_id_3623bc
  on public.industria_roteiros_etapas using btree (centro_trabalho_id);
create index if not exists idx_industria_roteiros_etapas_empresa_id_6f7fbe
  on public.industria_roteiros_etapas using btree (empresa_id);

-- logística
create index if not exists idx_logistica_transportadoras_empresa_id_bfb202 on public.logistica_transportadoras using btree (empresa_id);
create index if not exists idx_logistica_transportadoras_pessoa_id_5b1746  on public.logistica_transportadoras using btree (pessoa_id);

-- metas de vendas
create index if not exists idx_metas_vendas_empresa_id_5976fe     on public.metas_vendas using btree (empresa_id);
create index if not exists idx_metas_vendas_responsavel_id_5e109e on public.metas_vendas using btree (responsavel_id);

-- ordens de serviço
create index if not exists idx_ordem_servico_itens_empresa_id_a742ca      on public.ordem_servico_itens      using btree (empresa_id);
create index if not exists idx_ordem_servico_itens_ordem_servico_id_b6ead9 on public.ordem_servico_itens      using btree (ordem_servico_id);
create index if not exists idx_ordem_servico_parcelas_empresa_id_7195f4   on public.ordem_servico_parcelas   using btree (empresa_id);
create index if not exists idx_ordem_servicos_empresa_id_30a95d           on public.ordem_servicos           using btree (empresa_id);

-- pessoas / contatos / endereços
create index if not exists idx_pessoa_contatos_empresa_id_7dd3bc  on public.pessoa_contatos  using btree (empresa_id);
create index if not exists idx_pessoa_enderecos_empresa_id_060145 on public.pessoa_enderecos using btree (empresa_id);
create index if not exists idx_pessoas_empresa_id_34796f          on public.pessoas          using btree (empresa_id);

-- produtos e derivados
create index if not exists idx_produto_anuncios_ecommerce_id_aeab34 on public.produto_anuncios using btree (ecommerce_id);
create index if not exists idx_produto_anuncios_produto_id_4bb3cc    on public.produto_anuncios using btree (produto_id);
create index if not exists idx_produto_atributos_atributo_id_f8b9c2  on public.produto_atributos using btree (atributo_id);
create index if not exists idx_produto_componentes_kit_id_30158b     on public.produto_componentes using btree (kit_id);
create index if not exists idx_produto_fornecedores_produto_id_b4f98f on public.produto_fornecedores using btree (produto_id);
create index if not exists idx_produto_imagens_produto_id_806f4c      on public.produto_imagens using btree (produto_id);
create index if not exists idx_produto_tags_produto_id_cf7bfc         on public.produto_tags using btree (produto_id);
create index if not exists idx_produtos_produto_pai_id_bc31c1         on public.produtos using btree (produto_pai_id);

-- profiles / roles
create index if not exists idx_profiles_id_27b383                 on public.profiles         using btree (id);
create index if not exists idx_role_permissions_role_id_7d3d16    on public.role_permissions using btree (role_id);

-- RH
create index if not exists idx_rh_cargo_competencias_competencia_id_cd3407 on public.rh_cargo_competencias using btree (competencia_id);
create index if not exists idx_rh_cargo_competencias_empresa_id_8cc745     on public.rh_cargo_competencias using btree (empresa_id);
create index if not exists idx_rh_cargos_empresa_id_8ba47a                 on public.rh_cargos              using btree (empresa_id);
create index if not exists idx_rh_colaborador_competencias_competencia_id_844c68 on public.rh_colaborador_competencias using btree (competencia_id);
create index if not exists idx_rh_colaborador_competencias_empresa_id_8e9583     on public.rh_colaborador_competencias using btree (empresa_id);
create index if not exists idx_rh_colaboradores_cargo_id_e60dd2              on public.rh_colaboradores using btree (cargo_id);
create index if not exists idx_rh_colaboradores_empresa_id_266393            on public.rh_colaboradores using btree (empresa_id);
create index if not exists idx_rh_colaboradores_user_id_2fa2e6               on public.rh_colaboradores using btree (user_id);
create index if not exists idx_rh_competencias_empresa_id_16bab2             on public.rh_competencias using btree (empresa_id);
create index if not exists idx_rh_treinamento_participantes_colaborador_id_2ba4e7 on public.rh_treinamento_participantes using btree (colaborador_id);
create index if not exists idx_rh_treinamento_participantes_empresa_id_1c5605     on public.rh_treinamento_participantes using btree (empresa_id);
create index if not exists idx_rh_treinamentos_empresa_id_98b83a              on public.rh_treinamentos using btree (empresa_id);

-- serviços / assinaturas / logística
create index if not exists idx_servicos_empresa_id_ca3d50        on public.servicos        using btree (empresa_id);
create index if not exists idx_subscriptions_empresa_id_2cc835   on public.subscriptions   using btree (empresa_id);
create index if not exists idx_transportadoras_empresa_id_973d96 on public.transportadoras using btree (empresa_id);

-- sessão ativa / permissões
create index if not exists idx_user_active_empresa_empresa_id_628468   on public.user_active_empresa using btree (empresa_id);
create index if not exists idx_user_active_empresa_user_id_5235e7      on public.user_active_empresa using btree (user_id);
create index if not exists idx_user_permission_overrides_empresa_id_19d5a9
  on public.user_permission_overrides using btree (empresa_id);
create index if not exists idx_user_permission_overrides_permission_id_22011f
  on public.user_permission_overrides using btree (permission_id);

-- vendas
create index if not exists idx_vendas_itens_pedido_empresa_id_304f00 on public.vendas_itens_pedido using btree (empresa_id);
create index if not exists idx_vendas_pedidos_empresa_id_052422      on public.vendas_pedidos     using btree (empresa_id);
