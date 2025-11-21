/*
# [Fix] Refatorar Políticas de RLS para Produtos e Tabelas Relacionadas
Corrige o problema de listagem de produtos no frontend, substituindo as políticas restritivas por uma verificação de membresia do usuário na empresa.

## Query Description: [Esta operação atualiza as políticas de segurança (RLS) para todas as tabelas relacionadas a produtos. Ela substitui a validação baseada em `current_empresa_id()` por uma verificação que confirma se o usuário autenticado é membro da empresa correspondente à linha de dados. Isso permite que o frontend filtre e exiba dados de qualquer empresa à qual o usuário pertença, resolvendo o erro de listagem.]

## Metadata:
- Schema-Category: ["Structural"]
- Impact-Level: ["Medium"]
- Requires-Backup: [false]
- Reversible: [true]

## Structure Details:
- Funções afetadas: `is_tenant_row` (removida), `is_member_of_empresa` (criada).
- Políticas de RLS atualizadas para 14 tabelas, incluindo: `produtos`, `fornecedores`, `marcas`, `tags`, etc.

## Security Implications:
- RLS Status: [Enabled]
- Policy Changes: [Yes]
- Auth Requirements: [As políticas garantem que todas as operações (SELECT, INSERT, UPDATE, DELETE) sejam validadas contra a tabela `empresa_usuarios`.]

## Performance Impact:
- Indexes: [Nenhum]
- Triggers: [Nenhum]
- Estimated Impact: [Baixo. A nova função de verificação é eficiente e opera em tabelas que devem ser indexadas (`empresa_usuarios`).]
*/

-- 1. Criar uma função helper mais robusta para verificar a membresia do usuário na empresa.
create or replace function public.is_member_of_empresa(p_empresa_id uuid)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.empresa_usuarios
    where empresa_id = p_empresa_id
      and user_id = auth.uid()
  );
$$;

-- 2. Remover a função helper antiga e problemática.
drop function if exists public.is_tenant_row(uuid);

-- 3. Atualizar as políticas de RLS para todas as tabelas relevantes.

-- Tabela: produtos
drop policy if exists produtos_sel on public.produtos;
drop policy if exists produtos_ins on public.produtos;
drop policy if exists produtos_upd on public.produtos;
drop policy if exists produtos_del on public.produtos;
create policy produtos_rls on public.produtos for all
  using (public.is_member_of_empresa(empresa_id))
  with check (public.is_member_of_empresa(empresa_id));

-- Tabela: produto_imagens
drop policy if exists produto_imagens_sel on public.produto_imagens;
drop policy if exists produto_imagens_ins on public.produto_imagens;
drop policy if exists produto_imagens_upd on public.produto_imagens;
drop policy if exists produto_imagens_del on public.produto_imagens;
create policy produto_imagens_rls on public.produto_imagens for all
  using (public.is_member_of_empresa(empresa_id))
  with check (public.is_member_of_empresa(empresa_id));

-- Tabela: tags
drop policy if exists tags_sel on public.tags;
drop policy if exists tags_ins on public.tags;
drop policy if exists tags_upd on public.tags;
drop policy if exists tags_del on public.tags;
create policy tags_rls on public.tags for all
  using (public.is_member_of_empresa(empresa_id))
  with check (public.is_member_of_empresa(empresa_id));

-- Tabela: produto_tags
drop policy if exists produto_tags_sel on public.produto_tags;
drop policy if exists produto_tags_ins on public.produto_tags;
drop policy if exists produto_tags_upd on public.produto_tags;
drop policy if exists produto_tags_del on public.produto_tags;
create policy produto_tags_rls on public.produto_tags for all
  using (public.is_member_of_empresa(empresa_id))
  with check (public.is_member_of_empresa(empresa_id));

-- Tabela: atributos
drop policy if exists atributos_sel on public.atributos;
drop policy if exists atributos_ins on public.atributos;
drop policy if exists atributos_upd on public.atributos;
drop policy if exists atributos_del on public.atributos;
create policy atributos_rls on public.atributos for all
  using (public.is_member_of_empresa(empresa_id))
  with check (public.is_member_of_empresa(empresa_id));

-- Tabela: produto_atributos
drop policy if exists produto_atributos_sel on public.produto_atributos;
drop policy if exists produto_atributos_ins on public.produto_atributos;
drop policy if exists produto_atributos_upd on public.produto_atributos;
drop policy if exists produto_atributos_del on public.produto_atributos;
create policy produto_atributos_rls on public.produto_atributos for all
  using (public.is_member_of_empresa(empresa_id))
  with check (public.is_member_of_empresa(empresa_id));

-- Tabela: ecommerces
drop policy if exists ecommerces_sel on public.ecommerces;
drop policy if exists ecommerces_ins on public.ecommerces;
drop policy if exists ecommerces_upd on public.ecommerces;
drop policy if exists ecommerces_del on public.ecommerces;
create policy ecommerces_rls on public.ecommerces for all
  using (public.is_member_of_empresa(empresa_id))
  with check (public.is_member_of_empresa(empresa_id));

-- Tabela: produto_anuncios
drop policy if exists produto_anuncios_sel on public.produto_anuncios;
drop policy if exists produto_anuncios_ins on public.produto_anuncios;
drop policy if exists produto_anuncios_upd on public.produto_anuncios;
drop policy if exists produto_anuncios_del on public.produto_anuncios;
create policy produto_anuncios_rls on public.produto_anuncios for all
  using (public.is_member_of_empresa(empresa_id))
  with check (public.is_member_of_empresa(empresa_id));

-- Tabela: marcas
drop policy if exists marcas_sel on public.marcas;
drop policy if exists marcas_ins on public.marcas;
drop policy if exists marcas_upd on public.marcas;
drop policy if exists marcas_del on public.marcas;
create policy marcas_rls on public.marcas for all
  using (public.is_member_of_empresa(empresa_id))
  with check (public.is_member_of_empresa(empresa_id));

-- Tabela: tabelas_medidas
drop policy if exists tabelas_medidas_sel on public.tabelas_medidas;
drop policy if exists tabelas_medidas_ins on public.tabelas_medidas;
drop policy if exists tabelas_medidas_upd on public.tabelas_medidas;
drop policy if exists tabelas_medidas_del on public.tabelas_medidas;
create policy tabelas_medidas_rls on public.tabelas_medidas for all
  using (public.is_member_of_empresa(empresa_id))
  with check (public.is_member_of_empresa(empresa_id));

-- Tabela: produto_componentes
drop policy if exists produto_componentes_sel on public.produto_componentes;
drop policy if exists produto_componentes_ins on public.produto_componentes;
drop policy if exists produto_componentes_upd on public.produto_componentes;
drop policy if exists produto_componentes_del on public.produto_componentes;
create policy produto_componentes_rls on public.produto_componentes for all
  using (public.is_member_of_empresa(empresa_id))
  with check (public.is_member_of_empresa(empresa_id));

-- Tabela: linhas_produto
drop policy if exists linhas_produto_sel on public.linhas_produto;
drop policy if exists linhas_produto_ins on public.linhas_produto;
drop policy if exists linhas_produto_upd on public.linhas_produto;
drop policy if exists linhas_produto_del on public.linhas_produto;
create policy linhas_produto_rls on public.linhas_produto for all
  using (public.is_member_of_empresa(empresa_id))
  with check (public.is_member_of_empresa(empresa_id));

-- Tabela: fornecedores
drop policy if exists fornecedores_sel on public.fornecedores;
drop policy if exists fornecedores_ins on public.fornecedores;
drop policy if exists fornecedores_upd on public.fornecedores;
drop policy if exists fornecedores_del on public.fornecedores;
create policy fornecedores_rls on public.fornecedores for all
  using (public.is_member_of_empresa(empresa_id))
  with check (public.is_member_of_empresa(empresa_id));

-- Tabela: produto_fornecedores
drop policy if exists produto_fornecedores_sel on public.produto_fornecedores;
drop policy if exists produto_fornecedores_ins on public.produto_fornecedores;
drop policy if exists produto_fornecedores_upd on public.produto_fornecedores;
drop policy if exists produto_fornecedores_del on public.produto_fornecedores;
create policy produto_fornecedores_rls on public.produto_fornecedores for all
  using (public.is_member_of_empresa(empresa_id))
  with check (public.is_member_of_empresa(empresa_id));
