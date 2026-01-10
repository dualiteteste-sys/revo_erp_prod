-- ============================================================================
-- Serviços / Contratos (MVP2): Worker admin (DEV/OPS) para gerar agenda + títulos
-- ============================================================================
--
-- Objetivo:
-- - Permitir execução via GitHub Actions (psql com SUPABASE_DB_URL_DEV)
-- - Rodar de forma idempotente:
--   1) garantir regra + agenda (schedule) para contratos ativos
--   2) materializar contas a receber + cobranças a partir do schedule vencido
--
-- Observação:
-- - Essas funções NÃO dependem de current_empresa_id() (processam múltiplas empresas).
-- - Não expõe para authenticated; uso principal é operacional (admin/worker).

create or replace function public.servicos_contratos_billing_generate_schedule_admin(
  p_contrato_id uuid,
  p_months_ahead int default 12
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_rule public.servicos_contratos_billing_rules;
  v_contrato public.servicos_contratos;
  v_empresa uuid;
  v_start date;
  v_i int;
  v_comp date;
  v_due date;
  v_inserted int := 0;
begin
  if p_months_ahead is null or p_months_ahead < 1 or p_months_ahead > 36 then
    raise exception 'months_ahead inválido (1..36).';
  end if;

  select * into v_contrato
  from public.servicos_contratos c
  where c.id = p_contrato_id;

  if not found then
    raise exception 'Contrato não encontrado.' using errcode='P0002';
  end if;

  v_empresa := v_contrato.empresa_id;

  select * into v_rule
  from public.servicos_contratos_billing_rules r
  where r.empresa_id = v_empresa
    and r.contrato_id = p_contrato_id;

  if not found then
    insert into public.servicos_contratos_billing_rules (
      empresa_id,
      contrato_id,
      tipo,
      ativo,
      valor_mensal,
      dia_vencimento,
      primeira_competencia,
      centro_de_custo_id
    )
    values (
      v_empresa,
      p_contrato_id,
      'mensal',
      (v_contrato.status = 'ativo'),
      coalesce(v_contrato.valor_mensal, 0),
      5,
      date_trunc('month', coalesce(v_contrato.data_inicio, current_date))::date,
      null
    )
    returning * into v_rule;
  end if;

  v_start := coalesce(v_rule.primeira_competencia, date_trunc('month', coalesce(v_contrato.data_inicio, current_date))::date);
  v_start := date_trunc('month', v_start)::date;

  if v_rule.tipo = 'mensal' then
    for v_i in 0..(p_months_ahead - 1) loop
      v_comp := (v_start + (v_i || ' months')::interval)::date;
      v_comp := date_trunc('month', v_comp)::date;
      v_due := (date_trunc('month', v_comp)::date + ((v_rule.dia_vencimento - 1) || ' days')::interval)::date;

      insert into public.servicos_contratos_billing_schedule (
        empresa_id,
        contrato_id,
        rule_id,
        kind,
        competencia,
        data_vencimento,
        valor,
        status
      )
      values (
        v_empresa,
        p_contrato_id,
        v_rule.id,
        'mensal',
        v_comp,
        v_due,
        coalesce(v_rule.valor_mensal, 0),
        'previsto'
      )
      on conflict do nothing;

      if found then
        v_inserted := v_inserted + 1;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'tipo', v_rule.tipo,
    'months_ahead', p_months_ahead
  );
end;
$$;

revoke all on function public.servicos_contratos_billing_generate_schedule_admin(uuid, int) from public, anon;
grant execute on function public.servicos_contratos_billing_generate_schedule_admin(uuid, int) to service_role;


create or replace function public.servicos_contratos_billing_worker_tick_admin(
  p_contracts_limit int default 200,
  p_months_ahead int default 12,
  p_receivables_limit int default 500,
  p_until date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_contract public.servicos_contratos;
  v_row record;
  v_json jsonb;
  v_schedule_contracts int := 0;
  v_schedule_inserted int := 0;
  v_receivables_created int := 0;
  v_skipped_no_cliente int := 0;
  v_receber_id uuid;
  v_cobranca_id uuid;
begin
  if p_contracts_limit is null or p_contracts_limit < 0 or p_contracts_limit > 5000 then
    raise exception 'contracts_limit inválido (0..5000).';
  end if;
  if p_receivables_limit is null or p_receivables_limit < 0 or p_receivables_limit > 5000 then
    raise exception 'receivables_limit inválido (0..5000).';
  end if;

  -- 1) Agenda: garante regra + schedule para contratos ativos
  for v_contract in
    select *
    from public.servicos_contratos c
    where c.status = 'ativo'
    order by c.created_at desc
    limit p_contracts_limit
  loop
    v_json := public.servicos_contratos_billing_generate_schedule_admin(v_contract.id, p_months_ahead);
    v_schedule_contracts := v_schedule_contracts + 1;
    v_schedule_inserted := v_schedule_inserted + coalesce((v_json->>'inserted')::int, 0);
  end loop;

  -- 2) Materialização: gera contas a receber + cobrança para schedule vencido (idempotente)
  for v_row in
    select
      s.id as schedule_id,
      s.empresa_id,
      s.contrato_id,
      s.data_vencimento,
      s.competencia,
      s.valor,
      s.rule_id,
      c.numero as contrato_numero,
      c.descricao as contrato_descricao,
      c.cliente_id,
      r.centro_de_custo_id
    from public.servicos_contratos_billing_schedule s
    join public.servicos_contratos c on c.id = s.contrato_id
    join public.servicos_contratos_billing_rules r on r.id = s.rule_id
    where s.status = 'previsto'
      and s.conta_a_receber_id is null
      and s.data_vencimento <= coalesce(p_until, current_date)
      and c.status = 'ativo'
    order by s.data_vencimento asc
    limit p_receivables_limit
    for update of s skip locked
  loop
    if v_row.cliente_id is null then
      v_skipped_no_cliente := v_skipped_no_cliente + 1;
      continue;
    end if;

    v_receber_id := null;
    insert into public.contas_a_receber (
      empresa_id,
      cliente_id,
      descricao,
      valor,
      data_vencimento,
      status,
      origem_tipo,
      origem_id,
      centro_de_custo_id,
      observacoes
    )
    values (
      v_row.empresa_id,
      v_row.cliente_id,
      format(
        'Contrato %s - %s (%s)',
        coalesce(v_row.contrato_numero, '(s/n)'),
        left(coalesce(v_row.contrato_descricao, ''), 80),
        to_char(coalesce(v_row.competencia, v_row.data_vencimento), 'YYYY-MM')
      ),
      coalesce(v_row.valor, 0),
      v_row.data_vencimento,
      'pendente'::public.status_conta_receber,
      'SERVICO_CONTRATO_SCHEDULE',
      v_row.schedule_id,
      v_row.centro_de_custo_id,
      'Gerado automaticamente a partir de contrato de serviços.'
    )
    on conflict do nothing
    returning id into v_receber_id;

    if v_receber_id is null then
      select c.id into v_receber_id
      from public.contas_a_receber c
      where c.empresa_id = v_row.empresa_id
        and c.origem_tipo = 'SERVICO_CONTRATO_SCHEDULE'
        and c.origem_id = v_row.schedule_id
      limit 1;
    end if;

    if v_receber_id is null then
      raise exception '[SVC][CONTRATOS][BILLING][WORKER] Falha ao resolver conta_a_receber_id (schedule=%)', v_row.schedule_id;
    end if;

    select sc.id into v_cobranca_id
    from public.servicos_cobrancas sc
    where sc.empresa_id = v_row.empresa_id
      and sc.conta_a_receber_id = v_receber_id
    limit 1;

    if v_cobranca_id is null then
      insert into public.servicos_cobrancas (
        empresa_id,
        nota_id,
        cliente_id,
        data_vencimento,
        valor,
        status,
        conta_a_receber_id
      )
      values (
        v_row.empresa_id,
        null,
        v_row.cliente_id,
        v_row.data_vencimento,
        coalesce(v_row.valor, 0),
        'pendente',
        v_receber_id
      )
      returning id into v_cobranca_id;
    end if;

    update public.servicos_contratos_billing_schedule s
    set
      status = 'gerado',
      conta_a_receber_id = v_receber_id,
      cobranca_id = v_cobranca_id
    where s.id = v_row.schedule_id;

    v_receivables_created := v_receivables_created + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'schedule_contracts', v_schedule_contracts,
    'schedule_inserted', v_schedule_inserted,
    'receivables_created', v_receivables_created,
    'skipped_no_cliente', v_skipped_no_cliente,
    'until', coalesce(p_until, current_date)
  );
end;
$$;

revoke all on function public.servicos_contratos_billing_worker_tick_admin(int, int, int, date) from public, anon;
grant execute on function public.servicos_contratos_billing_worker_tick_admin(int, int, int, date) to service_role;

