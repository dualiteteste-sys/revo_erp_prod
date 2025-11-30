-- ====================================================================================
-- Migração: Secure RPCs + Drop assinatura insegura de create_product_for_current_user
-- Data: 2025-11-05
-- ------------------------------------------------------------------------------------
-- Impacto (Resumo)
-- - Segurança: reforça Regra 2 (SECURITY DEFINER + search_path), Regra 5 (grants), Regra 9 (sem empresa_id do cliente).
-- - Compatibilidade: mantém assinaturas seguras existentes; remove somente a variante insegura com p_empresa_id.
-- - Reversibilidade: é possível recriar a assinatura removida, se necessário (não recomendado).
-- - Performance: filtros por empresa_id usam índices já existentes (UNIQUE/BTREE em (empresa_id, ...)).
-- ====================================================================================

-- 0) Helpers (garantir existência antes, sem alterar assinatura)
-- Observação: apenas reafirmamos padrão no caso de necessidade futura; não recriamos aqui.

-- 1) DROP da assinatura insegura de create_product_for_current_user
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_product_for_current_user'
      and pg_get_function_identity_arguments(p.oid) =
          'p_name text, p_sku text, p_price_cents integer, p_unit text, p_active boolean, p_empresa_id uuid'
  ) then
    execute 'drop function public.create_product_for_current_user(text, text, integer, text, boolean, uuid)';
    perform pg_notify('app_log', '[RPC] dropped insecure signature: create_product_for_current_user(name,sku,price,unit,active,empresa_id)');
  end if;
end
$$;

-- 2) (Re)CREATE de RPCs que estavam SECURITY INVOKER -> SECURITY DEFINER
-- 2.1 list_partners(...): força filtro por empresa_id atual
do $$
begin
  -- drop pela assinatura exata se existir (Regra 14)
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='list_partners'
      and pg_get_function_identity_arguments(p.oid) = 'p_limit integer, p_offset integer, p_q text, p_tipo pessoa_tipo, p_order text'
  ) then
    execute 'drop function public.list_partners(integer, integer, text, pessoa_tipo, text)';
  end if;

  execute $fn$
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
    with ctx as (
      select public.current_empresa_id() as empresa_id
    )
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
  $fn$;

  -- grants padrão (Regra 5)
  revoke all on function public.list_partners(integer, integer, text, pessoa_tipo, text) from public;
  grant execute on function public.list_partners(integer, integer, text, pessoa_tipo, text) to authenticated, service_role;

  perform pg_notify('app_log', '[RPC] (re)created list_partners as SECURITY DEFINER');
end
$$;

-- 2.2 produtos_count_for_current_user(p_q text, p_status status_produto)
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='produtos_count_for_current_user'
      and pg_get_function_identity_arguments(p.oid) = 'p_q text, p_status status_produto'
  ) then
    execute 'drop function public.produtos_count_for_current_user(text, status_produto)';
  end if;

  execute $fn$
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
  $fn$;

  revoke all on function public.produtos_count_for_current_user(text, status_produto) from public;
  grant execute on function public.produtos_count_for_current_user(text, status_produto) to authenticated, service_role;

  perform pg_notify('app_log', '[RPC] (re)created produtos_count_for_current_user as SECURITY DEFINER');
end
$$;

-- 2.3 produtos_list_for_current_user(...)  (assinatura com paginação/filtros)
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='produtos_list_for_current_user'
      and pg_get_function_identity_arguments(p.oid) =
          'p_limit integer, p_offset integer, p_q text, p_status status_produto, p_order text'
  ) then
    execute 'drop function public.produtos_list_for_current_user(integer, integer, text, status_produto, text)';
  end if;

  execute $fn$
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
  $fn$;

  revoke all on function public.produtos_list_for_current_user(integer, integer, text, status_produto, text) from public;
  grant execute on function public.produtos_list_for_current_user(integer, integer, text, status_produto, text) to authenticated, service_role;

  perform pg_notify('app_log', '[RPC] (re)created produtos_list_for_current_user as SECURITY DEFINER');
end
$$;

-- 2.4 Garantir grants na variante segura de create_product_for_current_user(payload jsonb)
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='create_product_for_current_user'
      and pg_get_function_identity_arguments(p.oid) = 'payload jsonb'
  ) then
    revoke all on function public.create_product_for_current_user(jsonb) from public;
    grant execute on function public.create_product_for_current_user(jsonb) to authenticated, service_role;
    perform pg_notify('app_log', '[RPC] grants enforced for create_product_for_current_user(payload)');
  end if;
end
$$;
