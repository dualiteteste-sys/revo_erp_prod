-- count_partners (READ) — security invoker, search_path fixo
create or replace function public.count_partners(
  p_q   text default null,
  p_tipo public.pessoa_tipo default null
) returns bigint
language sql
set search_path to 'pg_catalog','public'
as $$
  select count(*)
  from public.pessoas p
  where p.empresa_id = public.current_empresa_id()
    and (p_tipo is null or p.tipo = p_tipo)
    and (
      p_q is null
      or p.pessoa_search ilike '%' || lower(p_q) || '%'
    );
$$;

-- list_partners (READ) — security invoker, search_path fixo
-- Retorna colunas usadas hoje + ordenação dinâmica controlada por whitelist
create or replace function public.list_partners(
  p_limit  integer default 20,
  p_offset integer default 0,
  p_q      text    default null,
  p_tipo   public.pessoa_tipo default null,
  p_order  text    default 'created_at desc'
) returns table(
  id uuid, nome text, tipo public.pessoa_tipo, doc_unico text, email text,
  created_at timestamptz, updated_at timestamptz
)
language sql
set search_path to 'pg_catalog','public'
as $$
  with base as (
    select p.id, p.nome, p.tipo, p.doc_unico, p.email, p.created_at, p.updated_at
    from public.pessoas p
    where p.empresa_id = public.current_empresa_id()
      and (p_tipo is null or p.tipo = p_tipo)
      and (
        p_q is null
        or p.pessoa_search ilike '%' || lower(p_q) || '%'
      )
  ),
  ordered as (
    select * from base
    order by
      case when lower(p_order) = 'nome asc'         then nome end asc nulls last,
      case when lower(p_order) = 'nome desc'        then nome end desc nulls last,
      case when lower(p_order) = 'created_at asc'   then created_at end asc nulls last,
      case when lower(p_order) = 'created_at desc'  then created_at end desc nulls last,
      created_at desc
  )
  select * from ordered
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

-- get_partner_details (READ) — permanece igual (invoker+RLS), recolocado por completude
create or replace function public.get_partner_details(p_id uuid)
returns jsonb
language sql
set search_path to 'pg_catalog','public'
as $$
  select to_jsonb(p) || jsonb_build_object(
    'enderecos', coalesce(
      (select jsonb_agg(e) from public.pessoa_enderecos e where e.pessoa_id = p.id),
      '[]'::jsonb
    ),
    'contatos', coalesce(
      (select jsonb_agg(c) from public.pessoa_contatos c where c.pessoa_id = p.id),
      '[]'::jsonb
    )
  )
  from public.pessoas p
  where p.id = p_id;
$$;
