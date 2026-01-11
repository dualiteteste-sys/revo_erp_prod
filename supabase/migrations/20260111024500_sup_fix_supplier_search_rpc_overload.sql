-- Fix PostgREST overload ambiguity:
-- There were two functions with the same name:
--   - search_suppliers_for_current_user(p_search text)
--   - search_suppliers_for_current_user(p_search text, p_limit integer default 20)
-- PostgREST can't pick the "best candidate" when defaults allow both.

drop function if exists public.search_suppliers_for_current_user(text);
drop function if exists public.search_suppliers_for_current_user(text, integer);

create function public.search_suppliers_for_current_user(
  p_search text,
  p_limit integer default 20
)
returns table (
  id uuid,
  nome text,
  doc_unico text,
  label text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  return query
  select
    p.id,
    p.nome,
    p.doc_unico,
    (p.nome || coalesce(' (' || p.doc_unico || ')', '')) as label
  from public.pessoas p
  where p.empresa_id = v_emp
    and p.tipo in ('fornecedor'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo)
    and (
      p_search is null
      or btrim(p_search) = ''
      or lower(p.nome) like '%' || lower(btrim(p_search)) || '%'
      or lower(coalesce(p.doc_unico,'')) like '%' || lower(btrim(p_search)) || '%'
    )
  order by p.nome
  limit v_limit;
end;
$$;

revoke all on function public.search_suppliers_for_current_user(text, integer) from public, anon;
grant execute on function public.search_suppliers_for_current_user(text, integer) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
