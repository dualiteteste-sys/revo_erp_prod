-- ====================================================================================
-- Migração: Secure RPCs + Drop assinatura insegura de create_product_for_current_user
-- Data: 2025-11-05
-- ------------------------------------------------------------------------------------
-- Impacto (Resumo)
-- - Segurança: Regra 2 (SECURITY DEFINER + search_path), Regra 5 (grants), Regra 9 (sem empresa_id do cliente).
-- - Compat: mantém assinaturas seguras; remove apenas a variante insegura.
-- - Reversibilidade: possível recriar assinatura antiga (não recomendado).
-- - Performance: filtros por empresa_id usam índices existentes.
-- ====================================================================================

-- 1) DROP da assinatura insegura (Regra 9 + Regra 14)
drop function if exists public.create_product_for_current_user(
  text, text, integer, text, boolean, uuid
);

-- 2) list_partners(...)  -> SECURITY DEFINER + search_path fixo
--    (Regra 2, 5; injeção de empresa_id no servidor)
drop function if exists public.list_partners(integer, integer, text, pessoa_tipo, text);

create function public.list_partners(
  p_limit  integer default 20,
  p_offset integer default 0,
  p_q      text    default null,
  p_tipo   pessoa_tipo default null,
  p_order  text    default 'created_at DESC'
)
returns table (
  id uuid,
  nome text,
  tipo pessoa_tipo,
  doc_unico text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path to 'pg_catalog', 'public'
as $$
  with ctx as (select public.current_empresa_id() as empresa_id)
  select p.id, p.nome, p.tipo, p.doc_unico, p.created_at, p.updated_at
  from public.pessoas p, ctx
  where p.empresa_id = ctx.empresa_id
    and (p_tipo is null or p.tipo = p_tipo)
    and (p_q is null or (p.nome ilike '%'||p_q||'%' or p.doc_unico ilike '%'||p_q||'%'))
  order by
    case when p_order ilike 'created_at desc' then p.created_at end desc,
    case when p_order ilike 'created_at asc'  then p.created_at end asc,
    case when p_order ilike 'nome asc'        then p.nome end asc,
    case when p_order ilike 'nome desc'       then p.nome end desc,
    p.created_at desc
  limit coalesce(p_limit, 20)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function public.list_partners(integer, integer, text, pessoa_tipo, text) from public;
grant execute on function public.list_partners(integer, integer, text, pessoa_tipo, text) to authenticated, service_role;
select pg_notify('app_log', '[RPC] (re)created list_partners as SECURITY DEFINER');

-- 3) produtos_count_for_current_user(p_q text, p_status status_produto)
drop function if exists public.produtos_count_for_current_user(text, status_produto);

create function public.produtos_count_for_current_user(
  p_q text default null,
  p_status status_produto default null
)
returns bigint
language sql
security definer
set search_path to 'pg_catalog', 'public'
as $$
  with ctx as (select public.current_empresa_id() as empresa_id)
  select count(*)
  from public.produtos pr, ctx
  where pr.empresa_id = ctx.empresa_id
    and (p_status is null or pr.status = p_status)
    and (
      p_q is null
      or pr.nome ilike '%'||p_q||'%'
      or pr.sku ilike '%'||p_q||'%'
      or pr.slug ilike '%'||p_q||'%'
    )
$$;

revoke all on function public.produtos_count_for_current_user(text, status_produto) from public;
grant execute on function public.produtos_count_for_current_user(text, status_produto) to authenticated, service_role;
select pg_notify('app_log', '[RPC] (re)created produtos_count_for_current_user as SECURITY DEFINER');

-- 4) produtos_list_for_current_user(...) (paginação/filtros)
drop function if exists public.produtos_list_for_current_user(integer, integer, text, status_produto, text);

create function public.produtos_list_for_current_user(
  p_limit  integer default 20,
  p_offset integer default 0,
  p_q      text    default null,
  p_status status_produto default null,
  p_order  text    default 'created_at DESC'
)
returns table (
  id uuid,
  nome text,
  sku text,
  slug text,
  status status_produto,
  preco_venda numeric,
  unidade text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path to 'pg_catalog', 'public'
as $$
  with ctx as (select public.current_empresa_id() as empresa_id)
  select pr.id, pr.nome, pr.sku, pr.slug, pr.status, pr.preco_venda, pr.unidade, pr.created_at, pr.updated_at
  from public.produtos pr, ctx
  where pr.empresa_id = ctx.empresa_id
    and (p_status is null or pr.status = p_status)
    and (
      p_q is null
      or pr.nome ilike '%'||p_q||'%'
      or pr.sku ilike '%'||p_q||'%'
      or pr.slug ilike '%'||p_q||'%'
    )
  order by
    case when p_order ilike 'created_at desc' then pr.created_at end desc,
    case when p_order ilike 'created_at asc'  then pr.created_at end asc,
    case when p_order ilike 'nome asc'        then pr.nome end asc,
    case when p_order ilike 'nome desc'       then pr.nome end desc,
    pr.created_at desc
  limit coalesce(p_limit, 20)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function public.produtos_list_for_current_user(integer, integer, text, status_produto, text) from public;
grant execute on function public.produtos_list_for_current_user(integer, integer, text, status_produto, text) to authenticated, service_role;
select pg_notify('app_log', '[RPC] (re)created produtos_list_for_current_user as SECURITY DEFINER');

-- 5) Garantir grants na variante segura de create_product_for_current_user(payload jsonb)
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and p.proname='create_product_for_current_user'
      and pg_get_function_identity_arguments(p.oid) = 'payload jsonb'
  ) then
    execute 'revoke all on function public.create_product_for_current_user(jsonb) from public';
    execute 'grant execute on function public.create_product_for_current_user(jsonb) to authenticated, service_role';
    perform pg_notify('app_log', '[RPC] grants enforced for create_product_for_current_user(payload)');
  end if;
end
$$;
