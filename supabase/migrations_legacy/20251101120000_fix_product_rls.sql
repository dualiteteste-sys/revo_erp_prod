-- 1. Nova função helper para verificar a membresia do usuário na empresa
-- Esta função é mais robusta pois usa o ID do usuário autenticado (auth.uid())
-- em vez de depender de um claim específico no JWT.
create or replace function public.is_user_member_of(p_empresa_id uuid)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.empresa_usuarios eu
    where eu.user_id = auth.uid()
      and eu.empresa_id = p_empresa_id
  );
$$;

-- 2. Remover a função helper antiga que não está funcionando como esperado.
drop function if exists public.is_tenant_row(uuid);

-- 3. Atualizar as políticas de RLS para TODAS as tabelas relevantes,
-- usando a nova função de verificação de membresia.

-- Tabela: produtos
drop policy if exists produtos_sel on public.produtos;
drop policy if exists produtos_ins on public.produtos;
drop policy if exists produtos_upd on public.produtos;
drop policy if exists produtos_del on public.produtos;
create policy produtos_sel on public.produtos for select using (public.is_user_member_of(empresa_id));
create policy produtos_ins on public.produtos for insert with check (public.is_user_member_of(empresa_id));
create policy produtos_upd on public.produtos for update using (public.is_user_member_of(empresa_id)) with check (public.is_user_member_of(empresa_id));
create policy produtos_del on public.produtos for delete using (public.is_user_member_of(empresa_id));

-- Tabela: produto_imagens
drop policy if exists produto_imagens_sel on public.produto_imagens;
drop policy if exists produto_imagens_ins on public.produto_imagens;
drop policy if exists produto_imagens_upd on public.produto_imagens;
drop policy if exists produto_imagens_del on public.produto_imagens;
create policy produto_imagens_sel on public.produto_imagens for select using (public.is_user_member_of(empresa_id));
create policy produto_imagens_ins on public.produto_imagens for insert with check (public.is_user_member_of(empresa_id));
create policy produto_imagens_upd on public.produto_imagens for update using (public.is_user_member_of(empresa_id)) with check (public.is_user_member_of(empresa_id));
create policy produto_imagens_del on public.produto_imagens for delete using (public.is_user_member_of(empresa_id));

-- Tabela: tags
drop policy if exists tags_sel on public.tags;
drop policy if exists tags_ins on public.tags;
drop policy if exists tags_upd on public.tags;
drop policy if exists tags_del on public.tags;
create policy tags_sel on public.tags for select using (public.is_user_member_of(empresa_id));
create policy tags_ins on public.tags for insert with check (public.is_user_member_of(empresa_id));
create policy tags_upd on public.tags for update using (public.is_user_member_of(empresa_id)) with check (public.is_user_member_of(empresa_id));
create policy tags_del on public.tags for delete using (public.is_user_member_of(empresa_id));

-- Tabela: produto_tags
drop policy if exists produto_tags_sel on public.produto_tags;
drop policy if exists produto_tags_ins on public.produto_tags;
drop policy if exists produto_tags_upd on public.produto_tags;
drop policy if exists produto_tags_del on public.produto_tags;
create policy produto_tags_sel on public.produto_tags for select using (public.is_user_member_of(empresa_id));
create policy produto_tags_ins on public.produto_tags for insert with check (public.is_user_member_of(empresa_id));
create policy produto_tags_upd on public.produto_tags for update using (public.is_user_member_of(empresa_id)) with check (public.is_user_member_of(empresa_id));
create policy produto_tags_del on public.produto_tags for delete using (public.is_user_member_of(empresa_id));

-- Tabela: atributos
drop policy if exists atributos_sel on public.atributos;
drop policy if exists atributos_ins on public.atributos;
drop policy if exists atributos_upd on public.atributos;
drop policy if exists atributos_del on public.atributos;
create policy atributos_sel on public.atributos for select using (public.is_user_member_of(empresa_id));
create policy atributos_ins on public.atributos for insert with check (public.is_user_member_of(empresa_id));
create policy atributos_upd on public.atributos for update using (public.is_user_member_of(empresa_id)) with check (public.is_user_member_of(empresa_id));
create policy atributos_del on public.atributos for delete using (public.is_user_member_of(empresa_id));

-- Tabela: produto_atributos
drop policy if exists produto_atributos_sel on public.produto_atributos;
drop policy if exists produto_atributos_ins on public.produto_atributos;
drop policy if exists produto_atributos_upd on public.produto_atributos;
drop policy if exists produto_atributos_del on public.produto_atributos;
create policy produto_atributos_sel on public.produto_atributos for select using (public.is_user_member_of(empresa_id));
create policy produto_atributos_ins on public.produto_atributos for insert with check (public.is_user_member_of(empresa_id));
create policy produto_atributos_upd on public.produto_atributos for update using (public.is_user_member_of(empresa_id)) with check (public.is_user_member_of(empresa_id));
create policy produto_atributos_del on public.produto_atributos for delete using (public.is_user_member_of(empresa_id));

-- Tabela: ecommerces
drop policy if exists ecommerces_sel on public.ecommerces;
drop policy if exists ecommerces_ins on public.ecommerces;
drop policy if exists ecommerces_upd on public.ecommerces;
drop policy if exists ecommerces_del on public.ecommerces;
create policy ecommerces_sel on public.ecommerces for select using (public.is_user_member_of(empresa_id));
create policy ecommerces_ins on public.ecommerces for insert with check (public.is_user_member_of(empresa_id));
create policy ecommerces_upd on public.ecommerces for update using (public.is_user_member_of(empresa_id)) with check (public.is_user_member_of(empresa_id));
create policy ecommerces_del on public.ecommerces for delete using (public.is_user_member_of(empresa_id));

-- Tabela: produto_anuncios
drop policy if exists produto_anuncios_sel on public.produto_anuncios;
drop policy if exists produto_anuncios_ins on public.produto_anuncios;
drop policy if exists produto_anuncios_upd on public.produto_anuncios;
drop policy if exists produto_anuncios_del on public.produto_anuncios;
create policy produto_anuncios_sel on public.produto_anuncios for select using (public.is_user_member_of(empresa_id));
create policy produto_anuncios_ins on public.produto_anuncios for insert with check (public.is_user_member_of(empresa_id));
create policy produto_anuncios_upd on public.produto_anuncios for update using (public.is_user_member_of(empresa_id)) with check (public.is_user_member_of(empresa_id));
create policy produto_anuncios_del on public.produto_anuncios for delete using (public.is_user_member_of(empresa_id));

-- Tabela: marcas
drop policy if exists marcas_sel on public.marcas;
drop policy if exists marcas_ins on public.marcas;
drop policy if exists marcas_upd on public.marcas;
drop policy if exists marcas_del on public.marcas;
create policy marcas_sel on public.marcas for select using (public.is_user_member_of(empresa_id));
create policy marcas_ins on public.marcas for insert with check (public.is_user_member_of(empresa_id));
create policy marcas_upd on public.marcas for update using (public.is_user_member_of(empresa_id)) with check (public.is_user_member_of(empresa_id));
create policy marcas_del on public.marcas for delete using (public.is_user_member_of(empresa_id));

-- Tabela: tabelas_medidas
drop policy if exists tabelas_medidas_sel on public.tabelas_medidas;
drop policy if exists tabelas_medidas_ins on public.tabelas_medidas;
drop policy if exists tabelas_medidas_upd on public.tabelas_medidas;
drop policy if exists tabelas_medidas_del on public.tabelas_medidas;
create policy tabelas_medidas_sel on public.tabelas_medidas for select using (public.is_user_member_of(empresa_id));
create policy tabelas_medidas_ins on public.tabelas_medidas for insert with check (public.is_user_member_of(empresa_id));
create policy tabelas_medidas_upd on public.tabelas_medidas for update using (public.is_user_member_of(empresa_id)) with check (public.is_user_member_of(empresa_id));
create policy tabelas_medidas_del on public.tabelas_medidas for delete using (public.is_user_member_of(empresa_id));

-- Tabela: produto_componentes
drop policy if exists produto_componentes_sel on public.produto_componentes;
drop policy if exists produto_componentes_ins on public.produto_componentes;
drop policy if exists produto_componentes_upd on public.produto_componentes;
drop policy if exists produto_componentes_del on public.produto_componentes;
create policy produto_componentes_sel on public.produto_componentes for select using (public.is_user_member_of(empresa_id));
create policy produto_componentes_ins on public.produto_componentes for insert with check (public.is_user_member_of(empresa_id));
create policy produto_componentes_upd on public.produto_componentes for update using (public.is_user_member_of(empresa_id)) with check (public.is_user_member_of(empresa_id));
create policy produto_componentes_del on public.produto_componentes for delete using (public.is_user_member_of(empresa_id));

-- Tabela: linhas_produto
drop policy if exists linhas_produto_sel on public.linhas_produto;
drop policy if exists linhas_produto_ins on public.linhas_produto;
drop policy if exists linhas_produto_upd on public.linhas_produto;
drop policy if exists linhas_produto_del on public.linhas_produto;
create policy linhas_produto_sel on public.linhas_produto for select using (public.is_user_member_of(empresa_id));
create policy linhas_produto_ins on public.linhas_produto for insert with check (public.is_user_member_of(empresa_id));
create policy linhas_produto_upd on public.linhas_produto for update using (public.is_user_member_of(empresa_id)) with check (public.is_user_member_of(empresa_id));
create policy linhas_produto_del on public.linhas_produto for delete using (public.is_user_member_of(empresa_id));

-- Tabela: fornecedores
drop policy if exists fornecedores_sel on public.fornecedores;
drop policy if exists fornecedores_ins on public.fornecedores;
drop policy if exists fornecedores_upd on public.fornecedores;
drop policy if exists fornecedores_del on public.fornecedores;
create policy fornecedores_sel on public.fornecedores for select using (public.is_user_member_of(empresa_id));
create policy fornecedores_ins on public.fornecedores for insert with check (public.is_user_member_of(empresa_id));
create policy fornecedores_upd on public.fornecedores for update using (public.is_user_member_of(empresa_id)) with check (public.is_user_member_of(empresa_id));
create policy fornecedores_del on public.fornecedores for delete using (public.is_user_member_of(empresa_id));

-- Tabela: produto_fornecedores
drop policy if exists produto_fornecedores_sel on public.produto_fornecedores;
drop policy if exists produto_fornecedores_ins on public.produto_fornecedores;
drop policy if exists produto_fornecedores_upd on public.produto_fornecedores;
drop policy if exists produto_fornecedores_del on public.produto_fornecedores;
create policy produto_fornecedores_sel on public.produto_fornecedores for select using (public.is_user_member_of(empresa_id));
create policy produto_fornecedores_ins on public.produto_fornecedores for insert with check (public.is_user_member_of(empresa_id));
create policy produto_fornecedores_upd on public.produto_fornecedores for update using (public.is_user_member_of(empresa_id)) with check (public.is_user_member_of(empresa_id));
create policy produto_fornecedores_del on public.produto_fornecedores for delete using (public.is_user_member_of(empresa_id));
