/*
  FIN-01: Contas a Receber ponta-a-ponta (cancelar / estornar)

  - Cancelar: marca conta como cancelado (somente se não estiver paga)
  - Estornar: reverte uma baixa (paga -> pendente) e registra movimentação de estorno

  Observação:
  - Se a movimentação original estiver conciliada, bloqueia estorno (precisa desconciliar primeiro).
*/

BEGIN;

create or replace function public.financeiro_conta_a_receber_cancelar(
  p_id uuid,
  p_motivo text default null
)
returns public.contas_a_receber
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  rec public.contas_a_receber;
begin
  perform public.require_permission_for_current_user('contas_a_receber','update');

  select * into rec
  from public.contas_a_receber
  where id = p_id and empresa_id = v_empresa;

  if rec.id is null then
    raise exception '[FINANCEIRO][cancelar] Conta a receber não encontrada.' using errcode = 'P0001';
  end if;

  if rec.status = 'pago'::public.status_conta_receber then
    raise exception '[FINANCEIRO][cancelar] Conta está paga. Estorne o recebimento antes de cancelar.' using errcode = 'P0001';
  end if;

  update public.contas_a_receber
     set status = 'cancelado'::public.status_conta_receber,
         observacoes = case
           when coalesce(nullif(btrim(p_motivo), ''), '') = '' then observacoes
           when observacoes is null or btrim(observacoes) = '' then '[CANCELADO] ' || btrim(p_motivo)
           else observacoes || E'\n' || '[CANCELADO] ' || btrim(p_motivo)
         end,
         updated_at = now()
   where id = rec.id and empresa_id = v_empresa
  returning * into rec;

  return rec;
end;
$$;

revoke all on function public.financeiro_conta_a_receber_cancelar(uuid, text) from public, anon;
grant execute on function public.financeiro_conta_a_receber_cancelar(uuid, text) to authenticated, service_role;

create or replace function public.financeiro_conta_a_receber_estornar_v2(
  p_id uuid,
  p_data_estorno date default null,
  p_conta_corrente_id uuid default null,
  p_motivo text default null
)
returns public.contas_a_receber
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  rec public.contas_a_receber;
  v_mov public.financeiro_movimentacoes;
  v_data date := coalesce(p_data_estorno, current_date);
  v_cc_id uuid;
  v_valor numeric;
begin
  perform public.require_permission_for_current_user('contas_a_receber','update');
  perform public.require_permission_for_current_user('tesouraria','create');

  select * into rec
  from public.contas_a_receber
  where id = p_id and empresa_id = v_empresa;

  if rec.id is null then
    raise exception '[FINANCEIRO][estornar] Conta a receber não encontrada.' using errcode = 'P0001';
  end if;

  if rec.status <> 'pago'::public.status_conta_receber then
    raise exception '[FINANCEIRO][estornar] Somente contas pagas podem ser estornadas.' using errcode = 'P0001';
  end if;

  -- Movimento original (baixa)
  select * into v_mov
  from public.financeiro_movimentacoes m
  where m.empresa_id = v_empresa
    and m.origem_tipo = 'conta_a_receber'
    and m.origem_id = rec.id
  limit 1;

  if v_mov.id is not null and coalesce(v_mov.conciliado, false) = true then
    raise exception '[FINANCEIRO][estornar] Movimentação conciliada. Desfaça a conciliação antes de estornar.' using errcode = 'P0001';
  end if;

  v_cc_id := coalesce(p_conta_corrente_id, v_mov.conta_corrente_id, public.financeiro_conta_corrente_escolher('recebimento'));
  v_valor := coalesce(rec.valor_pago, rec.valor);

  -- Marca a conta como pendente novamente (remove baixa)
  update public.contas_a_receber
     set status = 'pendente'::public.status_conta_receber,
         data_pagamento = null,
         valor_pago = null,
         observacoes = case
           when coalesce(nullif(btrim(p_motivo), ''), '') = '' then observacoes
           when observacoes is null or btrim(observacoes) = '' then '[ESTORNO] ' || btrim(p_motivo)
           else observacoes || E'\n' || '[ESTORNO] ' || btrim(p_motivo)
         end,
         updated_at = now()
   where id = rec.id and empresa_id = v_empresa
  returning * into rec;

  -- Registra movimentação de estorno (saída) para manter trilha
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
    v_valor,
    case
      when rec.descricao is null or btrim(rec.descricao) = '' then 'Estorno de recebimento'
      else 'Estorno: ' || rec.descricao
    end,
    null,
    'conta_a_receber_estorno',
    rec.id,
    null,
    null,
    false,
    nullif(btrim(p_motivo), '')
  )
  on conflict (empresa_id, origem_tipo, origem_id)
    where origem_tipo is not null and origem_id is not null
  do nothing;

  perform pg_notify('app_log', '[RPC] financeiro_conta_a_receber_estornar_v2 ' || p_id);
  return rec;
end;
$$;

revoke all on function public.financeiro_conta_a_receber_estornar_v2(uuid, date, uuid, text) from public, anon;
grant execute on function public.financeiro_conta_a_receber_estornar_v2(uuid, date, uuid, text) to authenticated, service_role;

-- Wrapper compat (sem conta_corrente_id / motivo)
create or replace function public.financeiro_conta_a_receber_estornar(
  p_id uuid,
  p_data_estorno date default null
)
returns public.contas_a_receber
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return public.financeiro_conta_a_receber_estornar_v2(p_id, p_data_estorno, null, null);
end;
$$;

revoke all on function public.financeiro_conta_a_receber_estornar(uuid, date) from public, anon;
grant execute on function public.financeiro_conta_a_receber_estornar(uuid, date) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');

COMMIT;
