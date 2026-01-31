-- Produtos: Tree Table (pais + variações) para listagem no módulo Produtos
-- Objetivo: Paginar por pais, expandir/contrair variações, e permitir busca por variação sem perder agrupamento.
-- "Estado da Arte": RPC-first, multi-tenant, SECURITY DEFINER, sem acesso direto a tabelas no frontend.



-- 1) Listar/paginar somente produtos "pai" (produto_pai_id IS NULL), com children_count.
create or replace function public.produtos_parents_count_for_current_user(
  p_q text default null,
  p_status public.status_produto default null
)
returns bigint
language sql
security definer
set search_path to 'pg_catalog','public'
as $$
  with ctx as (select public.current_empresa_id() as empresa_id)
  select count(*)
  from (
    select p.id
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
  ) s
$$;

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
  children_count bigint
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
      ) as children_count
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

-- 2) Variantes: incluir resumo de atributos para diferenciar rapidamente (ex.: "Cor: Azul • Tam: G").
-- Nota: esta migração altera o retorno da função para incluir `atributos_summary`.
-- Como Postgres não permite mudar `RETURNS TABLE(...)` via CREATE OR REPLACE quando a rowtype muda,
-- fazemos DROP + CREATE (seguro porque o nome/contrato é usado somente pela app).
drop function if exists public.produtos_variantes_list_for_current_user(uuid);
create or replace function public.produtos_variantes_list_for_current_user(p_produto_pai_id uuid)
returns table(
  id uuid,
  nome text,
  sku text,
  status public.status_produto,
  unidade text,
  preco_venda numeric,
  created_at timestamptz,
  updated_at timestamptz,
  atributos_summary text
)
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  if p_produto_pai_id is null then
    raise exception 'p_produto_pai_id é obrigatório.';
  end if;

  return query
  select
    p.id,
    p.nome,
    p.sku,
    p.status,
    p.unidade,
    p.preco_venda,
    p.created_at,
    p.updated_at,
    (
      select string_agg(
        a.nome || ': ' || coalesce(
          pa.valor_text,
          case when pa.valor_num is not null then trim(to_char(pa.valor_num, 'FM999999999990D999999')) end,
          case when pa.valor_bool is not null then (case when pa.valor_bool then 'Sim' else 'Não' end) end,
          case when pa.valor_json is not null then pa.valor_json::text end
        ),
        ' • '
        order by a.nome
      )
      from public.produto_atributos pa
      join public.atributos a on a.id = pa.atributo_id
      where pa.empresa_id = v_empresa
        and pa.produto_id = p.id
    ) as atributos_summary
  from public.produtos p
  where p.empresa_id = v_empresa
    and p.produto_pai_id = p_produto_pai_id
  order by p.nome;
end;
$$;


