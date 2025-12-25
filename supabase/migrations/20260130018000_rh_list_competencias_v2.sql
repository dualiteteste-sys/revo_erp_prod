/*
  RH: listagem de competências v2

  Motivo:
  - Permitir filtrar por "ativos" sem quebrar a UI existente.
  - Manter função legada `rh_list_competencias(text)` para compatibilidade.
*/

create or replace function public.rh_list_competencias_v2(
  p_search text default null,
  p_ativo_only boolean default false
)
returns table (
  id uuid,
  nome text,
  tipo text,
  descricao text,
  critico_sgq boolean,
  ativo boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  select c.id, c.nome, c.tipo, c.descricao, c.critico_sgq, c.ativo
  from public.rh_competencias c
  where c.empresa_id = public.current_empresa_id()
    and (p_search is null or c.nome ilike '%' || p_search || '%')
    and (p_ativo_only is false or c.ativo = true)
  order by c.nome;
end;
$$;

revoke all on function public.rh_list_competencias_v2(text, boolean) from public, anon;
grant execute on function public.rh_list_competencias_v2(text, boolean) to authenticated, service_role;

