-- Add imagem_url to produtos_parents_list_for_current_user so the main
-- product table can show thumbnails.
-- DROP required because RETURNS TABLE columns are changing.

drop function if exists public.produtos_parents_list_for_current_user(integer, integer, text, public.status_produto, text);

create or replace function public.produtos_parents_list_for_current_user(
  p_limit integer default 20,
  p_offset integer default 0,
  p_q text default null,
  p_status public.status_produto default null,
  p_order text default 'created_at DESC'
)
returns table(
  id uuid,
  nome text,
  sku text,
  slug text,
  status public.status_produto,
  preco_venda numeric,
  unidade text,
  created_at timestamptz,
  updated_at timestamptz,
  children_count bigint,
  imagem_url text
)
language sql
security definer
set search_path to 'pg_catalog','public'
as $$
  with ctx as (select public.current_empresa_id() as empresa_id),
  base as (
    select
      p.id,
      p.nome,
      p.sku,
      p.slug,
      p.status,
      p.preco_venda,
      p.unidade,
      p.created_at,
      p.updated_at,
      (
        select count(*)::bigint
        from public.produtos c
        where c.empresa_id = ctx.empresa_id
          and c.produto_pai_id = p.id
      ) as children_count,
      (
        select pi.url
        from public.produto_imagens pi
        where pi.produto_id = p.id
          and pi.empresa_id = ctx.empresa_id
        order by pi.principal desc nulls last, pi.ordem asc
        limit 1
      ) as imagem_url
    from public.produtos p, ctx
    where p.empresa_id = ctx.empresa_id
      and p.produto_pai_id is null
      and (p_status is null or p.status = p_status)
      and (
        p_q is null
        or p.nome ilike '%'||p_q||'%'
        or p.sku ilike '%'||p_q||'%'
        or p.slug ilike '%'||p_q||'%'
        or exists (
          select 1
          from public.produtos c
          where c.empresa_id = ctx.empresa_id
            and c.produto_pai_id = p.id
            and (
              c.nome ilike '%'||p_q||'%'
              or c.sku ilike '%'||p_q||'%'
              or c.slug ilike '%'||p_q||'%'
            )
        )
      )
  )
  select *
  from base
  order by
    case when p_order ilike 'created_at desc' then created_at end desc,
    case when p_order ilike 'created_at asc'  then created_at end asc,
    case when p_order ilike 'nome asc'        then nome end asc,
    case when p_order ilike 'nome desc'       then nome end desc,
    created_at desc
  limit coalesce(p_limit, 20)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function public.produtos_parents_list_for_current_user(integer, integer, text, public.status_produto, text) from public, anon;
grant execute on function public.produtos_parents_list_for_current_user(integer, integer, text, public.status_produto, text) to authenticated, service_role;
