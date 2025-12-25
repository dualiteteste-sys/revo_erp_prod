/*
  Financeiro: Relatórios essenciais (MVP)

  - KPIs consolidados (A Receber / A Pagar / Caixa)
  - Série mensal para gráficos (últimos 6 meses por padrão)
*/

create or replace function public.financeiro_relatorios_resumo(
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
  v_start date := coalesce(p_start_date, (date_trunc('month', current_date) - interval '5 months')::date);
  v_end date := coalesce(p_end_date, current_date);
  v_tmp date;
  v_receber jsonb;
  v_pagar jsonb;
  v_caixa jsonb;
  v_series jsonb;
begin
  if v_empresa is null then
    raise exception '[FIN][RELATORIOS] empresa_id inválido' using errcode = '42501';
  end if;

  if v_end < v_start then
    v_tmp := v_start;
    v_start := v_end;
    v_end := v_tmp;
  end if;

  -- =========================
  -- 1) Contas a Receber (KPIs)
  -- =========================
  select jsonb_build_object(
    'total_pendente',  coalesce(sum(case when c.status = 'pendente'::public.status_conta_receber and c.data_vencimento between v_start and v_end then c.valor end), 0),
    'total_vencido',   coalesce(sum(case when (c.status = 'vencido'::public.status_conta_receber or (c.status = 'pendente'::public.status_conta_receber and c.data_vencimento < current_date)) and c.data_vencimento between v_start and v_end then c.valor end), 0),
    'total_cancelado', coalesce(sum(case when c.status = 'cancelado'::public.status_conta_receber and c.data_vencimento between v_start and v_end then c.valor end), 0),
    'total_pago',      coalesce(sum(case when c.status = 'pago'::public.status_conta_receber and c.data_pagamento between v_start and v_end then coalesce(c.valor_pago, c.valor) end), 0),
    'qtd_pendente',    coalesce(count(*) filter (where c.status = 'pendente'::public.status_conta_receber and c.data_vencimento between v_start and v_end), 0),
    'qtd_vencido',     coalesce(count(*) filter (where (c.status = 'vencido'::public.status_conta_receber or (c.status = 'pendente'::public.status_conta_receber and c.data_vencimento < current_date)) and c.data_vencimento between v_start and v_end), 0),
    'qtd_pago',        coalesce(count(*) filter (where c.status = 'pago'::public.status_conta_receber and c.data_pagamento between v_start and v_end), 0)
  )
  into v_receber
  from public.contas_a_receber c
  where c.empresa_id = v_empresa;

  -- =========================
  -- 2) Contas a Pagar (KPIs)
  -- =========================
  select jsonb_build_object(
    'total_aberta',    coalesce(sum(case when cp.status = 'aberta' and cp.data_vencimento between v_start and v_end then cp.valor_total end), 0),
    'total_parcial',   coalesce(sum(case when cp.status = 'parcial' and cp.data_vencimento between v_start and v_end then (cp.valor_total - coalesce(cp.valor_pago,0)) end), 0),
    'total_cancelada', coalesce(sum(case when cp.status = 'cancelada' and cp.data_vencimento between v_start and v_end then cp.valor_total end), 0),
    'total_paga',      coalesce(sum(case when cp.status = 'paga' and cp.data_pagamento between v_start and v_end then coalesce(cp.valor_pago, cp.valor_total) end), 0),
    'total_vencida',   coalesce(sum(case when cp.status in ('aberta','parcial') and cp.data_vencimento < current_date and cp.data_vencimento between v_start and v_end then (cp.valor_total - coalesce(cp.valor_pago,0)) end), 0),
    'qtd_aberta',      coalesce(count(*) filter (where cp.status = 'aberta' and cp.data_vencimento between v_start and v_end), 0),
    'qtd_parcial',     coalesce(count(*) filter (where cp.status = 'parcial' and cp.data_vencimento between v_start and v_end), 0),
    'qtd_paga',        coalesce(count(*) filter (where cp.status = 'paga' and cp.data_pagamento between v_start and v_end), 0)
  )
  into v_pagar
  from public.financeiro_contas_pagar cp
  where cp.empresa_id = v_empresa;

  -- =========================
  -- 3) Caixa (KPIs)
  -- =========================
  select jsonb_build_object(
    'contas_ativas', count(*) filter (where cc.ativo),
    'saldo_total', coalesce(sum(
      case when cc.ativo then (
        cc.saldo_inicial
        + coalesce((
            select sum(case when m.tipo_mov = 'entrada' then m.valor else -m.valor end)
            from public.financeiro_movimentacoes m
            where m.empresa_id = v_empresa
              and m.conta_corrente_id = cc.id
              and m.data_movimento <= v_end
          ), 0)
      ) else 0 end
    ), 0)
  )
  into v_caixa
  from public.financeiro_contas_correntes cc
  where cc.empresa_id = v_empresa;

  -- =========================
  -- 4) Série mensal (gráficos)
  -- =========================
  with months as (
    select generate_series(
      date_trunc('month', v_start)::date,
      date_trunc('month', v_end)::date,
      interval '1 month'
    )::date as mes
  ),
  mov as (
    select
      date_trunc('month', m.data_movimento)::date as mes,
      sum(case when m.tipo_mov = 'entrada' then m.valor else 0 end) as entradas,
      sum(case when m.tipo_mov = 'saida' then m.valor else 0 end) as saidas
    from public.financeiro_movimentacoes m
    where m.empresa_id = v_empresa
      and m.data_movimento between v_start and v_end
    group by 1
  ),
  rec as (
    select
      date_trunc('month', c.data_pagamento)::date as mes,
      sum(coalesce(c.valor_pago, c.valor)) as receber_pago
    from public.contas_a_receber c
    where c.empresa_id = v_empresa
      and c.status = 'pago'::public.status_conta_receber
      and c.data_pagamento between v_start and v_end
    group by 1
  ),
  pag as (
    select
      date_trunc('month', cp.data_pagamento)::date as mes,
      sum(coalesce(cp.valor_pago, cp.valor_total)) as pagar_pago
    from public.financeiro_contas_pagar cp
    where cp.empresa_id = v_empresa
      and cp.status = 'paga'
      and cp.data_pagamento between v_start and v_end
    group by 1
  )
  select jsonb_agg(
    jsonb_build_object(
      'mes', to_char(m.mes, 'YYYY-MM'),
      'entradas', coalesce(mov.entradas, 0),
      'saidas', coalesce(mov.saidas, 0),
      'receber_pago', coalesce(rec.receber_pago, 0),
      'pagar_pago', coalesce(pag.pagar_pago, 0)
    )
    order by m.mes
  )
  into v_series
  from months m
  left join mov on mov.mes = m.mes
  left join rec on rec.mes = m.mes
  left join pag on pag.mes = m.mes;

  return jsonb_build_object(
    'periodo', jsonb_build_object('inicio', v_start::text, 'fim', v_end::text),
    'receber', coalesce(v_receber, '{}'::jsonb),
    'pagar', coalesce(v_pagar, '{}'::jsonb),
    'caixa', coalesce(v_caixa, '{}'::jsonb),
    'series', coalesce(v_series, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.financeiro_relatorios_resumo(date, date) from public;
grant execute on function public.financeiro_relatorios_resumo(date, date) to authenticated, service_role;

