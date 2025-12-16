/*
  Hotfix: OP/OB vazio com erro 404 em `industria_list_ordens`

  Causa comum:
  - RPC não existe no projeto alvo, ou
  - PostgREST (schema cache) não recarregou após migração manual.

  Ação:
  - Recria `public.industria_list_ordens` com assinatura esperada pela UI.
  - Garante GRANT para `authenticated`.
  - Força reload do schema cache via NOTIFY pgrst.
*/

begin;

create schema if not exists public;

create or replace function public.industria_list_ordens(
  p_search text default null,
  p_tipo   text default null,
  p_status text default null,
  p_limit  int   default 50,
  p_offset int   default 0
)
returns table (
  id                   uuid,
  numero               int,
  tipo_ordem           text,
  produto_nome         text,
  cliente_nome         text,
  quantidade_planejada numeric,
  unidade              text,
  status               text,
  prioridade           int,
  data_prevista_entrega date,
  total_entregue       numeric
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  return query
  select
    o.id,
    o.numero,
    o.tipo_ordem,
    p.nome as produto_nome,
    c.nome as cliente_nome,
    o.quantidade_planejada,
    o.unidade,
    o.status,
    o.prioridade,
    o.data_prevista_entrega,
    coalesce((
      select sum(e.quantidade_entregue)
      from public.industria_ordens_entregas e
      where e.ordem_id = o.id
        and e.empresa_id = v_empresa_id
    ), 0) as total_entregue
  from public.industria_ordens o
  join public.produtos p
    on o.produto_final_id = p.id
  left join public.pessoas c
    on o.cliente_id = c.id
  where o.empresa_id = v_empresa_id
    and (
      p_search is null
      or o.numero::text ilike '%' || p_search || '%'
      or p.nome          ilike '%' || p_search || '%'
      or c.nome          ilike '%' || p_search || '%'
    )
    and (p_tipo is null   or o.tipo_ordem = p_tipo)
    and (p_status is null or o.status     = p_status)
  order by o.prioridade desc, o.data_prevista_entrega asc nulls last, o.created_at desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.industria_list_ordens from public;
grant execute on function public.industria_list_ordens to authenticated, service_role;

-- Force PostgREST to reload schema cache (evita 404 "schema cache")
notify pgrst, 'reload schema';

commit;

