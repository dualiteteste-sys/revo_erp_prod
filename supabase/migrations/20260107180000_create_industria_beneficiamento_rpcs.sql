/*
  # Indústria - Beneficiamento: RPCs de Gestão e Listagem
  
  1. Schema Updates:
     - Adiciona colunas de faturamento em industria_ordem_entregas para controle financeiro.
  
  2. RPCs:
     - industria_benef_list_ordens: Listagem com filtros e cálculo de progresso.
     - industria_benef_update_status: Atualização rápida para Kanban (drag & drop).
     - industria_benef_manage_componente: CRUD de insumos/componentes.
     - industria_benef_manage_entrega: CRUD de entregas realizadas.
*/

set search_path = pg_catalog, public;

-- 1) Schema Updates (Colunas auxiliares para entregas de beneficiamento)
alter table public.industria_ordem_entregas
  add column if not exists status_faturamento text default 'nao_faturado',
  add column if not exists documento_faturamento text;

-- 2) Listagem de Ordens de Beneficiamento
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
  with stats as (
    select
      oe.ordem_id,
      sum(oe.quantidade_entregue) as qtd_entregue
    from public.industria_ordem_entregas oe
    where oe.empresa_id = v_emp
    group by oe.ordem_id
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
    coalesce(st.qtd_entregue, 0) as total_entregue,
    case 
      when o.quantidade_planejada > 0 then 
        round((coalesce(st.qtd_entregue, 0) / o.quantidade_planejada) * 100, 2)
      else 0 
    end as percentual_concluido,
    count(*) over() as total_count
  from public.industria_benef_ordens o
  join public.pessoas c on c.id = o.cliente_id
  join public.servicos s on s.id = o.produto_servico_id
  left join stats st on st.ordem_id = o.id
  where o.empresa_id = v_emp
    and (p_status is null or o.status = p_status)
    and (
      p_search is null 
      or o.numero::text ilike '%'||p_search||'%'
      or c.nome ilike '%'||p_search||'%'
      or s.descricao ilike '%'||p_search||'%'
      or o.pedido_cliente_ref ilike '%'||p_search||'%'
    )
  order by 
    case when o.status = 'concluida' then 1 else 0 end, -- Concluídas no final
    o.prioridade desc, 
    o.data_prevista_entrega asc nulls last,
    o.numero desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.industria_benef_list_ordens from public;
grant execute on function public.industria_benef_list_ordens to authenticated, service_role;

-- 3) Update Status (Kanban)
create or replace function public.industria_benef_update_status(
  p_id uuid,
  p_status text,
  p_prioridade int default null
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

revoke all on function public.industria_benef_update_status from public;
grant execute on function public.industria_benef_update_status to authenticated, service_role;

-- 4) Manage Componente (CRUD)
create or replace function public.industria_benef_manage_componente(
  p_ordem_id uuid,
  p_componente_id uuid,
  p_produto_id uuid,
  p_quantidade_planejada numeric,
  p_unidade text,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  if not exists (select 1 from public.industria_benef_ordens where id = p_ordem_id and empresa_id = v_emp) then
    raise exception 'Ordem não encontrada.';
  end if;

  if p_action = 'delete' then
    delete from public.industria_ordem_componentes
    where id = p_componente_id and ordem_id = p_ordem_id and empresa_id = v_emp;
  elsif p_action = 'upsert' then
    if p_componente_id is not null then
      update public.industria_ordem_componentes
      set produto_id = p_produto_id, quantidade = p_quantidade_planejada, unidade = p_unidade, updated_at = now()
      where id = p_componente_id and ordem_id = p_ordem_id and empresa_id = v_emp;
    else
      insert into public.industria_ordem_componentes (empresa_id, ordem_id, produto_id, quantidade, unidade)
      values (v_emp, p_ordem_id, p_produto_id, p_quantidade_planejada, p_unidade);
    end if;
  end if;
end;
$$;

revoke all on function public.industria_benef_manage_componente from public;
grant execute on function public.industria_benef_manage_componente to authenticated, service_role;

-- 5) Manage Entrega (CRUD)
create or replace function public.industria_benef_manage_entrega(
  p_ordem_id uuid,
  p_entrega_id uuid,
  p_data_entrega date,
  p_quantidade_entregue numeric,
  p_status_faturamento text,
  p_documento_entrega text,
  p_documento_faturamento text,
  p_observacoes text,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  if not exists (select 1 from public.industria_benef_ordens where id = p_ordem_id and empresa_id = v_emp) then
    raise exception 'Ordem não encontrada.';
  end if;

  if p_action = 'delete' then
    delete from public.industria_ordem_entregas
    where id = p_entrega_id and ordem_id = p_ordem_id and empresa_id = v_emp;
  elsif p_action = 'upsert' then
    if p_entrega_id is not null then
      update public.industria_ordem_entregas
      set 
        data_entrega = p_data_entrega, 
        quantidade_entregue = p_quantidade_entregue,
        status_faturamento = p_status_faturamento,
        documento_ref = p_documento_entrega,
        documento_faturamento = p_documento_faturamento,
        observacoes = p_observacoes,
        updated_at = now()
      where id = p_entrega_id and ordem_id = p_ordem_id and empresa_id = v_emp;
    else
      insert into public.industria_ordem_entregas (
        empresa_id, ordem_id, data_entrega, quantidade_entregue, status_faturamento, documento_ref, documento_faturamento, observacoes
      ) values (
        v_emp, p_ordem_id, p_data_entrega, p_quantidade_entregue, p_status_faturamento, p_documento_entrega, p_documento_faturamento, p_observacoes
      );
    end if;
  end if;
end;
$$;

revoke all on function public.industria_benef_manage_entrega from public;
grant execute on function public.industria_benef_manage_entrega to authenticated, service_role;

notify pgrst, 'reload schema';
