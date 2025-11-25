-- =========================================================
-- Implementação das RPCs de Beneficiamento e Ajustes de Schema
-- =========================================================

set search_path = pg_catalog, public;

-- 1) Ajuste na tabela de entregas para suportar campos do frontend
alter table public.industria_ordem_entregas
  add column if not exists status_faturamento text default 'nao_faturado',
  add column if not exists documento_faturamento text;

-- 2) RPC: Gerenciar Componentes (Insumos)
create or replace function public.industria_benef_manage_componente(
  p_ordem_id uuid,
  p_componente_id uuid,
  p_produto_id uuid,
  p_quantidade_planejada numeric,
  p_unidade text,
  p_action text -- 'upsert' | 'delete'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  if p_action = 'delete' then
    delete from public.industria_ordem_componentes
    where id = p_componente_id and empresa_id = v_emp;
  else
    if p_componente_id is null then
      insert into public.industria_ordem_componentes (
        empresa_id, ordem_id, produto_id, quantidade, unidade
      ) values (
        v_emp, p_ordem_id, p_produto_id, p_quantidade_planejada, p_unidade
      );
    else
      update public.industria_ordem_componentes
      set
        produto_id = p_produto_id,
        quantidade = p_quantidade_planejada,
        unidade = p_unidade
      where id = p_componente_id and empresa_id = v_emp;
    end if;
  end if;
end;
$$;

-- 3) RPC: Gerenciar Entregas
create or replace function public.industria_benef_manage_entrega(
  p_ordem_id uuid,
  p_entrega_id uuid,
  p_data_entrega date,
  p_quantidade_entregue numeric,
  p_status_faturamento text,
  p_documento_entrega text,
  p_documento_faturamento text,
  p_observacoes text,
  p_action text -- 'upsert' | 'delete'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  if p_action = 'delete' then
    delete from public.industria_ordem_entregas
    where id = p_entrega_id and empresa_id = v_emp;
  else
    if p_entrega_id is null then
      insert into public.industria_ordem_entregas (
        empresa_id, ordem_id, data_entrega, quantidade_entregue,
        status_faturamento, documento_ref, documento_faturamento, observacoes
      ) values (
        v_emp, p_ordem_id, p_data_entrega, p_quantidade_entregue,
        p_status_faturamento, p_documento_entrega, p_documento_faturamento, p_observacoes
      );
    else
      update public.industria_ordem_entregas
      set
        data_entrega = p_data_entrega,
        quantidade_entregue = p_quantidade_entregue,
        status_faturamento = p_status_faturamento,
        documento_ref = p_documento_entrega,
        documento_faturamento = p_documento_faturamento,
        observacoes = p_observacoes
      where id = p_entrega_id and empresa_id = v_emp;
    end if;
  end if;
end;
$$;

-- 4) RPC: Atualizar Status
create or replace function public.industria_benef_update_status(
  p_id uuid,
  p_status text,
  p_prioridade int
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  update public.industria_benef_ordens
  set 
    status = p_status,
    prioridade = coalesce(p_prioridade, prioridade),
    updated_at = now()
  where id = p_id and empresa_id = v_emp;
end;
$$;

-- 5) RPC: Listar Ordens (com cálculos)
create or replace function public.industria_benef_list_ordens(
  p_search text default null,
  p_status text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  numero bigint,
  cliente_nome text,
  produto_servico_nome text,
  pedido_cliente_ref text,
  quantidade_planejada numeric,
  unidade text,
  status text,
  prioridade int,
  data_prevista_entrega timestamptz,
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
    from public.industria_ordem_entregas
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
  join public.pessoas c on c.id = o.cliente_id
  join public.servicos s on s.id = o.produto_servico_id
  left join entregas_agg ea on ea.ordem_id = o.id
  where o.empresa_id = v_emp
    and (p_status is null or o.status = p_status)
    and (
      p_search is null
      or o.numero::text ilike '%' || p_search || '%'
      or c.nome ilike '%' || p_search || '%'
      or o.pedido_cliente_ref ilike '%' || p_search || '%'
    )
  order by 
    case when o.status = 'concluida' then 1 else 0 end, -- Concluídas por último
    o.prioridade desc, 
    o.created_at desc
  limit p_limit offset p_offset;
end;
$$;

-- 6) Permissões
grant execute on function public.industria_benef_manage_componente(uuid, uuid, uuid, numeric, text, text) to authenticated, service_role;
grant execute on function public.industria_benef_manage_entrega(uuid, uuid, date, numeric, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.industria_benef_update_status(uuid, text, int) to authenticated, service_role;
grant execute on function public.industria_benef_list_ordens(text, text, int, int) to authenticated, service_role;

-- 7) Reload schema
notify pgrst, 'reload schema';
