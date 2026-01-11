/*
  Fix: Contas a Pagar — estorno repetido (pagar → estornar → pagar → estornar)

  Problema
  - `financeiro_conta_pagar_estornar_v2` "desencaixa" a movimentação de pagamento trocando `origem_tipo`
    para `conta_a_pagar_pagamento_estornado`, porém mantém `origem_id = conta_id`.
  - No 2º ciclo, ao tentar estornar novamente, o UPDATE tenta criar outra linha com o mesmo
    (empresa_id, origem_tipo, origem_id), violando o índice único `idx_fin_mov_empresa_origem_uniq`.
  - Além disso, a movimentação inversa (entrada) do estorno usa `origem_id = conta_id` com `ON CONFLICT DO NOTHING`,
    impedindo a criação de estornos subsequentes no fluxo de caixa.

  Solução
  - Ao marcar a movimentação de pagamento como estornada, setar `origem_id = v_mov.id` (id da própria movimentação),
    garantindo unicidade por pagamento.
  - Para a movimentação inversa (entrada), usar a mesma chave (`origem_id = v_mov.id`) para permitir múltiplos ciclos,
    mantendo idempotência por pagamento.
*/

begin;

create or replace function public.financeiro_conta_pagar_estornar_v2(
  p_id uuid,
  p_data_estorno date default null,
  p_conta_corrente_id uuid default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  rec public.financeiro_contas_pagar;
  v_mov public.financeiro_movimentacoes;
  v_data date := coalesce(p_data_estorno, current_date);
  v_cc_id uuid;
  v_valor numeric;
  v_estorno_origem_id uuid;
begin
  perform public.require_permission_for_current_user('contas_a_pagar','update');
  perform public.require_permission_for_current_user('tesouraria','create');

  select * into rec
  from public.financeiro_contas_pagar
  where id = p_id
    and empresa_id = v_empresa;

  if rec.id is null then
    raise exception '[FINANCEIRO][pagar][estornar] Conta a pagar não encontrada.' using errcode = 'P0001';
  end if;

  if coalesce(rec.valor_pago, 0) <= 0 then
    raise exception '[FINANCEIRO][pagar][estornar] Esta conta não possui pagamento registrado.' using errcode = 'P0001';
  end if;

  -- Movimento original (pagamento) — sempre pegar o mais recente
  select * into v_mov
  from public.financeiro_movimentacoes m
  where m.empresa_id = v_empresa
    and m.origem_tipo = 'conta_a_pagar'
    and m.origem_id = rec.id
  order by m.created_at desc
  limit 1;

  if v_mov.id is not null and coalesce(v_mov.conciliado, false) = true then
    raise exception '[FINANCEIRO][pagar][estornar] Movimentação conciliada. Desfaça a conciliação antes de estornar.' using errcode = 'P0001';
  end if;

  v_cc_id := coalesce(p_conta_corrente_id, v_mov.conta_corrente_id, public.financeiro_conta_corrente_escolher('pagamento'));
  v_valor := coalesce(rec.valor_pago, (rec.valor_total + rec.multa + rec.juros - rec.desconto));

  -- chave de idempotência do estorno por "pagamento" (movimentação)
  v_estorno_origem_id := coalesce(v_mov.id, rec.id);

  -- Mantém trilha e permite novo pagamento após estorno:
  -- "desencaixa" a origem do pagamento anterior e evita colisão no índice único
  if v_mov.id is not null then
    update public.financeiro_movimentacoes
       set origem_tipo = 'conta_a_pagar_pagamento_estornado',
           origem_id = v_mov.id,
           observacoes = case
             when coalesce(nullif(btrim(p_motivo), ''), '') = '' then observacoes
             when observacoes is null or btrim(observacoes) = '' then '[ESTORNO] ' || btrim(p_motivo)
             else observacoes || E'\n' || '[ESTORNO] ' || btrim(p_motivo)
           end,
           updated_at = now()
     where id = v_mov.id
       and empresa_id = v_empresa
       and coalesce(conciliado, false) = false;
  end if;

  -- Reabre a conta
  update public.financeiro_contas_pagar
     set status = 'aberta',
         data_pagamento = null,
         valor_pago = 0,
         observacoes = case
           when coalesce(nullif(btrim(p_motivo), ''), '') = '' then observacoes
           when observacoes is null or btrim(observacoes) = '' then '[ESTORNO] ' || btrim(p_motivo)
           else observacoes || E'\n' || '[ESTORNO] ' || btrim(p_motivo)
         end,
         updated_at = now()
   where id = rec.id
     and empresa_id = v_empresa;

  -- Movimentação inversa (entrada) — idempotente por pagamento/movimentação
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
    'entrada',
    v_valor,
    case
      when rec.descricao is null or btrim(rec.descricao) = '' then 'Estorno de pagamento'
      else 'Estorno: ' || rec.descricao
    end,
    rec.documento_ref,
    'conta_a_pagar_estorno',
    v_estorno_origem_id,
    rec.categoria,
    rec.centro_custo,
    false,
    nullif(btrim(p_motivo), '')
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
    observacoes = coalesce(excluded.observacoes, public.financeiro_movimentacoes.observacoes),
    updated_at = now();

  return public.financeiro_contas_pagar_get(p_id);
end;
$$;

revoke all on function public.financeiro_conta_pagar_estornar_v2(uuid, date, uuid, text) from public, anon;
grant execute on function public.financeiro_conta_pagar_estornar_v2(uuid, date, uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

