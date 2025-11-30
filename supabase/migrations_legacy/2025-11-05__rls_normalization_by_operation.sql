-- ====================================================================================
-- Migração: Normalização de RLS por operação (empresa_id = current_empresa_id())
-- Data: 2025-11-05
-- ------------------------------------------------------------------------------------
-- Impacto (Resumo)
-- - Segurança: policies explícitas por operação, filtrando tenant por empresa_id (Regra 1).
-- - Compatibilidade: sem mudança de schema; apenas troca de policies. Exceções preservadas:
--   * addons/plans: leitura pública.
--   * subscriptions: bloqueio de mutações + select por membros preservado.
-- - Reversibilidade: basta restaurar policies anteriores (git/migração inversa).
-- - Performance: usa índices existentes em (empresa_id, ...); sem custo extra relevante.
-- ====================================================================================

-- Helper para evitar repetição (COMMENTs apenas para organização)
-- Tabelas-alvo multi-tenant: atributos, ecommerces, fornecedores, linhas_produto, marcas,
-- pessoa_contatos, pessoa_enderecos, pessoas, produto_anuncios, produto_atributos,
-- produto_componentes, produto_fornecedores, produto_imagens, produto_tags,
-- produtos, ordem_servicos, ordem_servico_itens, ordem_servico_parcelas,
-- servicos, tabelas_medidas, transportadoras.

-- =========================
-- atributos
-- =========================
drop policy if exists atributos_sel on public.atributos;
drop policy if exists atributos_ins on public.atributos;
drop policy if exists atributos_upd on public.atributos;
drop policy if exists atributos_del on public.atributos;

create policy atributos_select_own_company
  on public.atributos for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy atributos_insert_own_company
  on public.atributos for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

create policy atributos_update_own_company
  on public.atributos for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy atributos_delete_own_company
  on public.atributos for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- =========================
-- ecommerces
-- =========================
drop policy if exists ecommerces_sel on public.ecommerces;
drop policy if exists ecommerces_ins on public.ecommerces;
drop policy if exists ecommerces_upd on public.ecommerces;
drop policy if exists ecommerces_del on public.ecommerces;

create policy ecommerces_select_own_company
  on public.ecommerces for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy ecommerces_insert_own_company
  on public.ecommerces for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

create policy ecommerces_update_own_company
  on public.ecommerces for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy ecommerces_delete_own_company
  on public.ecommerces for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- =========================
-- fornecedores
-- =========================
drop policy if exists fornecedores_sel on public.fornecedores;
drop policy if exists fornecedores_ins on public.fornecedores;
drop policy if exists fornecedores_upd on public.fornecedores;
drop policy if exists fornecedores_del on public.fornecedores;

create policy fornecedores_select_own_company
  on public.fornecedores for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy fornecedores_insert_own_company
  on public.fornecedores for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

create policy fornecedores_update_own_company
  on public.fornecedores for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy fornecedores_delete_own_company
  on public.fornecedores for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- =========================
-- linhas_produto
-- =========================
drop policy if exists linhas_produto_sel on public.linhas_produto;
drop policy if exists linhas_produto_ins on public.linhas_produto;
drop policy if exists linhas_produto_upd on public.linhas_produto;
drop policy if exists linhas_produto_del on public.linhas_produto;

create policy linhas_produto_select_own_company
  on public.linhas_produto for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy linhas_produto_insert_own_company
  on public.linhas_produto for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

create policy linhas_produto_update_own_company
  on public.linhas_produto for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy linhas_produto_delete_own_company
  on public.linhas_produto for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- =========================
-- marcas
-- =========================
drop policy if exists marcas_sel on public.marcas;
drop policy if exists marcas_ins on public.marcas;
drop policy if exists marcas_upd on public.marcas;
drop policy if exists marcas_del on public.marcas;

create policy marcas_select_own_company
  on public.marcas for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy marcas_insert_own_company
  on public.marcas for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

create policy marcas_update_own_company
  on public.marcas for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy marcas_delete_own_company
  on public.marcas for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- =========================
-- pessoa_contatos
-- =========================
drop policy if exists pessoa_contatos_sel on public.pessoa_contatos;
drop policy if exists pessoa_contatos_ins on public.pessoa_contatos;
drop policy if exists pessoa_contatos_upd on public.pessoa_contatos;
drop policy if exists pessoa_contatos_del on public.pessoa_contatos;

create policy pessoa_contatos_select_own_company
  on public.pessoa_contatos for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy pessoa_contatos_insert_own_company
  on public.pessoa_contatos for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

create policy pessoa_contatos_update_own_company
  on public.pessoa_contatos for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy pessoa_contatos_delete_own_company
  on public.pessoa_contatos for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- =========================
-- pessoa_enderecos
-- =========================
drop policy if exists pessoa_enderecos_sel on public.pessoa_enderecos;
drop policy if exists pessoa_enderecos_ins on public.pessoa_enderecos;
drop policy if exists pessoa_enderecos_upd on public.pessoa_enderecos;
drop policy if exists pessoa_enderecos_del on public.pessoa_enderecos;

create policy pessoa_enderecos_select_own_company
  on public.pessoa_enderecos for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy pessoa_enderecos_insert_own_company
  on public.pessoa_enderecos for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

create policy pessoa_enderecos_update_own_company
  on public.pessoa_enderecos for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy pessoa_enderecos_delete_own_company
  on public.pessoa_enderecos for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- =========================
-- pessoas
-- =========================
drop policy if exists pessoas_sel on public.pessoas;
drop policy if exists pessoas_ins on public.pessoas;
drop policy if exists pessoas_upd on public.pessoas;
drop policy if exists pessoas_del on public.pessoas;

create policy pessoas_select_own_company
  on public.pessoas for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy pessoas_insert_own_company
  on public.pessoas for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

create policy pessoas_update_own_company
  on public.pessoas for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy pessoas_delete_own_company
  on public.pessoas for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- =========================
-- produto_anuncios
-- =========================
drop policy if exists produto_anuncios_sel on public.produto_anuncios;
drop policy if exists produto_anuncios_ins on public.produto_anuncios;
drop policy if exists produto_anuncios_upd on public.produto_anuncios;
drop policy if exists produto_anuncios_del on public.produto_anuncios;

create policy produto_anuncios_select_own_company
  on public.produto_anuncios for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy produto_anuncios_insert_own_company
  on public.produto_anuncios for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

create policy produto_anuncios_update_own_company
  on public.produto_anuncios for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy produto_anuncios_delete_own_company
  on public.produto_anuncios for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- =========================
-- produto_atributos
-- =========================
drop policy if exists produto_atributos_sel on public.produto_atributos;
drop policy if exists produto_atributos_ins on public.produto_atributos;
drop policy if exists produto_atributos_upd on public.produto_atributos;
drop policy if exists produto_atributos_del on public.produto_atributos;

create policy produto_atributos_select_own_company
  on public.produto_atributos for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy produto_atributos_insert_own_company
  on public.produto_atributos for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

create policy produto_atributos_update_own_company
  on public.produto_atributos for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy produto_atributos_delete_own_company
  on public.produto_atributos for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- =========================
-- produto_componentes
-- =========================
drop policy if exists produto_componentes_sel on public.produto_componentes;
drop policy if exists produto_componentes_ins on public.produto_componentes;
drop policy if exists produto_componentes_upd on public.produto_componentes;
drop policy if exists produto_componentes_del on public.produto_componentes;

create policy produto_componentes_select_own_company
  on public.produto_componentes for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy produto_componentes_insert_own_company
  on public.produto_componentes for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

create policy produto_componentes_update_own_company
  on public.produto_componentes for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy produto_componentes_delete_own_company
  on public.produto_componentes for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- =========================
-- produto_fornecedores
-- =========================
drop policy if exists produto_fornecedores_sel on public.produto_fornecedores;
drop policy if exists produto_fornecedores_ins on public.produto_fornecedores;
drop policy if exists produto_fornecedores_upd on public.produto_fornecedores;
drop policy if exists produto_fornecedores_del on public.produto_fornecedores;

create policy produto_fornecedores_select_own_company
  on public.produto_fornecedores for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy produto_fornecedores_insert_own_company
  on public.produto_fornecedores for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

create policy produto_fornecedores_update_own_company
  on public.produto_fornecedores for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy produto_fornecedores_delete_own_company
  on public.produto_fornecedores for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- =========================
-- produto_imagens
-- =========================
drop policy if exists produto_imagens_sel on public.produto_imagens;
drop policy if exists produto_imagens_ins on public.produto_imagens;
drop policy if exists produto_imagens_upd on public.produto_imagens;
drop policy if exists produto_imagens_del on public.produto_imagens;

create policy produto_imagens_select_own_company
  on public.produto_imagens for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy produto_imagens_insert_own_company
  on public.produto_imagens for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

create policy produto_imagens_update_own_company
  on public.produto_imagens for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy produto_imagens_delete_own_company
  on public.produto_imagens for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- =========================
-- produto_tags
-- =========================
drop policy if exists produto_tags_sel on public.produto_tags;
drop policy if exists produto_tags_ins on public.produto_tags;
drop policy if exists produto_tags_upd on public.produto_tags;
drop policy if exists produto_tags_del on public.produto_tags;

create policy produto_tags_select_own_company
  on public.produto_tags for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy produto_tags_insert_own_company
  on public.produto_tags for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

create policy produto_tags_update_own_company
  on public.produto_tags for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy produto_tags_delete_own_company
  on public.produto_tags for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- =========================
-- produtos
-- =========================
drop policy if exists products_select_members on public.products;
drop policy if exists products_insert_members on public.products;
drop policy if exists products_update_members on public.products;
drop policy if exists products_delete_members on public.products;

drop policy if exists produtos_sel on public.produtos;
drop policy if exists produtos_ins on public.produtos;
drop policy if exists produtos_upd on public.produtos;
drop policy if exists produtos_del on public.produtos;

create policy produtos_select_own_company
  on public.produtos for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy produtos_insert_own_company
  on public.produtos for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

create policy produtos_update_own_company
  on public.produtos for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy produtos_delete_own_company
  on public.produtos for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- =========================
-- ordem_servicos
-- =========================
drop policy if exists sel_os_by_empresa on public.ordem_servicos;
drop policy if exists ins_os_same_empresa on public.ordem_servicos;
drop policy if exists upd_os_same_empresa on public.ordem_servicos;
drop policy if exists del_os_same_empresa on public.ordem_servicos;

create policy ordem_servicos_select_own_company
  on public.ordem_servicos for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy ordem_servicos_insert_own_company
  on public.ordem_servicos for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

create policy ordem_servicos_update_own_company
  on public.ordem_servicos for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy ordem_servicos_delete_own_company
  on public.ordem_servicos for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- =========================
-- ordem_servico_itens
-- =========================
drop policy if exists sel_os_itens_by_empresa on public.ordem_servico_itens;
drop policy if exists ins_os_itens_same_empresa on public.ordem_servico_itens;
drop policy if exists upd_os_itens_same_empresa on public.ordem_servico_itens;
drop policy if exists del_os_itens_same_empresa on public.ordem_servico_itens;

create policy ordem_servico_itens_select_own_company
  on public.ordem_servico_itens for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy ordem_servico_itens_insert_own_company
  on public.ordem_servico_itens for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

create policy ordem_servico_itens_update_own_company
  on public.ordem_servico_itens for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy ordem_servico_itens_delete_own_company
  on public.ordem_servico_itens for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- =========================
-- ordem_servico_parcelas
-- =========================
drop policy if exists sel_os_parcelas_by_empresa on public.ordem_servico_parcelas;
drop policy if exists ins_os_parcelas_same_empresa on public.ordem_servico_parcelas;
drop policy if exists upd_os_parcelas_same_empresa on public.ordem_servico_parcelas;
drop policy if exists del_os_parcelas_same_empresa on public.ordem_servico_parcelas;

create policy ordem_servico_parcelas_select_own_company
  on public.ordem_servico_parcelas for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy ordem_servico_parcelas_insert_own_company
  on public.ordem_servico_parcelas for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

create policy ordem_servico_parcelas_update_own_company
  on public.ordem_servico_parcelas for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy ordem_servico_parcelas_delete_own_company
  on public.ordem_servico_parcelas for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- =========================
-- servicos
-- =========================
drop policy if exists sel_servicos_by_empresa on public.servicos;
drop policy if exists ins_servicos_same_empresa on public.servicos;
drop policy if exists upd_servicos_same_empresa on public.servicos;
drop policy if exists del_servicos_same_empresa on public.servicos;

create policy servicos_select_own_company
  on public.servicos for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy servicos_insert_own_company
  on public.servicos for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

create policy servicos_update_own_company
  on public.servicos for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy servicos_delete_own_company
  on public.servicos for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- =========================
-- tabelas_medidas
-- =========================
drop policy if exists tabelas_medidas_sel on public.tabelas_medidas;
drop policy if exists tabelas_medidas_ins on public.tabelas_medidas;
drop policy if exists tabelas_medidas_upd on public.tabelas_medidas;
drop policy if exists tabelas_medidas_del on public.tabelas_medidas;

create policy tabelas_medidas_select_own_company
  on public.tabelas_medidas for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy tabelas_medidas_insert_own_company
  on public.tabelas_medidas for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

create policy tabelas_medidas_update_own_company
  on public.tabelas_medidas for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy tabelas_medidas_delete_own_company
  on public.tabelas_medidas for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- =========================
-- transportadoras
-- =========================
drop policy if exists sel_transportadoras on public.transportadoras;
drop policy if exists ins_transportadoras on public.transportadoras;
drop policy if exists upd_transportadoras on public.transportadoras;
drop policy if exists del_transportadoras on public.transportadoras;

create policy transportadoras_select_own_company
  on public.transportadoras for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

create policy transportadoras_insert_own_company
  on public.transportadoras for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

create policy transportadoras_update_own_company
  on public.transportadoras for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy transportadoras_delete_own_company
  on public.transportadoras for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- =========================
-- EXCEÇÕES (mantidas)
-- addons: mantém leitura pública
-- plans: mantém leitura pública (active = true) + policy pública existente
-- subscriptions: mantém políticas existentes (bloqueio de mutações + SELECT por membros)
-- =========================

select pg_notify('app_log', '[RLS] normalized per-operation policies to empresa_id = current_empresa_id()');
