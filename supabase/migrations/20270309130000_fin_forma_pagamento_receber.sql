/*
  FIN: Adicionar forma_pagamento em contas_a_receber e vendas_pedidos
  -------------------------------------------------------------------
  1) ALTER TABLE contas_a_receber  ADD COLUMN forma_pagamento text
  2) ALTER TABLE vendas_pedidos    ADD COLUMN forma_pagamento text
  3) UPDATE vendas_upsert_pedido   — propagar forma_pagamento no INSERT/UPDATE
  4) UPDATE financeiro_parcelamento_create_contas_a_receber — aceitar p_forma_pagamento
  5) UPDATE financeiro_parcelamento_from_venda_create — ler do pedido + param override
  6) UPDATE list_contas_a_receber_v2 — filtro + retorno forma_pagamento
*/

begin;

-- ============================================================
-- 1) Coluna forma_pagamento em contas_a_receber
-- ============================================================
alter table public.contas_a_receber
  add column if not exists forma_pagamento text;

-- ============================================================
-- 2) Coluna forma_pagamento em vendas_pedidos
-- ============================================================
alter table public.vendas_pedidos
  add column if not exists forma_pagamento text;

-- ============================================================
-- 3) vendas_upsert_pedido — incluir forma_pagamento
-- ============================================================
create or replace function public.vendas_upsert_pedido(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_empresa   uuid := public.current_empresa_id();
  v_id        uuid;
  v_cliente   uuid;
  v_status    text;
  v_data_emis date;
  v_data_ent  date;
  v_frete     numeric;
  v_desc      numeric;
  v_tp        uuid;
begin
  v_cliente := (p_payload->>'cliente_id')::uuid;
  if v_cliente is null then
    raise exception 'cliente_id é obrigatório.';
  end if;

  if not exists (select 1 from public.pessoas c where c.id = v_cliente) then
    raise exception 'Cliente não encontrado.';
  end if;

  v_status := coalesce(p_payload->>'status', 'orcamento');
  if v_status not in ('orcamento','aprovado','cancelado','concluido') then
    raise exception 'Status de pedido inválido.';
  end if;

  v_data_emis := coalesce((p_payload->>'data_emissao')::date, current_date);
  v_data_ent  := (p_payload->>'data_entrega')::date;

  v_frete := coalesce((p_payload->>'frete')::numeric, 0);
  v_desc  := coalesce((p_payload->>'desconto')::numeric, 0);

  v_tp := nullif(p_payload->>'tabela_preco_id','')::uuid;
  if v_tp is not null then
    if not exists (
      select 1 from public.tabelas_preco t
      where t.id = v_tp and t.empresa_id = v_empresa and t.status = 'ativa'
    ) then
      v_tp := null;
    end if;
  end if;

  if p_payload->>'id' is not null then
    update public.vendas_pedidos p
    set
      cliente_id         = v_cliente,
      data_emissao       = v_data_emis,
      data_entrega       = v_data_ent,
      status             = v_status,
      frete              = v_frete,
      desconto           = v_desc,
      condicao_pagamento = p_payload->>'condicao_pagamento',
      observacoes        = p_payload->>'observacoes',
      tabela_preco_id    = v_tp,
      forma_pagamento    = nullif(p_payload->>'forma_pagamento','')
    where p.id = (p_payload->>'id')::uuid
      and p.empresa_id = v_empresa
    returning p.id into v_id;
  else
    insert into public.vendas_pedidos (
      empresa_id,
      cliente_id,
      data_emissao,
      data_entrega,
      status,
      frete,
      desconto,
      condicao_pagamento,
      observacoes,
      tabela_preco_id,
      forma_pagamento
    ) values (
      v_empresa,
      v_cliente,
      v_data_emis,
      v_data_ent,
      v_status,
      v_frete,
      v_desc,
      p_payload->>'condicao_pagamento',
      p_payload->>'observacoes',
      v_tp,
      nullif(p_payload->>'forma_pagamento','')
    )
    returning id into v_id;
  end if;

  perform public.vendas_recalcular_totais(v_id);

  perform pg_notify('app_log', '[RPC] vendas_upsert_pedido: ' || v_id);

  return public.vendas_get_pedido_details(v_id);
end;
$$;

revoke all on function public.vendas_upsert_pedido(jsonb) from public;
grant execute on function public.vendas_upsert_pedido(jsonb) to authenticated, service_role;

-- ============================================================
-- 4) financeiro_parcelamento_create_contas_a_receber — p_forma_pagamento
--    DROP old 9-param signature before creating 10-param version
-- ============================================================
drop function if exists public.financeiro_parcelamento_create_contas_a_receber(uuid,text,numeric,text,date,uuid,text,text,uuid);

create or replace function public.financeiro_parcelamento_create_contas_a_receber(
  p_cliente_id uuid,
  p_descricao text,
  p_total numeric,
  p_condicao text,
  p_base_date date default null,
  p_centro_de_custo_id uuid default null,
  p_observacoes text default null,
  p_origem_tipo text default null,
  p_origem_id uuid default null,
  p_forma_pagamento text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_total numeric(15,2) := round(coalesce(p_total, 0)::numeric, 2);
  v_base date := coalesce(p_base_date, current_date);
  v_due_dates date[];
  v_rows int;
  v_each numeric(15,2);
  v_sum numeric(15,2);
  v_rest numeric(15,2);
  v_parcelamento_id uuid;
  v_ids uuid[] := '{}';
  v_i int;
  v_due date;
  v_conta_id uuid;
  v_parcela_id uuid;
begin
  perform public.require_permission_for_current_user('contas_a_receber','create');

  if v_empresa is null then
    raise exception 'Empresa não encontrada no contexto atual.' using errcode='42501';
  end if;
  if p_cliente_id is null then
    raise exception 'Cliente é obrigatório para gerar títulos.' using errcode='23502';
  end if;
  if v_total <= 0 then
    raise exception 'Total inválido (<= 0).' using errcode='22003';
  end if;

  v_due_dates := public._fin_parse_due_dates(p_condicao, v_base);
  v_rows := array_length(v_due_dates, 1);
  if v_rows is null or v_rows <= 0 then
    v_due_dates := array[v_base];
    v_rows := 1;
  end if;

  v_each := round((v_total / v_rows)::numeric, 2);
  v_sum  := v_each * v_rows;
  v_rest := round(v_total - v_sum, 2);

  insert into public.financeiro_parcelamentos (
    empresa_id, tipo, origem_tipo, origem_id, total, condicao, base_date, created_by
  ) values (
    v_empresa, 'receber', p_origem_tipo, p_origem_id, v_total, coalesce(nullif(p_condicao,''), '1x'), v_base, auth.uid()
  )
  returning id into v_parcelamento_id;

  v_i := 0;
  foreach v_due in array v_due_dates loop
    v_i := v_i + 1;
    v_parcela_id := gen_random_uuid();

    insert into public.contas_a_receber (
      empresa_id,
      cliente_id,
      descricao,
      valor,
      data_vencimento,
      status,
      observacoes,
      centro_de_custo_id,
      origem_tipo,
      origem_id,
      forma_pagamento
    )
    values (
      v_empresa,
      p_cliente_id,
      case when v_rows > 1 then format('%s (%s/%s)', p_descricao, v_i, v_rows) else p_descricao end,
      v_each + case when v_i = v_rows then v_rest else 0 end,
      v_due::date,
      'pendente'::public.status_conta_receber,
      p_observacoes,
      p_centro_de_custo_id,
      'PARCELAMENTO_PARCELA',
      v_parcela_id,
      nullif(p_forma_pagamento, '')
    )
    returning id into v_conta_id;

    insert into public.financeiro_parcelamentos_parcelas (
      id, empresa_id, parcelamento_id, numero_parcela, vencimento, valor, conta_receber_id
    ) values (
      v_parcela_id, v_empresa, v_parcelamento_id, v_i, v_due::date,
      v_each + case when v_i = v_rows then v_rest else 0 end,
      v_conta_id
    );

    v_ids := array_append(v_ids, v_conta_id);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'parcelamento_id', v_parcelamento_id,
    'count', coalesce(array_length(v_ids,1), 0),
    'contas_ids', v_ids
  );
end;
$$;

revoke all on function public.financeiro_parcelamento_create_contas_a_receber(uuid,text,numeric,text,date,uuid,text,text,uuid,text) from public;
grant execute on function public.financeiro_parcelamento_create_contas_a_receber(uuid,text,numeric,text,date,uuid,text,text,uuid,text) to authenticated, service_role;

-- ============================================================
-- 5) financeiro_parcelamento_from_venda_create — ler forma_pagamento do pedido
--    DROP old 3-param signature before creating 4-param version
-- ============================================================
drop function if exists public.financeiro_parcelamento_from_venda_create(uuid,text,date);

create or replace function public.financeiro_parcelamento_from_venda_create(
  p_pedido_id uuid,
  p_condicao text default null,
  p_base_date date default null,
  p_forma_pagamento text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_pedido public.vendas_pedidos;
  v_cond text;
  v_forma text;
begin
  perform public.require_permission_for_current_user('contas_a_receber','create');

  if v_empresa is null then
    raise exception 'Empresa não encontrada no contexto atual.' using errcode='42501';
  end if;

  select * into v_pedido
  from public.vendas_pedidos p
  where p.id = p_pedido_id
    and p.empresa_id = v_empresa
  limit 1;

  if not found then
    raise exception 'Pedido de venda não encontrado.' using errcode='P0002';
  end if;
  if v_pedido.status <> 'concluido' then
    raise exception 'O pedido precisa estar concluído para gerar títulos.' using errcode='23514';
  end if;
  if v_pedido.cliente_id is null then
    raise exception 'Pedido sem cliente vinculado.' using errcode='23514';
  end if;

  v_cond  := coalesce(nullif(p_condicao,''), v_pedido.condicao_pagamento, '1x');
  v_forma := coalesce(nullif(p_forma_pagamento,''), v_pedido.forma_pagamento);

  return public.financeiro_parcelamento_create_contas_a_receber(
    v_pedido.cliente_id,
    ('Pedido ' || v_pedido.numero::text),
    coalesce(v_pedido.total_geral, 0),
    v_cond,
    coalesce(p_base_date, v_pedido.data_emissao, current_date),
    null,
    'Gerado automaticamente a partir de Pedido de Venda concluído.',
    'VENDA',
    p_pedido_id,
    v_forma
  );
end;
$$;

revoke all on function public.financeiro_parcelamento_from_venda_create(uuid,text,date,text) from public;
grant execute on function public.financeiro_parcelamento_from_venda_create(uuid,text,date,text) to authenticated, service_role;

-- ============================================================
-- 6) list_contas_a_receber_v2 — filtro + retorno forma_pagamento
--    DROP old 8-param signature (different return type with forma_pagamento)
-- ============================================================
drop function if exists public.list_contas_a_receber_v2(int,int,text,public.status_conta_receber,date,date,text,text);

create or replace function public.list_contas_a_receber_v2(
  p_limit int default 20,
  p_offset int default 0,
  p_q text default null,
  p_status public.status_conta_receber default null,
  p_start_date date default null,
  p_end_date date default null,
  p_order_by text default 'data_vencimento',
  p_order_dir text default 'asc',
  p_forma_pagamento text default null
)
returns table (
  id uuid,
  descricao text,
  cliente_nome text,
  data_vencimento date,
  valor numeric,
  status public.status_conta_receber,
  forma_pagamento text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order_by text := lower(coalesce(p_order_by,'data_vencimento'));
  v_order_dir text := case when lower(p_order_dir) = 'desc' then 'desc' else 'asc' end;
  v_sql text;
  v_filters text := '';
begin
  v_order_by := case
    when v_order_by in ('data_vencimento','descricao','valor','status','cliente_nome') then v_order_by
    else 'data_vencimento'
  end;

  -- Status filter
  if p_status is not null then
    if p_status = 'vencido'::public.status_conta_receber then
      v_filters := v_filters || ' and (c.status = ''vencido''::public.status_conta_receber or (c.status = ''pendente''::public.status_conta_receber and c.data_vencimento < current_date))';
    elsif p_status = 'pendente'::public.status_conta_receber then
      v_filters := v_filters || ' and (c.status = ''pendente''::public.status_conta_receber)';
    else
      v_filters := v_filters || format(' and c.status = %L::public.status_conta_receber', p_status::text);
    end if;
  end if;

  -- Date range filters
  if p_start_date is not null then
    v_filters := v_filters || format(' and c.data_vencimento >= %L::date', p_start_date::text);
  end if;
  if p_end_date is not null then
    v_filters := v_filters || format(' and c.data_vencimento <= %L::date', p_end_date::text);
  end if;

  -- Search filter
  if p_q is not null and btrim(p_q) <> '' then
    v_filters := v_filters || format(
      ' and (c.descricao ilike %L or p.nome ilike %L)',
      '%'||p_q||'%',
      '%'||p_q||'%'
    );
  end if;

  -- Forma de pagamento filter
  if p_forma_pagamento is not null and btrim(p_forma_pagamento) <> '' then
    v_filters := v_filters || format(' and c.forma_pagamento = %L', p_forma_pagamento);
  end if;

  v_sql := format($fmt$
    select
      c.id,
      c.descricao,
      p.nome as cliente_nome,
      c.data_vencimento,
      c.valor,
      c.status,
      c.forma_pagamento
    from public.contas_a_receber c
    left join public.pessoas p on p.id = c.cliente_id
    where c.empresa_id = public.current_empresa_id()
      %1$s
    order by %2$s %3$s
    limit %4$s offset %5$s
  $fmt$,
    v_filters,
    case
      when v_order_by = 'cliente_nome' then 'p.nome'
      else 'c.' || v_order_by
    end,
    v_order_dir,
    p_limit,
    p_offset
  );

  return query execute v_sql;
end;
$$;

revoke all on function public.list_contas_a_receber_v2(int,int,text,public.status_conta_receber,date,date,text,text,text) from public;
grant execute on function public.list_contas_a_receber_v2(int,int,text,public.status_conta_receber,date,date,text,text,text) to authenticated, service_role;

-- ============================================================
-- 7) RPC de conciliação: financeiro_contas_a_receber_conciliacao_list
-- ============================================================
create or replace function public.financeiro_contas_a_receber_conciliacao_list(
  p_forma_pagamento text default 'Cartão de crédito',
  p_status text default 'pendentes',
  p_start_date date default null,
  p_end_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_result jsonb;
begin
  perform public.require_permission_for_current_user('contas_a_receber','read');

  if v_empresa is null then
    raise exception 'Empresa não encontrada no contexto atual.' using errcode='42501';
  end if;

  with contas as (
    select
      c.id,
      c.descricao,
      p.nome as cliente_nome,
      c.data_vencimento,
      c.valor,
      c.status,
      c.forma_pagamento,
      c.origem_tipo,
      c.origem_id,
      c.data_pagamento,
      c.valor_pago
    from public.contas_a_receber c
    left join public.pessoas p on p.id = c.cliente_id
    where c.empresa_id = v_empresa
      and c.forma_pagamento = p_forma_pagamento
      and (
        case p_status
          when 'pendentes' then
            c.status in ('pendente','vencido')
            or (c.status = 'pendente' and c.data_vencimento < current_date)
          when 'recebido' then
            c.status = 'recebido'
          when 'todos' then
            true
          else
            c.status in ('pendente','vencido')
            or (c.status = 'pendente' and c.data_vencimento < current_date)
        end
      )
      and (p_start_date is null or c.data_vencimento >= p_start_date)
      and (p_end_date is null or c.data_vencimento <= p_end_date)
    order by c.data_vencimento asc, c.descricao asc
  ),
  grouped as (
    select
      c.data_vencimento,
      count(*) as total_titulos,
      sum(c.valor) as total_valor,
      sum(coalesce(c.valor_pago, 0)) as total_pago,
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'descricao', c.descricao,
          'cliente_nome', c.cliente_nome,
          'data_vencimento', c.data_vencimento,
          'valor', c.valor,
          'status', c.status,
          'forma_pagamento', c.forma_pagamento,
          'origem_tipo', c.origem_tipo,
          'data_pagamento', c.data_pagamento,
          'valor_pago', c.valor_pago
        ) order by c.descricao
      ) as titulos
    from contas c
    group by c.data_vencimento
    order by c.data_vencimento asc
  ),
  summary as (
    select
      coalesce(sum(case when c.status in ('pendente') and c.data_vencimento >= current_date then c.valor else 0 end), 0) as total_a_receber,
      coalesce(sum(case when c.status = 'vencido' or (c.status = 'pendente' and c.data_vencimento < current_date) then c.valor else 0 end), 0) as total_vencido,
      coalesce(sum(case when c.status = 'recebido' then coalesce(c.valor_pago, c.valor) else 0 end), 0) as total_recebido
    from contas c
  )
  select jsonb_build_object(
    'summary', (select row_to_json(s)::jsonb from summary s),
    'groups', coalesce((select jsonb_agg(row_to_json(g)::jsonb) from grouped g), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.financeiro_contas_a_receber_conciliacao_list(text,text,date,date) from public;
grant execute on function public.financeiro_contas_a_receber_conciliacao_list(text,text,date,date) to authenticated, service_role;

commit;
