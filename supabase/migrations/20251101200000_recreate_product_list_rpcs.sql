-- Migration: Recria as RPCs para listagem de produtos, que foram removidas acidentalmente.
-- Isso corrige o erro "Could not find the function" ao listar produtos.

-- Adiciona a função para contar produtos, com filtros.
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

-- Adiciona a função para listar produtos, com paginação, filtros e ordenação.
-- Inclui o campo 'unidade' para compatibilidade com o frontend.
create or replace function public.produtos_list_for_current_user(
  p_limit  integer default 20,
  p_offset integer default 0,
  p_q      text    default null,
  p_status public.status_produto default null,
  p_order  text    default 'created_at desc'
)
returns table (
  id uuid,
  nome text,
  sku text,
  status public.status_produto,
  preco_venda numeric,
  unidade text, -- Adicionado para compatibilidade
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
    select
      p.id,
      p.nome,
      p.sku,
      p.status,
      p.preco_venda,
      p.unidade, -- Adicionado para compatibilidade
      p.gtin,
      p.slug,
      p.updated_at,
      p.created_at
    from public.produtos p
    -- RLS é aplicada automaticamente pelo SECURITY INVOKER
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
    -- Whitelist de ordenação para evitar SQL injection
    select * from base
    order by
      case when lower(p_order) = 'created_at asc'  then created_at end asc nulls last,
      case when lower(p_order) = 'created_at desc' then created_at end desc nulls last,
      case when lower(p_order) = 'nome asc'        then nome end asc nulls last,
      case when lower(p_order) = 'nome desc'       then nome end desc nulls last,
      created_at desc
  )
  select * from ordered
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0)
$$;

-- Permissões mínimas para as funções
revoke all on function public.produtos_count_for_current_user(text, public.status_produto) from public, anon;
grant execute on function public.produtos_count_for_current_user(text, public.status_produto) to authenticated, service_role, postgres;

revoke all on function public.produtos_list_for_current_user(integer, integer, text, public.status_produto, text) from public, anon;
grant execute on function public.produtos_list_for_current_user(integer, integer, text, public.status_produto, text) to authenticated, service_role, postgres;
