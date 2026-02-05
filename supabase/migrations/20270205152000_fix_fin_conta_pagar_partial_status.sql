/*
  Financeiro: Contas a Pagar — corrigir status em pagamento parcial

  Bug:
  - Qualquer pagamento (mesmo parcial) marcava a conta como "paga".

  Desejado:
  - Pagamento parcial => status "parcial"
  - Quando saldo zerar => status "paga"

  Nota:
  - O modelo atual consolida pagamento em (valor_pago, data_pagamento) e 1 movimentação por origem.
    Em pagamentos incrementais, a movimentação é atualizada para refletir o total pago consolidado.
*/

begin;

create or replace function public.financeiro_conta_pagar_pagar_v2(
  p_id uuid,
  p_data_pagamento date default null,
  p_valor_pago numeric default null,
  p_conta_corrente_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  rec public.financeiro_contas_pagar;
  v_data date := coalesce(p_data_pagamento, current_date);
  v_total numeric;
  v_saldo_atual numeric;
  v_increment numeric;
  v_novo_pago numeric;
  v_novo_status text;
  v_cc_id uuid;
  v_mov_conciliado boolean;
begin
  perform public.require_permission_for_current_user('contas_a_pagar','update');
  perform public.require_permission_for_current_user('tesouraria','create');

  select *
    into rec
  from public.financeiro_contas_pagar
  where id = p_id
    and empresa_id = v_empresa;

  if rec.id is null then
    raise exception '[FINANCEIRO][pagar] Conta a pagar não encontrada.' using errcode = 'P0001';
  end if;

  if rec.status = 'cancelada' then
    raise exception '[FINANCEIRO][pagar] Não é possível pagar uma conta cancelada.' using errcode = 'P0001';
  end if;

  v_total := (rec.valor_total + rec.multa + rec.juros - rec.desconto);
  v_saldo_atual := round(v_total - coalesce(rec.valor_pago, 0), 2);

  if v_saldo_atual <= 0 then
    -- Estado inconsistente (saldo <= 0) — normaliza para "paga" sem gerar nova movimentação.
    if rec.status <> 'paga' then
      update public.financeiro_contas_pagar
      set status = 'paga'
      where id = rec.id
        and empresa_id = v_empresa
      returning * into rec;
    end if;

    return to_jsonb(rec) || jsonb_build_object('saldo', 0);
  end if;

  if rec.status = 'paga' then
    raise exception '[FINANCEIRO][pagar] Esta conta já está paga.' using errcode = 'P0001';
  end if;

  -- Interpretação: p_valor_pago é o valor pago NESTA operação (incremental).
  v_increment := round(coalesce(p_valor_pago, v_saldo_atual), 2);

  if v_increment <= 0 then
    raise exception '[FINANCEIRO][pagar] Informe um valor de pagamento válido.' using errcode = 'P0001';
  end if;

  if v_increment > v_saldo_atual then
    raise exception '[FINANCEIRO][pagar] Valor do pagamento maior que o saldo atual.' using errcode = 'P0001';
  end if;

  v_novo_pago := round(coalesce(rec.valor_pago, 0) + v_increment, 2);

  if v_novo_pago >= round(v_total, 2) then
    v_novo_pago := round(v_total, 2);
    v_novo_status := 'paga';
  else
    v_novo_status := 'parcial';
  end if;

  update public.financeiro_contas_pagar
  set
    status = v_novo_status,
    data_pagamento = v_data,
    valor_pago = v_novo_pago
  where id = rec.id
    and empresa_id = v_empresa
  returning * into rec;

  v_cc_id := coalesce(p_conta_corrente_id, public.financeiro_conta_corrente_escolher('pagamento'));

  select m.conciliado
    into v_mov_conciliado
  from public.financeiro_movimentacoes m
  where m.empresa_id = v_empresa
    and m.origem_tipo = 'conta_a_pagar'
    and m.origem_id = rec.id
  limit 1;

  if coalesce(v_mov_conciliado, false) = true then
    raise exception '[FINANCEIRO][pagar] Movimentação já conciliada; não é possível registrar novo pagamento.' using errcode = 'P0001';
  end if;

  insert into public.financeiro_movimentacoes (
    empresa_id,
    conta_corrente_id,
    data_movimento,
    data_competencia,
    tipo_mov,
    valor,
    descricao,
    documento_ref,
    origem_tipo,
    origem_id,
    categoria,
    centro_custo,
    conciliado,
    observacoes
  ) values (
    v_empresa,
    v_cc_id,
    v_data,
    rec.data_vencimento,
    'saida',
    rec.valor_pago,
    case
      when rec.descricao is null or btrim(rec.descricao) = '' then 'Pagamento'
      else 'Pagamento: ' || rec.descricao
    end,
    rec.documento_ref,
    'conta_a_pagar',
    rec.id,
    rec.categoria,
    rec.centro_custo,
    false,
    null
  )
  on conflict (empresa_id, origem_tipo, origem_id)
    where origem_tipo is not null and origem_id is not null
  do update set
    conta_corrente_id = excluded.conta_corrente_id,
    data_movimento = excluded.data_movimento,
    data_competencia = excluded.data_competencia,
    valor = excluded.valor,
    descricao = excluded.descricao,
    documento_ref = excluded.documento_ref,
    categoria = excluded.categoria,
    centro_custo = excluded.centro_custo,
    updated_at = now();

  perform pg_notify('app_log', '[RPC] financeiro_conta_pagar_pagar_v2 ' || p_id);

  return to_jsonb(rec)
    || jsonb_build_object('saldo', round((rec.valor_total + rec.multa + rec.juros - rec.desconto) - rec.valor_pago, 2));
end;
$$;

revoke all on function public.financeiro_conta_pagar_pagar_v2(uuid, date, numeric, uuid) from public, anon;
grant execute on function public.financeiro_conta_pagar_pagar_v2(uuid, date, numeric, uuid) to authenticated, service_role;

commit;

