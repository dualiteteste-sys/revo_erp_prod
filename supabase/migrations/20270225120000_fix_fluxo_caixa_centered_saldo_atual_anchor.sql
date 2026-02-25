-- Fix: Fluxo de Caixa (dashboard) — expor saldo atual para ancoragem do saldo acumulado
-- Problema observado em produção: saldo acumulado exibido muito abaixo do saldo real (ex.: deveria ~22k).
-- Causa provável: o gráfico é "centered" e o saldo inicial usado para acumular não está ancorado no saldo atual.
--
-- Solução:
-- - Estende o retorno da RPC `financeiro_fluxo_caixa_centered` com `saldo_atual_cc`.
-- - Mantém `saldo_inicial_cc` (início da janela) para compatibilidade/diagnóstico.
-- - O frontend passa a ancorar a linha do saldo no mês atual usando `saldo_atual_cc`.

begin;

drop function if exists public.financeiro_fluxo_caixa_centered(int);

create function public.financeiro_fluxo_caixa_centered(p_months int)
returns table (
  mes text,
  mes_iso text,
  receber_realizado numeric,
  receber_previsto numeric,
  pagar_realizado numeric,
  pagar_previsto numeric,
  is_past boolean,
  is_current boolean,
  saldo_inicial_cc numeric,
  saldo_atual_cc numeric
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_current_month date := date_trunc('month', current_date);
  v_months_before int;
  v_months_after int;
  v_start date;
  v_end date;
  v_saldo_inicial numeric;
  v_saldo_atual numeric;
begin
  if v_empresa is null then
    raise exception 'Empresa não identificada';
  end if;

  -- Guard obrigatório (SECURITY DEFINER)
  perform public.require_permission_for_current_user('tesouraria', 'view');
  perform public.require_permission_for_current_user('contas_a_receber', 'view');
  perform public.require_permission_for_current_user('contas_a_pagar', 'view');
  perform public.require_permission_for_current_user('contas_correntes', 'view');

  v_months_before := p_months / 2;
  v_months_after := p_months - v_months_before - 1;

  v_start := (v_current_month - (v_months_before || ' months')::interval)::date;
  v_end := (v_current_month + (v_months_after || ' months')::interval + interval '1 month' - interval '1 day')::date;

  -- Saldo inicial no começo da janela (primeiro mês retornado)
  select coalesce(sum(
    cc.saldo_inicial
    + coalesce((
        select sum(
          case when m.tipo_mov = 'entrada' then m.valor else -m.valor end
        )
        from public.financeiro_movimentacoes m
        where m.empresa_id = v_empresa
          and m.conta_corrente_id = cc.id
          and m.data_movimento < v_start
      ), 0)
  ), 0)
  into v_saldo_inicial
  from public.financeiro_contas_correntes cc
  where cc.empresa_id = v_empresa and cc.ativo = true;

  -- Saldo atual total das contas correntes ativas (âncora do gráfico)
  select coalesce(sum(
    cc.saldo_inicial
    + coalesce((
        select sum(
          case when m.tipo_mov = 'entrada' then m.valor else -m.valor end
        )
        from public.financeiro_movimentacoes m
        where m.empresa_id = v_empresa
          and m.conta_corrente_id = cc.id
          and m.data_movimento <= current_date
      ), 0)
  ), 0)
  into v_saldo_atual
  from public.financeiro_contas_correntes cc
  where cc.empresa_id = v_empresa and cc.ativo = true;

  return query
  with meses as (
    select
      to_char(d, 'Mon/YY') as mes_label,
      to_char(d, 'YYYY-MM') as mes_iso,
      d < v_current_month as is_past,
      d = v_current_month as is_current,
      row_number() over (order by d) as rn
    from generate_series(v_start, v_end, '1 month') as d
  ),
  movimentos as (
    select
      to_char(date_trunc('month', m.data_movimento)::date, 'YYYY-MM') as mes_iso,
      sum(case when m.tipo_mov = 'entrada' then m.valor else 0 end) as entradas,
      sum(case when m.tipo_mov = 'saida' then m.valor else 0 end) as saidas
    from public.financeiro_movimentacoes m
    join public.financeiro_contas_correntes cc
      on cc.id = m.conta_corrente_id
     and cc.empresa_id = v_empresa
     and cc.ativo = true
    where m.empresa_id = v_empresa
      and m.data_movimento between v_start and v_end
      -- Transferência interna não é receita/despesa (evita inflar barras)
      and (m.origem_tipo is distinct from 'transferencia_interna')
    group by 1
  ),
  titulos_receber_previsto as (
    select
      to_char(
        case
          when date_trunc('month', c.data_vencimento)::date < v_current_month then v_current_month
          else date_trunc('month', c.data_vencimento)::date
        end,
        'YYYY-MM'
      ) as mes_iso,
      sum(
        greatest(coalesce(c.valor, 0) - coalesce(c.valor_pago, 0), 0)
      ) as previsto
    from public.contas_a_receber c
    where c.empresa_id = v_empresa
      and c.status in ('pendente'::public.status_conta_receber, 'vencido'::public.status_conta_receber)
      and c.status <> 'cancelado'::public.status_conta_receber
      and c.data_vencimento between v_start and v_end
    group by 1
  ),
  titulos_pagar_previsto as (
    select
      to_char(
        case
          when date_trunc('month', cp.data_vencimento)::date < v_current_month then v_current_month
          else date_trunc('month', cp.data_vencimento)::date
        end,
        'YYYY-MM'
      ) as mes_iso,
      sum(
        greatest(coalesce(cp.valor_total, 0) - coalesce(cp.valor_pago, 0), 0)
      ) as previsto
    from public.financeiro_contas_pagar cp
    where cp.empresa_id = v_empresa
      and cp.status in ('aberta', 'parcial')
      and cp.data_vencimento between v_start and v_end
    group by 1
  )
  select
    m.mes_label::text,
    m.mes_iso::text,
    coalesce(mov.entradas, 0)::numeric as receber_realizado,
    coalesce(tr.previsto, 0)::numeric as receber_previsto,
    coalesce(mov.saidas, 0)::numeric as pagar_realizado,
    coalesce(tp.previsto, 0)::numeric as pagar_previsto,
    m.is_past,
    m.is_current,
    case when m.rn = 1 then v_saldo_inicial else 0 end::numeric as saldo_inicial_cc,
    case when m.rn = 1 then v_saldo_atual else 0 end::numeric as saldo_atual_cc
  from meses m
  left join movimentos mov on mov.mes_iso = m.mes_iso
  left join titulos_receber_previsto tr on tr.mes_iso = m.mes_iso
  left join titulos_pagar_previsto tp on tp.mes_iso = m.mes_iso
  order by m.mes_iso;
end;
$$;

comment on function public.financeiro_fluxo_caixa_centered(int) is
'Fluxo de caixa centralizado no mês atual. Realizado por movimentações (exclui transferências internas); previsto por títulos em aberto (vencidos são puxados para o mês atual). saldo_inicial_cc = saldo no início da janela (primeiro registro). saldo_atual_cc = saldo atual total (primeiro registro) para ancoragem do saldo acumulado no frontend.';

revoke all on function public.financeiro_fluxo_caixa_centered(int) from public, anon;
grant execute on function public.financeiro_fluxo_caixa_centered(int) to authenticated, service_role;

commit;

