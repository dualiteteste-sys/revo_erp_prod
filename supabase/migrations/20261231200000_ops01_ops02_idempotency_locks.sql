/*
  OPS-01 / OPS-02: Idempotência + locks (mínimo seguro)

  Objetivo:
  - Evitar efeitos colaterais duplicados por double-click / retries de rede.
  - Garantir que ações críticas sejam:
    - idempotentes (repetir não duplica resultado)
    - protegidas contra concorrência (lock por entidade)

  Escopo (MVP):
  - Tesouraria: importação de extrato (dedupe por hash), conciliação idempotente.
  - OS: transição de status e agendamento idempotentes + lock por O.S.
  - Vendas: concluir pedido idempotente + lock por pedido.
*/

begin;

-- =============================================================================
-- FIN-03 / OPS-01: Extrato bancário (dedupe por hash)
-- =============================================================================

create unique index if not exists idx_fin_extrato_empresa_cc_hash_uniq
  on public.financeiro_extratos_bancarios (empresa_id, conta_corrente_id, hash_importacao)
  where hash_importacao is not null and btrim(hash_importacao) <> '';

create or replace function public.financeiro_extratos_bancarios_importar(
  p_conta_corrente_id uuid,
  p_itens jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_item jsonb;
  v_count integer := 0;
  v_data date;
  v_desc text;
  v_doc text;
  v_tipo text;
  v_valor numeric;
  v_saldo numeric;
  v_id_banco text;
  v_hash text;
  v_linha text;
begin
  if jsonb_typeof(p_itens) <> 'array' then
    raise exception 'p_itens deve ser um array JSON.';
  end if;

  if not exists (
    select 1 from public.financeiro_contas_correntes cc
    where cc.id = p_conta_corrente_id
      and cc.empresa_id = v_empresa
  ) then
    raise exception 'Conta corrente não encontrada ou acesso negado.';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_data     := (v_item->>'data_lancamento')::date;
    v_desc     := v_item->>'descricao';
    v_doc      := v_item->>'documento_ref';
    v_tipo     := coalesce(v_item->>'tipo_lancamento', 'credito');
    v_valor    := (v_item->>'valor')::numeric;
    v_saldo    := (v_item->>'saldo_apos_lancamento')::numeric;
    v_id_banco := v_item->>'identificador_banco';
    v_hash     := v_item->>'hash_importacao';
    v_linha    := v_item->>'linha_bruta';

    if v_data is null or v_valor is null or v_valor <= 0 then
      continue;
    end if;

    if v_tipo not in ('credito','debito') then
      v_tipo := 'credito';
    end if;

    -- Se o frontend não enviar hash, gera um determinístico para dedupe.
    if v_hash is null or btrim(v_hash) = '' then
      v_hash := md5(
        coalesce(v_data::text,'') || '|' ||
        coalesce(v_desc,'') || '|' ||
        coalesce(v_tipo,'') || '|' ||
        coalesce(v_valor::text,'') || '|' ||
        coalesce(v_doc,'') || '|' ||
        coalesce(v_id_banco,'')
      );
    end if;

    insert into public.financeiro_extratos_bancarios (
      empresa_id, conta_corrente_id, data_lancamento, descricao, identificador_banco, documento_ref,
      tipo_lancamento, valor, saldo_apos_lancamento, origem_importacao, hash_importacao, linha_bruta, conciliado
    ) values (
      v_empresa,
      p_conta_corrente_id,
      v_data,
      v_desc,
      v_id_banco,
      v_doc,
      v_tipo,
      v_valor,
      v_saldo,
      'upload_json',
      v_hash,
      v_linha,
      false
    )
    on conflict (empresa_id, conta_corrente_id, hash_importacao)
      where hash_importacao is not null and btrim(hash_importacao) <> ''
    do nothing;

    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  perform pg_notify('app_log', '[RPC] financeiro_extratos_bancarios_importar: conta=' || p_conta_corrente_id || ' qtd=' || v_count);
  return v_count;
end;
$$;

-- =============================================================================
-- FIN-03 / OPS-01: Conciliação idempotente
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
  -- lock por extrato para evitar corrida por double-click/retry
  perform pg_advisory_xact_lock(hashtextextended(p_extrato_id::text, 0));

  select * into v_extrato
  from public.financeiro_extratos_bancarios e
  where e.id = p_extrato_id
    and e.empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'Extrato não encontrado ou acesso negado.';
  end if;

  if v_extrato.conciliado is true and v_extrato.movimentacao_id = p_movimentacao_id then
    return; -- idempotente
  end if;

  if v_extrato.conciliado is true and v_extrato.movimentacao_id is not null and v_extrato.movimentacao_id <> p_movimentacao_id then
    raise exception 'Extrato já conciliado com outra movimentação.';
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

  update public.financeiro_extratos_bancarios
  set movimentacao_id = v_mov.id,
      conciliado = true
  where id = v_extrato.id;

  update public.financeiro_movimentacoes
  set conciliado = true
  where id = v_mov.id;

  perform pg_notify('app_log', '[RPC] financeiro_extratos_bancarios_vincular_movimentacao: extrato=' || p_extrato_id || ' mov=' || p_movimentacao_id);
end;
$$;

-- =============================================================================
-- OS-01 / OPS-01: Status e agenda idempotentes + lock por OS
-- =============================================================================

create or replace function public.os_set_status_for_current_user__unsafe(
  p_os_id uuid,
  p_next public.status_os,
  p_opts jsonb default '{}'::jsonb
)
returns public.ordem_servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_force boolean := coalesce((p_opts->>'force')::boolean, false);
  v_os public.ordem_servicos;
begin
  if v_emp is null then
    raise exception '[RPC][OS][STATUS] empresa_id inválido' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_os_id::text, 0));

  select * into v_os
  from public.ordem_servicos
  where id = p_os_id and empresa_id = v_emp
  for update;

  if not found then
    raise exception '[RPC][OS][STATUS] OS não encontrada na empresa atual' using errcode='P0002';
  end if;

  if v_os.status = p_next then
    return v_os; -- idempotente (não mexe em updated_at)
  end if;

  if not v_force then
    if v_os.status = 'cancelada'::public.status_os and p_next <> 'cancelada'::public.status_os then
      raise exception '[RPC][OS][STATUS] OS cancelada não pode ser reaberta sem force' using errcode='42501';
    end if;
  end if;

  update public.ordem_servicos os
     set status = p_next,
         data_conclusao = case when p_next in ('concluida'::public.status_os, 'cancelada'::public.status_os) then now()::date else null end,
         updated_at = now()
   where os.id = p_os_id
     and os.empresa_id = v_emp
  returning * into v_os;

  return v_os;
end;
$$;

create or replace function public.update_os_data_prevista__unsafe(p_os_id uuid, p_new_date date)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_current date;
begin
  if v_empresa_id is null then
    raise exception '[RPC][OS][DATA_PREVISTA] Nenhuma empresa ativa encontrada' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_os_id::text, 0));

  select os.data_prevista
    into v_current
  from public.ordem_servicos os
  where os.id = p_os_id
    and os.empresa_id = v_empresa_id
  for update;

  if not found then
    raise exception '[RPC][OS][DATA_PREVISTA] OS não encontrada na empresa atual' using errcode='P0002';
  end if;

  if v_current is not distinct from p_new_date then
    return; -- idempotente
  end if;

  update public.ordem_servicos os
     set data_prevista = p_new_date,
         updated_at = now()
   where os.id = p_os_id
     and os.empresa_id = v_empresa_id;
end;
$$;

-- =============================================================================
-- OPS-01: Vendas concluir pedido idempotente + lock por pedido
-- =============================================================================

create or replace function public.vendas_concluir_pedido(p_id uuid, p_baixar_estoque boolean default true)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_row public.vendas_pedidos%rowtype;
begin
  perform public.require_permission_for_current_user('vendas', 'update');

  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));

  select *
    into v_row
    from public.vendas_pedidos
   where id = p_id
     and empresa_id = v_emp
   for update;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  if v_row.status = 'cancelado' then
    raise exception 'Pedido cancelado não pode ser concluído';
  end if;

  -- Idempotência por estado: se já está concluído, só garante baixa de estoque (que também é idempotente)
  if v_row.status = 'concluido' then
    if p_baixar_estoque then
      perform public.vendas_baixar_estoque(p_id, 'VENDA-' || v_row.numero::text);
    end if;
    return;
  end if;

  update public.vendas_pedidos
     set status = 'concluido',
         updated_at = now()
   where id = p_id
     and empresa_id = v_emp;

  if p_baixar_estoque then
    perform public.vendas_baixar_estoque(p_id, 'VENDA-' || v_row.numero::text);
  end if;
end;
$$;

commit;

notify pgrst, 'reload schema';

