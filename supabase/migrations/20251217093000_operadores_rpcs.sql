-- RPCs auxiliares para operadores: listar e excluir
begin;

drop function if exists public.industria_operadores_list(text);
create or replace function public.industria_operadores_list(p_search text default null)
returns table (
  id uuid,
  nome text,
  email text,
  centros_trabalho_ids uuid[],
  ativo boolean,
  created_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select o.id, o.nome, o.email, o.centros_trabalho_ids, o.ativo, o.created_at
    from public.industria_operadores o
   where o.empresa_id = public.current_empresa_id()
     and (
        p_search is null
        or o.nome ilike '%'||p_search||'%'
        or coalesce(o.email, '') ilike '%'||p_search||'%'
     )
   order by o.nome asc, o.created_at desc;
$$;

drop function if exists public.industria_operador_delete(uuid);
create or replace function public.industria_operador_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.industria_operadores
   where id = p_id
     and empresa_id = public.current_empresa_id();
end;
$$;

commit;
