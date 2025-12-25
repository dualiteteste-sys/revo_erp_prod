/*
  Financeiro: Baixas (receber/pagar) devem gerar movimentações na Tesouraria

  Objetivo:
  - Garantir que "Receber" e "Pagar" (atalhos) reflitam no fluxo de caixa/relatórios
  - Evitar duplicidade: idempotência por (empresa_id, origem_tipo, origem_id)
  - Escolher conta corrente padrão automaticamente (ou permitir informar)
*/

begin;

-- Idempotência: um título baixado gera no máximo 1 movimentação por origem.
create unique index if not exists idx_fin_mov_empresa_origem_uniq
  on public.financeiro_movimentacoes (empresa_id, origem_tipo, origem_id)
  where origem_tipo is not null and origem_id is not null;

create or replace function public.financeiro_conta_corrente_escolher(p_para text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid;
begin
  if v_empresa is null then
    raise exception '[FINANCEIRO][tesouraria] Nenhuma empresa ativa encontrada.' using errcode = '42501';
  end if;

  if p_para = 'recebimento' then
    select cc.id
      into v_id
    from public.financeiro_contas_correntes cc
    where cc.empresa_id = v_empresa
      and cc.ativo = true
      and cc.padrao_para_recebimentos = true
    order by cc.updated_at desc
    limit 1;
  elsif p_para = 'pagamento' then
    select cc.id
      into v_id
    from public.financeiro_contas_correntes cc
    where cc.empresa_id = v_empresa
      and cc.ativo = true
      and cc.padrao_para_pagamentos = true
    order by cc.updated_at desc
    limit 1;
  end if;

  if v_id is null then
    select cc.id
      into v_id
    from public.financeiro_contas_correntes cc
    where cc.empresa_id = v_empresa
      and cc.ativo = true
    order by
      (cc.tipo_conta = 'caixa') desc,
      cc.updated_at desc
    limit 1;
  end if;

  if v_id is null then
    -- Estado da arte (MVP): não bloquear o usuário — cria/reativa um "Caixa" padrão.
    select cc.id
      into v_id
    from public.financeiro_contas_correntes cc
    where cc.empresa_id = v_empresa
    order by
      (cc.tipo_conta = 'caixa') desc,
      cc.updated_at desc
    limit 1;

    if v_id is not null then
      update public.financeiro_contas_correntes
      set
        ativo = true,
        padrao_para_recebimentos = true,
        padrao_para_pagamentos = true,
        updated_at = now()
      where id = v_id
        and empresa_id = v_empresa;
    else
      insert into public.financeiro_contas_correntes (
        empresa_id,
        nome,
        apelido,
        tipo_conta,
        saldo_inicial,
        data_saldo_inicial,
        permite_saldo_negativo,
        ativo,
        padrao_para_pagamentos,
        padrao_para_recebimentos,
        observacoes
      ) values (
        v_empresa,
        'Caixa',
        'Caixa',
        'caixa',
        0,
        current_date,
        true,
        true,
        true,
        true,
        'Criado automaticamente para permitir baixas rápidas (receber/pagar).'
      )
      returning id into v_id;
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.financeiro_conta_corrente_escolher(text) from public, anon;
grant execute on function public.financeiro_conta_corrente_escolher(text) to authenticated, service_role;

-- =============================================================================
-- Receber Conta a Receber (v2 + wrapper compatível)
-- =============================================================================

create or replace function public.financeiro_conta_a_receber_receber_v2(
  p_id uuid,
  p_data_pagamento date default null,
  p_valor_pago numeric default null,
  p_conta_corrente_id uuid default null
)
returns public.contas_a_receber
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  rec public.contas_a_receber;
  v_data date := coalesce(p_data_pagamento, current_date);
  v_cc_id uuid;
  v_valor numeric;
begin
  select *
    into rec
  from public.contas_a_receber
  where id = p_id
    and empresa_id = v_empresa;

  if rec.id is null then
    raise exception '[FINANCEIRO][receber] Conta a receber não encontrada.' using errcode = 'P0001';
  end if;

  if rec.status = 'cancelado' then
    raise exception '[FINANCEIRO][receber] Não é possível receber uma conta cancelada.' using errcode = 'P0001';
  end if;

  if rec.status <> 'pago' then
    update public.contas_a_receber
    set
      status = 'pago',
      data_pagamento = v_data,
      valor_pago = coalesce(p_valor_pago, rec.valor)
    where id = rec.id
      and empresa_id = v_empresa
    returning * into rec;
  end if;

  v_cc_id := coalesce(p_conta_corrente_id, public.financeiro_conta_corrente_escolher('recebimento'));
  v_data := coalesce(rec.data_pagamento, v_data);
  v_valor := coalesce(rec.valor_pago, p_valor_pago, rec.valor);

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
      when rec.descricao is null or btrim(rec.descricao) = '' then 'Recebimento'
      else 'Recebimento: ' || rec.descricao
    end,
    null,
    'conta_a_receber',
    rec.id,
    null,
    null,
    false,
    null
  )
  on conflict (empresa_id, origem_tipo, origem_id)
    where origem_tipo is not null and origem_id is not null
  do nothing;

  perform pg_notify('app_log', '[RPC] financeiro_conta_a_receber_receber_v2 ' || p_id);
  return rec;
end;
$$;

revoke all on function public.financeiro_conta_a_receber_receber_v2(uuid, date, numeric, uuid) from public, anon;
grant execute on function public.financeiro_conta_a_receber_receber_v2(uuid, date, numeric, uuid) to authenticated, service_role;

create or replace function public.financeiro_conta_a_receber_receber(
  p_id uuid,
  p_data_pagamento date default null,
  p_valor_pago numeric default null
)
returns public.contas_a_receber
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return public.financeiro_conta_a_receber_receber_v2(p_id, p_data_pagamento, p_valor_pago, null);
end;
$$;

revoke all on function public.financeiro_conta_a_receber_receber(uuid, date, numeric) from public, anon;
grant execute on function public.financeiro_conta_a_receber_receber(uuid, date, numeric) to authenticated, service_role;

-- =============================================================================
-- Pagar Conta a Pagar (v2 + wrapper compatível)
-- =============================================================================

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
  v_cc_id uuid;
  v_valor numeric;
begin
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

  if rec.status <> 'paga' then
    update public.financeiro_contas_pagar
    set
      status = 'paga',
      data_pagamento = v_data,
      valor_pago = coalesce(p_valor_pago, v_total)
    where id = rec.id
      and empresa_id = v_empresa
    returning * into rec;
  end if;

  v_cc_id := coalesce(p_conta_corrente_id, public.financeiro_conta_corrente_escolher('pagamento'));
  v_data := coalesce(rec.data_pagamento, v_data);
  v_valor := coalesce(rec.valor_pago, p_valor_pago, v_total);

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
  do nothing;

  perform pg_notify('app_log', '[RPC] financeiro_conta_pagar_pagar_v2 ' || p_id);

  return to_jsonb(rec)
    || jsonb_build_object('saldo', (rec.valor_total + rec.multa + rec.juros - rec.desconto) - rec.valor_pago);
end;
$$;

revoke all on function public.financeiro_conta_pagar_pagar_v2(uuid, date, numeric, uuid) from public, anon;
grant execute on function public.financeiro_conta_pagar_pagar_v2(uuid, date, numeric, uuid) to authenticated, service_role;

create or replace function public.financeiro_conta_pagar_pagar(
  p_id uuid,
  p_data_pagamento date default null,
  p_valor_pago numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return public.financeiro_conta_pagar_pagar_v2(p_id, p_data_pagamento, p_valor_pago, null);
end;
$$;

revoke all on function public.financeiro_conta_pagar_pagar(uuid, date, numeric) from public, anon;
grant execute on function public.financeiro_conta_pagar_pagar(uuid, date, numeric) to authenticated, service_role;

commit;
