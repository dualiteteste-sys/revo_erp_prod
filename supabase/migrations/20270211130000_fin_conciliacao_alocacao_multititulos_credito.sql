/*
  Financeiro / Tesouraria — Conciliação “estado da arte”: 1 extrato → N títulos com alocação (parcial por título) + sobra como crédito em conta.

  Motivação
  - Hoje o drawer permite selecionar N títulos, mas exige soma exata e não permite alocar valores por título (ex.: 10x R$109 e depósito R$400).
  - Precisamos suportar:
    - 1 extrato → N títulos (com valores aplicados editáveis)
    - pagamento/recebimento parcial por título
    - sobra virar crédito “em conta” (aplicável depois) com trilha auditável
  - Sempre transacional, idempotente e multi-tenant safe.

  Modelo adotado
  - Partial: o título permanece aberto com saldo (status parcial/aberta/pendente conforme domínio).
  - Sobra: cria “crédito em conta” (tabela própria) + 1 movimentação no caixa (entrada/saída) referente à sobra.
  - A aplicação do crédito em conta a um título é uma operação interna (não cria nova movimentação, pois o caixa já entrou/saiu).
*/

begin;

-- =============================================================================
-- 0) Hardening: vincular_movimentacao com lock + N vínculos por extrato (já existe tabela de vínculos)
-- =============================================================================

create or replace function public.financeiro_extratos_bancarios_vincular_movimentacao(
  p_extrato_id uuid,
  p_movimentacao_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_extrato record;
  v_mov record;
begin
  perform public.require_permission_for_current_user('tesouraria','manage');

  -- lock por extrato: evita corrida por double-click/retry
  perform pg_advisory_xact_lock(hashtextextended(p_extrato_id::text, 0));

  select * into v_extrato
  from public.financeiro_extratos_bancarios e
  where e.id = p_extrato_id
    and e.empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'Extrato não encontrado ou acesso negado.';
  end if;

  select * into v_mov
  from public.financeiro_movimentacoes m
  where m.id = p_movimentacao_id
    and m.empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'Movimentação não encontrada ou acesso negado.';
  end if;

  if v_extrato.conta_corrente_id <> v_mov.conta_corrente_id then
    raise exception 'Conta do extrato difere da conta da movimentação.';
  end if;

  if v_extrato.tipo_lancamento = 'credito' and v_mov.tipo_mov <> 'entrada' then
    raise exception 'Lançamento de crédito só pode ser conciliado com movimentação de entrada.';
  end if;

  if v_extrato.tipo_lancamento = 'debito' and v_mov.tipo_mov <> 'saida' then
    raise exception 'Lançamento de débito só pode ser conciliado com movimentação de saída.';
  end if;

  insert into public.financeiro_extratos_bancarios_movimentacoes (empresa_id, extrato_id, movimentacao_id)
  values (v_empresa, v_extrato.id, v_mov.id)
  on conflict (extrato_id, movimentacao_id) do nothing;

  update public.financeiro_extratos_bancarios
  set movimentacao_id = case when movimentacao_id is null then v_mov.id else movimentacao_id end,
      conciliado = true
  where id = v_extrato.id;

  update public.financeiro_movimentacoes
  set conciliado = true
  where id = v_mov.id;

  perform pg_notify('app_log', '[RPC] financeiro_extratos_bancarios_vincular_movimentacao: extrato=' || p_extrato_id || ' mov=' || p_movimentacao_id);
end;
$$;

revoke all on function public.financeiro_extratos_bancarios_vincular_movimentacao(uuid, uuid) from public, anon;
grant execute on function public.financeiro_extratos_bancarios_vincular_movimentacao(uuid, uuid) to authenticated, service_role;

-- =============================================================================
-- 1) Crédito em conta (on account / unapplied cash)
-- =============================================================================

create table if not exists public.financeiro_creditos_em_conta (
  id               uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null default public.current_empresa_id(),
  pessoa_id         uuid not null,
  tipo              text not null check (tipo in ('receber','pagar')),
  conta_corrente_id uuid not null,
  data_credito      date not null default current_date,
  valor_original    numeric(15,2) not null check (valor_original > 0),
  saldo_aberto      numeric(15,2) not null check (saldo_aberto >= 0),
  extrato_id        uuid,
  movimentacao_id   uuid,
  observacoes       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint fin_cred_empresa_fk foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint fin_cred_pessoa_fk foreign key (pessoa_id) references public.pessoas(id) on delete restrict,
  constraint fin_cred_cc_fk foreign key (conta_corrente_id) references public.financeiro_contas_correntes(id) on delete restrict,
  constraint fin_cred_extrato_fk foreign key (extrato_id) references public.financeiro_extratos_bancarios(id) on delete set null,
  constraint fin_cred_mov_fk foreign key (movimentacao_id) references public.financeiro_movimentacoes(id) on delete set null
);

create index if not exists idx_fin_cred_empresa on public.financeiro_creditos_em_conta (empresa_id);
create index if not exists idx_fin_cred_empresa_pessoa on public.financeiro_creditos_em_conta (empresa_id, pessoa_id);
create index if not exists idx_fin_cred_empresa_tipo on public.financeiro_creditos_em_conta (empresa_id, tipo);
create index if not exists idx_fin_cred_empresa_saldo on public.financeiro_creditos_em_conta (empresa_id, saldo_aberto);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'handle_updated_at_financeiro_creditos_em_conta'
      and tgrelid = 'public.financeiro_creditos_em_conta'::regclass
  ) then
    create trigger handle_updated_at_financeiro_creditos_em_conta
      before update on public.financeiro_creditos_em_conta
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

alter table public.financeiro_creditos_em_conta enable row level security;

drop policy if exists fin_cred_tenant_isolation on public.financeiro_creditos_em_conta;
create policy fin_cred_tenant_isolation
  on public.financeiro_creditos_em_conta
  for all
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

revoke all on table public.financeiro_creditos_em_conta from public, anon, authenticated;
grant all on table public.financeiro_creditos_em_conta to service_role;

create table if not exists public.financeiro_creditos_em_conta_aplicacoes (
  id               uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null default public.current_empresa_id(),
  credito_id        uuid not null,
  destino_tipo      text not null check (destino_tipo in ('conta_a_receber')),
  destino_id        uuid not null,
  data_aplicacao    date not null default current_date,
  valor             numeric(15,2) not null check (valor > 0),
  observacoes       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  estornado_at      timestamptz,
  estornado_por     uuid,
  estorno_motivo    text,
  constraint fin_cred_app_empresa_fk foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint fin_cred_app_cred_fk foreign key (credito_id) references public.financeiro_creditos_em_conta(id) on delete cascade,
  constraint fin_cred_app_dest_cr_fk foreign key (destino_id) references public.contas_a_receber(id) on delete cascade
);

create index if not exists idx_fin_cred_app_empresa on public.financeiro_creditos_em_conta_aplicacoes (empresa_id);
create index if not exists idx_fin_cred_app_empresa_cred on public.financeiro_creditos_em_conta_aplicacoes (empresa_id, credito_id);
create index if not exists idx_fin_cred_app_empresa_dest on public.financeiro_creditos_em_conta_aplicacoes (empresa_id, destino_tipo, destino_id);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'handle_updated_at_financeiro_creditos_em_conta_aplicacoes'
      and tgrelid = 'public.financeiro_creditos_em_conta_aplicacoes'::regclass
  ) then
    create trigger handle_updated_at_financeiro_creditos_em_conta_aplicacoes
      before update on public.financeiro_creditos_em_conta_aplicacoes
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

alter table public.financeiro_creditos_em_conta_aplicacoes enable row level security;

drop policy if exists fin_cred_app_tenant_isolation on public.financeiro_creditos_em_conta_aplicacoes;
create policy fin_cred_app_tenant_isolation
  on public.financeiro_creditos_em_conta_aplicacoes
  for all
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

revoke all on table public.financeiro_creditos_em_conta_aplicacoes from public, anon, authenticated;
grant all on table public.financeiro_creditos_em_conta_aplicacoes to service_role;

-- =============================================================================
-- 2) RPC: aplicar crédito em conta em 1 título (sem movimentação)
-- =============================================================================

create or replace function public.financeiro_credito_em_conta_aplicar_em_conta_a_receber(
  p_credito_id uuid,
  p_titulo_id uuid,
  p_valor numeric,
  p_data date default null,
  p_observacoes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_data date := coalesce(p_data, current_date);
  v_credito record;
  v_titulo record;
  v_total numeric;
  v_saldo_titulo numeric;
  v_inc numeric;
  v_novo_pago numeric;
  v_novo_status public.status_conta_receber;
begin
  perform public.require_permission_for_current_user('contas_a_receber','update');

  if p_valor is null or p_valor <= 0 then
    raise exception 'Informe um valor válido para aplicar.' using errcode='P0001';
  end if;

  select *
  into v_credito
  from public.financeiro_creditos_em_conta c
  where c.id = p_credito_id
    and c.empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'Crédito não encontrado ou acesso negado.' using errcode='P0001';
  end if;

  if v_credito.tipo <> 'receber' then
    raise exception 'Crédito não é do tipo receber.' using errcode='P0001';
  end if;

  if round(coalesce(v_credito.saldo_aberto,0),2) <= 0 then
    raise exception 'Crédito sem saldo disponível.' using errcode='P0001';
  end if;

  select *
  into v_titulo
  from public.contas_a_receber cr
  where cr.id = p_titulo_id
    and cr.empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'Título não encontrado ou acesso negado.' using errcode='P0001';
  end if;

  if v_titulo.cliente_id <> v_credito.pessoa_id then
    raise exception 'Crédito e título pertencem a pessoas diferentes.' using errcode='P0001';
  end if;

  if v_titulo.status = 'cancelado'::public.status_conta_receber then
    raise exception 'Não é possível aplicar crédito em um título cancelado.' using errcode='P0001';
  end if;

  v_total := round(coalesce(v_titulo.valor, 0), 2);
  v_saldo_titulo := round(v_total - coalesce(v_titulo.valor_pago, 0), 2);

  if v_saldo_titulo <= 0 then
    raise exception 'Título já está liquidado.' using errcode='P0001';
  end if;

  v_inc := round(least(p_valor, v_saldo_titulo, v_credito.saldo_aberto), 2);
  if v_inc <= 0 then
    raise exception 'Valor para aplicar é inválido.' using errcode='P0001';
  end if;

  insert into public.financeiro_creditos_em_conta_aplicacoes (
    empresa_id,
    credito_id,
    destino_tipo,
    destino_id,
    data_aplicacao,
    valor,
    observacoes
  ) values (
    v_empresa,
    v_credito.id,
    'conta_a_receber',
    v_titulo.id,
    v_data,
    v_inc,
    p_observacoes
  );

  update public.financeiro_creditos_em_conta
  set saldo_aberto = round(saldo_aberto - v_inc, 2),
      updated_at = now()
  where id = v_credito.id
    and empresa_id = v_empresa;

  v_novo_pago := round(coalesce(v_titulo.valor_pago, 0) + v_inc, 2);
  if v_novo_pago >= v_total then
    v_novo_pago := v_total;
    v_novo_status := 'pago'::public.status_conta_receber;
  else
    v_novo_status := 'parcial'::public.status_conta_receber;
  end if;

  update public.contas_a_receber
  set
    status = v_novo_status,
    data_pagamento = v_data,
    valor_pago = v_novo_pago
  where id = v_titulo.id
    and empresa_id = v_empresa;

  return jsonb_build_object(
    'ok', true,
    'aplicado', v_inc
  );
end;
$$;

revoke all on function public.financeiro_credito_em_conta_aplicar_em_conta_a_receber(uuid, uuid, numeric, date, text) from public, anon;
grant execute on function public.financeiro_credito_em_conta_aplicar_em_conta_a_receber(uuid, uuid, numeric, date, text) to authenticated, service_role;

-- =============================================================================
-- 3) RPC: conciliar extrato com N títulos com valores alocados (parcial por título) + crédito (sobra)
-- =============================================================================

create or replace function public.financeiro_conciliacao_conciliar_extrato_com_titulos_alocados(
  p_extrato_id uuid,
  p_tipo text, -- 'pagar' | 'receber'
  p_alocacoes jsonb,
  p_overpayment_mode text default 'error', -- 'error' | 'credito_em_conta'
  p_overpayment_pessoa_id uuid default null,
  p_observacoes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_extrato record;
  v_dt date;
  v_cc_id uuid;
  v_valor_extrato numeric;
  v_aplicado_total numeric := 0;
  v_diff numeric := 0;
  v_item record;
  v_mov_id uuid;
  v_mov_ids uuid[] := '{}';
  v_res jsonb;
  v_credito_id uuid;
  v_credito_mov_id uuid;
begin
  perform public.require_permission_for_current_user('tesouraria','manage');
  perform public.require_permission_for_current_user('financeiro','update');

  if p_tipo not in ('pagar','receber') then
    raise exception 'p_tipo inválido. Use pagar|receber.' using errcode='P0001';
  end if;

  if p_alocacoes is null or jsonb_typeof(p_alocacoes) <> 'array' or jsonb_array_length(p_alocacoes) = 0 then
    raise exception 'Informe ao menos 1 alocação.' using errcode='P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_extrato_id::text, 0));

  select *
  into v_extrato
  from public.financeiro_extratos_bancarios e
  where e.id = p_extrato_id
    and e.empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'Extrato não encontrado ou acesso negado.' using errcode='P0001';
  end if;

  if coalesce(v_extrato.conciliado,false) is true then
    select array_agg(x.movimentacao_id order by x.created_at asc, x.id asc)
    into v_mov_ids
    from public.financeiro_extratos_bancarios_movimentacoes x
    where x.empresa_id = v_empresa
      and x.extrato_id = v_extrato.id;

    return jsonb_build_object(
      'kind', 'noop',
      'message', 'Extrato já conciliado (idempotente).',
      'movimentacao_ids', coalesce(v_mov_ids, '{}'::uuid[])
    );
  end if;

  if v_extrato.tipo_lancamento = 'debito' and p_tipo <> 'pagar' then
    raise exception 'Extrato (débito) só pode conciliar com título a pagar.' using errcode='P0001';
  end if;
  if v_extrato.tipo_lancamento = 'credito' and p_tipo <> 'receber' then
    raise exception 'Extrato (crédito) só pode conciliar com título a receber.' using errcode='P0001';
  end if;

  v_dt := v_extrato.data_lancamento;
  v_cc_id := v_extrato.conta_corrente_id;
  v_valor_extrato := round(coalesce(v_extrato.valor,0), 2);

  if v_valor_extrato <= 0 then
    raise exception 'Valor do extrato inválido.' using errcode='P0001';
  end if;

  if (
    select count(*) from (
      select (x->>'titulo_id')::uuid as titulo_id
      from jsonb_array_elements(p_alocacoes) x
    ) s
  ) <> (
    select count(distinct titulo_id) from (
      select (x->>'titulo_id')::uuid as titulo_id
      from jsonb_array_elements(p_alocacoes) x
    ) d
  ) then
    raise exception 'Alocações duplicadas para o mesmo título.' using errcode='P0001';
  end if;

  for v_item in
    select
      (x->>'titulo_id')::uuid as titulo_id,
      round((x->>'valor')::numeric, 2) as valor
    from jsonb_array_elements(p_alocacoes) x
    order by (x->>'titulo_id')
  loop
    if v_item.titulo_id is null then
      raise exception 'Alocação inválida: título_id ausente.' using errcode='P0001';
    end if;
    if v_item.valor is null or v_item.valor <= 0 then
      raise exception 'Alocação inválida: valor aplicado deve ser > 0.' using errcode='P0001';
    end if;

    if p_tipo = 'pagar' then
      select public.financeiro_conta_pagar_pagar_v2(v_item.titulo_id, v_dt, v_item.valor, v_cc_id) into v_res;
      v_mov_id := nullif(v_res->>'movimentacao_id','')::uuid;
      if v_mov_id is null then
        raise exception 'Falha ao registrar pagamento para conciliação.' using errcode='P0001';
      end if;
    else
      perform public.financeiro_conta_a_receber_receber_v2(v_item.titulo_id, v_dt, v_item.valor, v_cc_id);

      select m.id
        into v_mov_id
      from public.financeiro_movimentacoes m
      join public.financeiro_contas_a_receber_recebimentos r
        on r.id = m.origem_id
       and m.origem_tipo = 'conta_a_receber_recebimento'
      where r.empresa_id = v_empresa
        and r.conta_a_receber_id = v_item.titulo_id
        and r.data_recebimento = v_dt
        and r.valor = v_item.valor
        and r.conta_corrente_id = v_cc_id
        and r.estornado_at is null
      order by r.created_at desc, m.created_at desc, m.id desc
      limit 1;

      if v_mov_id is null then
        raise exception 'Falha ao localizar movimentação do recebimento para conciliação.' using errcode='P0001';
      end if;
    end if;

    v_aplicado_total := round(v_aplicado_total + v_item.valor, 2);
    if v_aplicado_total - v_valor_extrato > 0.01 then
      raise exception 'Total aplicado (R$ %) maior que o valor do extrato (R$ %).', v_aplicado_total, v_valor_extrato using errcode='P0001';
    end if;

    perform public.financeiro_extratos_bancarios_vincular_movimentacao(p_extrato_id, v_mov_id);
    v_mov_ids := array_append(v_mov_ids, v_mov_id);
  end loop;

  v_diff := round(v_valor_extrato - v_aplicado_total, 2);

  if v_diff > 0.01 then
    if p_overpayment_mode <> 'credito_em_conta' then
      raise exception 'Sobra de R$ % detectada. Selecione “Criar crédito em conta” ou ajuste as alocações.', v_diff using errcode='P0001';
    end if;
    if p_overpayment_pessoa_id is null then
      raise exception 'Informe a pessoa (cliente/fornecedor) para criar o crédito em conta.' using errcode='P0001';
    end if;

    v_credito_id := gen_random_uuid();
    insert into public.financeiro_creditos_em_conta (
      id,
      empresa_id,
      pessoa_id,
      tipo,
      conta_corrente_id,
      data_credito,
      valor_original,
      saldo_aberto,
      extrato_id,
      observacoes
    ) values (
      v_credito_id,
      v_empresa,
      p_overpayment_pessoa_id,
      p_tipo,
      v_cc_id,
      v_dt,
      v_diff,
      v_diff,
      v_extrato.id,
      coalesce(p_observacoes, 'Crédito gerado na conciliação bancária (sobra do extrato).')
    );

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
      conciliado,
      observacoes
    ) values (
      v_empresa,
      v_cc_id,
      v_dt,
      v_dt,
      case when p_tipo = 'receber' then 'entrada' else 'saida' end,
      v_diff,
      'Crédito em conta (sobra)',
      v_extrato.documento_ref,
      'credito_em_conta',
      v_credito_id,
      false,
      'Gerado automaticamente pela conciliação bancária (sobra).'
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
      updated_at = now()
    returning id into v_credito_mov_id;

    update public.financeiro_creditos_em_conta
    set movimentacao_id = v_credito_mov_id,
        updated_at = now()
    where id = v_credito_id
      and empresa_id = v_empresa;

    perform public.financeiro_extratos_bancarios_vincular_movimentacao(p_extrato_id, v_credito_mov_id);
    v_mov_ids := array_append(v_mov_ids, v_credito_mov_id);
  end if;

  return jsonb_build_object(
    'kind', 'ok',
    'extrato_valor', v_valor_extrato,
    'aplicado_total', v_aplicado_total,
    'diferenca', v_diff,
    'movimentacao_ids', v_mov_ids,
    'credito_id', v_credito_id
  );
end;
$$;

revoke all on function public.financeiro_conciliacao_conciliar_extrato_com_titulos_alocados(uuid, text, jsonb, text, uuid, text) from public, anon;
grant execute on function public.financeiro_conciliacao_conciliar_extrato_com_titulos_alocados(uuid, text, jsonb, text, uuid, text) to authenticated, service_role;

-- =============================================================================
-- 4) RPCs de busca/sugestão: incluir pessoa_id para permitir crédito em conta com vínculo auditável
-- =============================================================================

create or replace function public.financeiro_conciliacao_titulos_sugerir(
  p_extrato_id uuid,
  p_limit int default 10
)
returns table (
  tipo text, -- 'pagar' | 'receber'
  titulo_id uuid,
  pessoa_id uuid,
  pessoa_nome text,
  descricao text,
  documento_ref text,
  data_vencimento date,
  valor_total numeric,
  valor_pago numeric,
  saldo_aberto numeric,
  status text,
  score int
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_extrato record;
  v_dt date;
  v_valor numeric;
  v_tipo text;
  v_start date;
  v_end date;
begin
  perform public.require_permission_for_current_user('tesouraria', 'view');
  perform public.require_permission_for_current_user('financeiro', 'view');

  select *
    into v_extrato
  from public.financeiro_extratos_bancarios e
  where e.id = p_extrato_id
    and e.empresa_id = v_empresa;

  if not found then
    raise exception 'Extrato não encontrado ou acesso negado.' using errcode = 'P0001';
  end if;

  v_dt := v_extrato.data_lancamento;
  v_valor := v_extrato.valor;
  v_tipo := v_extrato.tipo_lancamento;
  v_start := (v_dt - interval '5 days')::date;
  v_end := (v_dt + interval '5 days')::date;

  if v_tipo = 'debito' then
    return query
    with base as (
      select
        'pagar'::text as tipo,
        cp.id as titulo_id,
        cp.fornecedor_id as pessoa_id,
        coalesce(p.nome, '—') as pessoa_nome,
        cp.descricao,
        cp.documento_ref,
        cp.data_vencimento,
        (cp.valor_total + cp.multa + cp.juros - cp.desconto) as valor_total,
        coalesce(cp.valor_pago, 0) as valor_pago,
        ((cp.valor_total + cp.multa + cp.juros - cp.desconto) - coalesce(cp.valor_pago, 0)) as saldo_aberto,
        cp.status::text as status,
        (
          60
          +
          (case
             when cp.data_vencimento = v_dt then 20
             when abs((cp.data_vencimento - v_dt)) = 1 then 16
             when abs((cp.data_vencimento - v_dt)) = 2 then 12
             when abs((cp.data_vencimento - v_dt)) = 3 then 8
             when abs((cp.data_vencimento - v_dt)) = 4 then 4
             else 0
           end)
          +
          (case
             when v_extrato.documento_ref is not null
              and cp.documento_ref is not null
              and btrim(v_extrato.documento_ref) <> ''
              and cp.documento_ref = v_extrato.documento_ref then 5
             else 0
           end)
          +
          (case
             when p.nome is not null
              and btrim(p.nome) <> ''
              and position(lower(p.nome) in lower(v_extrato.descricao)) > 0 then 5
             else 0
           end)
        )::int as score
      from public.financeiro_contas_pagar cp
      left join public.pessoas p on p.id = cp.fornecedor_id
      where cp.empresa_id = v_empresa
        and cp.status in ('aberta','parcial')
        and cp.data_vencimento between v_start and v_end
        and ((cp.valor_total + cp.multa + cp.juros - cp.desconto) - coalesce(cp.valor_pago, 0)) > 0
        and abs(((cp.valor_total + cp.multa + cp.juros - cp.desconto) - coalesce(cp.valor_pago, 0)) - v_valor) <= 0.01
    )
    select *
    from base
    order by score desc, data_vencimento asc
    limit greatest(1, p_limit);
  else
    return query
    with base as (
      select
        'receber'::text as tipo,
        cr.id as titulo_id,
        cr.cliente_id as pessoa_id,
        coalesce(p.nome, '—') as pessoa_nome,
        cr.descricao,
        null::text as documento_ref,
        cr.data_vencimento,
        cr.valor as valor_total,
        coalesce(cr.valor_pago, 0) as valor_pago,
        (cr.valor - coalesce(cr.valor_pago, 0)) as saldo_aberto,
        cr.status::text as status,
        (
          60
          +
          (case
             when cr.data_vencimento = v_dt then 20
             when abs((cr.data_vencimento - v_dt)) = 1 then 16
             when abs((cr.data_vencimento - v_dt)) = 2 then 12
             when abs((cr.data_vencimento - v_dt)) = 3 then 8
             when abs((cr.data_vencimento - v_dt)) = 4 then 4
             else 0
           end)
          +
          (case
             when p.nome is not null
              and btrim(p.nome) <> ''
              and position(lower(p.nome) in lower(v_extrato.descricao)) > 0 then 10
             else 0
           end)
        )::int as score
      from public.contas_a_receber cr
      left join public.pessoas p on p.id = cr.cliente_id
      where cr.empresa_id = v_empresa
        and cr.status in ('pendente','vencido','parcial')
        and cr.data_vencimento between v_start and v_end
        and (cr.valor - coalesce(cr.valor_pago, 0)) > 0
        and abs((cr.valor - coalesce(cr.valor_pago, 0)) - v_valor) <= 0.01
    )
    select *
    from base
    order by score desc, data_vencimento asc
    limit greatest(1, p_limit);
  end if;
end;
$$;

revoke all on function public.financeiro_conciliacao_titulos_sugerir(uuid, int) from public, anon;
grant execute on function public.financeiro_conciliacao_titulos_sugerir(uuid, int) to authenticated, service_role;

create or replace function public.financeiro_conciliacao_titulos_search(
  p_tipo text, -- 'pagar' | 'receber'
  p_valor numeric default null,
  p_start_date date default null,
  p_end_date date default null,
  p_q text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  tipo text,
  titulo_id uuid,
  pessoa_id uuid,
  pessoa_nome text,
  descricao text,
  documento_ref text,
  data_vencimento date,
  valor_total numeric,
  valor_pago numeric,
  saldo_aberto numeric,
  status text,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_lim int := greatest(1, least(200, coalesce(p_limit, 50)));
  v_off int := greatest(0, coalesce(p_offset, 0));
begin
  perform public.require_permission_for_current_user('tesouraria', 'view');
  perform public.require_permission_for_current_user('financeiro', 'view');

  if p_tipo not in ('pagar','receber') then
    raise exception 'p_tipo inválido. Use pagar|receber.' using errcode = 'P0001';
  end if;

  if p_tipo = 'pagar' then
    return query
    with base as (
      select
        'pagar'::text as tipo,
        cp.id as titulo_id,
        cp.fornecedor_id as pessoa_id,
        coalesce(p.nome, '—') as pessoa_nome,
        cp.descricao,
        cp.documento_ref,
        cp.data_vencimento,
        (cp.valor_total + cp.multa + cp.juros - cp.desconto) as valor_total,
        coalesce(cp.valor_pago, 0) as valor_pago,
        ((cp.valor_total + cp.multa + cp.juros - cp.desconto) - coalesce(cp.valor_pago, 0)) as saldo_aberto,
        cp.status::text as status
      from public.financeiro_contas_pagar cp
      left join public.pessoas p on p.id = cp.fornecedor_id
      where cp.empresa_id = v_empresa
        and cp.status in ('aberta','parcial')
        and (p_start_date is null or cp.data_vencimento >= p_start_date)
        and (p_end_date is null or cp.data_vencimento <= p_end_date)
        and (p_q is null or (
          cp.descricao ilike '%'||p_q||'%' or
          coalesce(cp.documento_ref,'') ilike '%'||p_q||'%' or
          coalesce(p.nome,'') ilike '%'||p_q||'%'
        ))
        and (p_valor is null or abs(((cp.valor_total + cp.multa + cp.juros - cp.desconto) - coalesce(cp.valor_pago, 0)) - p_valor) <= greatest(1.00, p_valor * 0.05))
    ), counted as (
      select *, count(*) over() as total_count
      from base
    )
    select *
    from counted
    order by data_vencimento asc, saldo_aberto asc, pessoa_nome asc
    limit v_lim offset v_off;
  else
    return query
    with base as (
      select
        'receber'::text as tipo,
        cr.id as titulo_id,
        cr.cliente_id as pessoa_id,
        coalesce(p.nome, '—') as pessoa_nome,
        cr.descricao,
        null::text as documento_ref,
        cr.data_vencimento,
        cr.valor as valor_total,
        coalesce(cr.valor_pago, 0) as valor_pago,
        (cr.valor - coalesce(cr.valor_pago, 0)) as saldo_aberto,
        cr.status::text as status
      from public.contas_a_receber cr
      left join public.pessoas p on p.id = cr.cliente_id
      where cr.empresa_id = v_empresa
        and cr.status in ('pendente','vencido','parcial')
        and (p_start_date is null or cr.data_vencimento >= p_start_date)
        and (p_end_date is null or cr.data_vencimento <= p_end_date)
        and (p_q is null or (
          cr.descricao ilike '%'||p_q||'%' or
          coalesce(p.nome,'') ilike '%'||p_q||'%'
        ))
        and (p_valor is null or abs((cr.valor - coalesce(cr.valor_pago, 0)) - p_valor) <= greatest(1.00, p_valor * 0.05))
    ), counted as (
      select *, count(*) over() as total_count
      from base
    )
    select *
    from counted
    order by data_vencimento asc, saldo_aberto asc, pessoa_nome asc
    limit v_lim offset v_off;
  end if;
end;
$$;

revoke all on function public.financeiro_conciliacao_titulos_search(text, numeric, date, date, text, int, int) from public, anon;
grant execute on function public.financeiro_conciliacao_titulos_search(text, numeric, date, date, text, int, int) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

