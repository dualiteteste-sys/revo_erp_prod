/*
  # [Operation Name]
  Criação de RPCs para Listagem de Produtos

  ## Query Description: [Esta operação cria duas novas funções de procedimento remoto (RPCs) para buscar e contar produtos de forma segura e eficiente. A função `produtos_list_for_current_user` permite a listagem paginada, com busca e ordenação, enquanto `produtos_count_for_current_user` retorna a contagem total de registros para a paginação. Ambas as funções operam no contexto do usuário autenticado, respeitando as políticas de segurança de nível de linha (RLS) existentes para garantir o isolamento de dados entre empresas. A ordenação é controlada por uma lista de permissões para prevenir injeção de SQL.]

  ## Metadata:
  - Schema-Category: ["Structural"]
  - Impact-Level: ["Low"]
  - Requires-Backup: [false]
  - Reversible: [true]

  ## Structure Details:
  - Functions Created:
    - public.produtos_list_for_current_user(integer, integer, text, public.status_produto, text)
    - public.produtos_count_for_current_user(text, public.status_produto)

  ## Security Implications:
  - RLS Status: [Enabled]
  - Policy Changes: [No]
  - Auth Requirements: [authenticated]
  - As funções são `SECURITY INVOKER`, garantindo que as políticas de RLS da tabela `produtos` sejam aplicadas.
  - As permissões de execução são concedidas apenas para o role `authenticated`, prevenindo acesso anônimo.

  ## Performance Impact:
  - Indexes: [Utiliza índices existentes em `produtos`, como `idx_produtos_nome_trgm` e `idx_produtos_empresa_status`.]
  - Triggers: [No]
  - Estimated Impact: [Baixo. As consultas são otimizadas para usar índices existentes e a paginação limita o volume de dados retornado.]
*/

-- Lista paginada + busca + filtro + ordenação controlada
create or replace function public.produtos_list_for_current_user(
  p_limit  integer default 20,
  p_offset integer default 0,
  p_q      text    default null,
  p_status public.status_produto default null,
  p_order  text    default 'created_at desc'   -- whitelist aplicado abaixo
)
returns table (
  id uuid,
  nome text,
  sku text,
  status public.status_produto,
  preco_venda numeric,
  unidade text,
  gtin text,
  slug text,
  updated_at timestamptz,
  created_at timestamptz
)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  with base as (
    select p.id, p.nome, p.sku, p.status, p.preco_venda, p.unidade, p.gtin, p.slug, p.updated_at, p.created_at
    from public.produtos p
    -- RLS aplica automaticamente; não injeta empresa_id aqui
    where (p_status is null or p.status = p_status)
      and (
        p_q is null
        or p.nome ilike '%' || p_q || '%'
        or p.sku  ilike '%' || p_q || '%'
        or p.gtin ilike '%' || p_q || '%'
        or p.slug ilike '%' || p_q || '%'
      )
  ),
  ordered as (
    -- aplica whitelist de ordenação para evitar SQL injection em ORDER BY
    select * from base
    order by
      case when lower(p_order) = 'created_at asc'  then created_at end asc nulls last,
      case when lower(p_order) = 'created_at desc' then created_at end desc nulls last,
      case when lower(p_order) = 'nome asc'        then nome end asc nulls last,
      case when lower(p_order) = 'nome desc'       then nome end desc nulls last,
      case when lower(p_order) = 'sku asc'        then sku end asc nulls last,
      case when lower(p_order) = 'sku desc'       then sku end desc nulls last,
      case when lower(p_order) = 'preco_venda asc'  then preco_venda end asc nulls last,
      case when lower(p_order) = 'preco_venda desc' then preco_venda end desc nulls last
  )
  select * from ordered
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0)
$$;

-- Contagem total para paginação
create or replace function public.produtos_count_for_current_user(
  p_q      text    default null,
  p_status public.status_produto default null
)
returns bigint
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select count(*)
  from public.produtos p
  where (p_status is null or p.status = p_status)
    and (
      p_q is null
      or p.nome ilike '%' || p_q || '%'
      or p.sku  ilike '%' || p_q || '%'
      or p.gtin ilike '%' || p_q || '%'
      or p.slug ilike '%' || p_q || '%'
    );
$$;

-- ACLs mínimas
revoke all on function public.produtos_list_for_current_user(integer, integer, text, public.status_produto, text) from public, anon;
revoke all on function public.produtos_count_for_current_user(text, public.status_produto) from public, anon;

grant execute on function public.produtos_list_for_current_user(integer, integer, text, public.status_produto, text) to authenticated, service_role, postgres;
grant execute on function public.produtos_count_for_current_user(text, public.status_produto) to authenticated, service_role, postgres;
