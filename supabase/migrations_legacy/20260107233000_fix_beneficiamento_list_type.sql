-- =========================================================
-- Fix: Beneficiamento List RPC return type mismatch
-- =========================================================
set search_path = pg_catalog, public;

-- =========================================================
-- RPC: Listar Ordens -> Fix return type of 'numero' to int
-- =========================================================
drop function if exists public.industria_benef_list_ordens(text, text, uuid, int, int);

create or replace function public.industria_benef_list_ordens(
  p_search     text default null,
  p_status     text default null,
  p_cliente_id uuid default null,
  p_limit      int  default 50,
  p_offset     int  default 0
)
returns table (
  id uuid,
  numero int, -- Changed from bigint to int to match table column type
  cliente_nome text,
  produto_servico_nome text,
  pedido_cliente_ref text,
  quantidade_planejada numeric,
  unidade text,
  status text,
  prioridade int,
  data_prevista_entrega date,
  total_entregue numeric,
  percentual_concluido numeric,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  return query
  with entregas_agg as (
    select 
      ordem_id, 
      sum(quantidade_entregue) as qtd_entregue
    from public.industria_benef_entregas
    where empresa_id = v_emp
    group by ordem_id
  )
  select
    o.id,
    o.numero,
    c.nome as cliente_nome,
    s.descricao as produto_servico_nome,
    o.pedido_cliente_ref,
    o.quantidade_planejada,
    o.unidade,
    o.status,
    o.prioridade,
    o.data_prevista_entrega,
    coalesce(ea.qtd_entregue, 0) as total_entregue,
    case 
      when o.quantidade_planejada > 0 then 
        round((coalesce(ea.qtd_entregue, 0) / o.quantidade_planejada) * 100, 2)
      else 0 
    end as percentual_concluido,
    count(*) over() as total_count
  from public.industria_benef_ordens o
  join public.pessoas  c on c.id  = o.cliente_id
  join public.servicos s on s.id  = o.produto_servico_id
  left join entregas_agg ea on ea.ordem_id = o.id
  where o.empresa_id = v_emp
    and (p_status is null or o.status = p_status)
    and (p_cliente_id is null or o.cliente_id = p_cliente_id)
    and (
      p_search is null
      or o.numero::text ilike '%' || p_search || '%'
      or c.nome ilike '%' || p_search || '%'
      or s.descricao ilike '%' || p_search || '%'
      or o.pedido_cliente_ref ilike '%' || p_search || '%'
    )
  order by 
    case when o.status = 'concluida' then 1 else 0 end, -- concluidas ao final
    o.prioridade desc, 
    o.data_prevista_entrega asc nulls last,
    o.numero desc
  limit p_limit offset p_offset;
end;
$$;

-- Reload schema cache
notify pgrst, 'reload schema';
