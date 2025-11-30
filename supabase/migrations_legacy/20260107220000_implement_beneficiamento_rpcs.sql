-- =========================================================
-- Implementação das RPCs de Beneficiamento (compat + MT hardening)
-- =========================================================
set search_path = pg_catalog, public;

-- 0) Ajuste de schema (idempotente)
alter table public.industria_ordem_entregas
  add column if not exists status_faturamento text default 'nao_faturado',
  add column if not exists documento_faturamento text;

-- =========================================================
-- 1) RPC: Gerenciar Componentes (Insumos)
-- =========================================================
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
  v_exists boolean;
begin
  -- Valida que a ordem pertence à empresa atual
  select true
    into v_exists
  from public.industria_benef_ordens o
  where o.id = p_ordem_id
    and o.empresa_id = v_emp
  limit 1;

  if not coalesce(v_exists, false) then
    raise exception 'Ordem não encontrada para a empresa.';
  end if;

  if p_action = 'delete' then
    -- Apaga amarrando por ordem + empresa (evita apagar registro de outra ordem da mesma empresa)
    delete from public.industria_ordem_componentes
    where id = p_componente_id
      and ordem_id = p_ordem_id
      and empresa_id = v_emp;

  elsif p_action = 'upsert' then
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
        unidade    = p_unidade,
        updated_at = now()
      where id = p_componente_id
        and ordem_id = p_ordem_id
        and empresa_id = v_emp;
    end if;
  else
    raise exception 'Ação inválida. Use upsert|delete.';
  end if;

  perform pg_notify('app_log', '[RPC] industria_benef_manage_componente ordem='||p_ordem_id||' acao='||p_action);
end;
$$;

-- =========================================================
-- 2) RPC: Gerenciar Entregas
-- =========================================================
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
  v_exists boolean;
begin
  -- Valida que a ordem pertence à empresa atual
  select true
    into v_exists
  from public.industria_benef_ordens o
  where o.id = p_ordem_id
    and o.empresa_id = v_emp
  limit 1;

  if not coalesce(v_exists, false) then
    raise exception 'Ordem não encontrada para a empresa.';
  end if;

  if p_action = 'delete' then
    delete from public.industria_ordem_entregas
    where id = p_entrega_id
      and ordem_id = p_ordem_id
      and empresa_id = v_emp;

  elsif p_action = 'upsert' then
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
        data_entrega          = p_data_entrega,
        quantidade_entregue   = p_quantidade_entregue,
        status_faturamento    = p_status_faturamento,
        documento_ref         = p_documento_entrega,
        documento_faturamento = p_documento_faturamento,
        observacoes           = p_observacoes,
        updated_at            = now()
      where id = p_entrega_id
        and ordem_id = p_ordem_id
        and empresa_id = v_emp;
    end if;
  else
    raise exception 'Ação inválida. Use upsert|delete.';
  end if;

  perform pg_notify('app_log', '[RPC] industria_benef_manage_entrega ordem='||p_ordem_id||' acao='||p_action);
end;
$$;

-- =========================================================
-- 3) RPC: Atualizar Status
-- =========================================================
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
    status     = p_status,
    prioridade = coalesce(p_prioridade, prioridade),
    updated_at = now()
  where id = p_id
    and empresa_id = v_emp;

  perform pg_notify('app_log', '[RPC] industria_benef_update_status id='||p_id||' status='||p_status);
end;
$$;

-- =========================================================
-- 4) RPC: Listar Ordens (ASSINATURA COMPATÍVEL: inclui p_cliente_id)
-- =========================================================
create or replace function public.industria_benef_list_ordens(
  p_search     text default null,
  p_status     text default null,
  p_cliente_id uuid default null,
  p_limit      int  default 50,
  p_offset     int  default 0
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

-- =========================================================
-- 5) Permissões (revoga tudo e concede nas assinaturas vigentes)
-- =========================================================
do $$
declare r record;
begin
  for r in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and p.proname in ('industria_benef_manage_componente','industria_benef_manage_entrega','industria_benef_update_status','industria_benef_list_ordens')
  loop
    execute format('revoke all on function %I.%I(%s) from public, authenticated, service_role', r.nspname, r.proname, r.args);
    execute format('grant execute on function %I.%I(%s) to authenticated, service_role', r.nspname, r.proname, r.args);
  end loop;
end $$;

-- =========================================================
-- 6) Reload schema cache
-- =========================================================
notify pgrst, 'reload schema';
