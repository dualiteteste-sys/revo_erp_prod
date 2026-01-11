-- ============================================================================
-- FIX: Contratos / Billing — ensure_rule assignment (composite -> record)
-- ============================================================================
--
-- Bug:
--   Em PL/pgSQL, `SELECT func() INTO v_composite;` com select-list de 1 coluna
--   tenta atribuir a coluna ao *primeiro campo* do composite.
--   Como func() retorna um registro "(...)" do tipo servicos_contratos_billing_rules,
--   isso causava cast para uuid no campo `id` e erro:
--     invalid input syntax for type uuid: "(...)"
--
-- Correção:
--   Atribuir corretamente o retorno composite:
--     v_rule := public.servicos_contratos_billing_ensure_rule(p_contrato_id);
--

begin;

-- Reabre (previsto) linhas canceladas sem título quando regenerar schedule
create or replace function public.servicos_contratos_billing_generate_schedule(
  p_contrato_id uuid,
  p_months_ahead int default 12
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_rule public.servicos_contratos_billing_rules;
  v_contrato public.servicos_contratos;
  v_start date;
  v_i int;
  v_comp date;
  v_due date;
  v_inserted int := 0;
  v_reopened int := 0;
  v_was_insert boolean;
begin
  perform public.require_permission_for_current_user('servicos','update');

  if v_empresa is null then
    raise exception '[SVC][CONTRATOS][BILLING] empresa_id inválido' using errcode='42501';
  end if;

  if p_months_ahead is null or p_months_ahead < 1 or p_months_ahead > 36 then
    raise exception 'months_ahead inválido (1..36).';
  end if;

  select * into v_contrato
  from public.servicos_contratos c
  where c.id = p_contrato_id
    and c.empresa_id = v_empresa;

  if not found then
    raise exception 'Contrato não encontrado ou acesso negado.' using errcode='P0002';
  end if;

  -- IMPORTANT: ensure_rule retorna um composite; atribua via := (não SELECT INTO).
  v_rule := public.servicos_contratos_billing_ensure_rule(p_contrato_id);
  v_start := coalesce(v_rule.primeira_competencia, date_trunc('month', coalesce(v_contrato.data_inicio, current_date))::date);
  v_start := date_trunc('month', v_start)::date;

  if v_rule.tipo = 'mensal' then
    for v_i in 0..(p_months_ahead - 1) loop
      v_comp := (v_start + (v_i || ' months')::interval)::date;
      v_comp := date_trunc('month', v_comp)::date;
      v_due := (date_trunc('month', v_comp)::date + ((v_rule.dia_vencimento - 1) || ' days')::interval)::date;

      v_was_insert := null;
      begin
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
        on conflict (empresa_id, contrato_id, kind, competencia)
        do update
          set
            rule_id = excluded.rule_id,
            data_vencimento = excluded.data_vencimento,
            valor = excluded.valor,
            status = 'previsto',
            updated_at = now()
        where public.servicos_contratos_billing_schedule.status = 'cancelado'
          and public.servicos_contratos_billing_schedule.conta_a_receber_id is null
        returning (xmax = 0) into v_was_insert;
      exception
        when unique_violation then
          v_was_insert := null;
      end;

      if v_was_insert is true then
        v_inserted := v_inserted + 1;
      elsif v_was_insert is false then
        v_reopened := v_reopened + 1;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'reopened', v_reopened,
    'tipo', v_rule.tipo,
    'months_ahead', p_months_ahead
  );
end;
$$;

revoke all on function public.servicos_contratos_billing_generate_schedule(uuid, int) from public, anon;
grant execute on function public.servicos_contratos_billing_generate_schedule(uuid, int) to authenticated, service_role;


create or replace function public.servicos_contratos_billing_add_avulso(
  p_contrato_id uuid,
  p_data_vencimento date,
  p_valor numeric,
  p_descricao text default null
)
returns public.servicos_contratos_billing_schedule
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_contrato public.servicos_contratos;
  v_rule public.servicos_contratos_billing_rules;
  v_row public.servicos_contratos_billing_schedule;
begin
  perform public.require_permission_for_current_user('servicos','update');

  if v_empresa is null then
    raise exception '[SVC][CONTRATOS][BILLING] empresa_id inválido' using errcode='42501';
  end if;
  if p_data_vencimento is null then
    raise exception 'data_vencimento é obrigatório.';
  end if;
  if p_valor is null or p_valor < 0 then
    raise exception 'valor inválido.';
  end if;

  select * into v_contrato
  from public.servicos_contratos c
  where c.id = p_contrato_id
    and c.empresa_id = v_empresa;

  if not found then
    raise exception 'Contrato não encontrado ou acesso negado.' using errcode='P0002';
  end if;

  v_rule := public.servicos_contratos_billing_ensure_rule(p_contrato_id);

  insert into public.servicos_contratos_billing_schedule (
    empresa_id,
    contrato_id,
    rule_id,
    kind,
    competencia,
    data_vencimento,
    valor,
    status,
    descricao
  )
  values (
    v_empresa,
    p_contrato_id,
    v_rule.id,
    'avulso',
    null,
    p_data_vencimento,
    p_valor,
    'previsto',
    nullif(btrim(p_descricao), '')
  )
  on conflict do nothing
  returning * into v_row;

  if v_row.id is not null then
    return v_row;
  end if;

  select * into v_row
  from public.servicos_contratos_billing_schedule s
  where s.empresa_id = v_empresa
    and s.contrato_id = p_contrato_id
    and s.kind = 'avulso'
    and s.data_vencimento = p_data_vencimento
    and s.valor = p_valor
  order by s.created_at desc
  limit 1;

  return v_row;
end;
$$;

revoke all on function public.servicos_contratos_billing_add_avulso(uuid, date, numeric, text) from public, anon;
grant execute on function public.servicos_contratos_billing_add_avulso(uuid, date, numeric, text) to authenticated, service_role;


create or replace function public.servicos_contratos_billing_recalc_mensal_future(
  p_contrato_id uuid,
  p_from date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_contrato public.servicos_contratos;
  v_rule public.servicos_contratos_billing_rules;
  v_updated int := 0;
begin
  perform public.require_permission_for_current_user('servicos','update');

  if v_empresa is null then
    raise exception '[SVC][CONTRATOS][BILLING] empresa_id inválido' using errcode='42501';
  end if;

  select * into v_contrato
  from public.servicos_contratos c
  where c.id = p_contrato_id
    and c.empresa_id = v_empresa;

  if not found then
    raise exception 'Contrato não encontrado ou acesso negado.' using errcode='P0002';
  end if;

  v_rule := public.servicos_contratos_billing_ensure_rule(p_contrato_id);
  if v_rule.tipo <> 'mensal' then
    return jsonb_build_object('ok', true, 'updated', 0, 'reason', 'nao_mensal');
  end if;

  update public.servicos_contratos_billing_schedule s
  set
    valor = coalesce(v_rule.valor_mensal, 0),
    data_vencimento = (date_trunc('month', s.competencia)::date + ((v_rule.dia_vencimento - 1) || ' days')::interval)::date,
    rule_id = v_rule.id,
    updated_at = now()
  where s.empresa_id = v_empresa
    and s.contrato_id = p_contrato_id
    and s.kind = 'mensal'
    and s.status = 'previsto'
    and s.conta_a_receber_id is null
    and s.competencia is not null
    and s.data_vencimento >= coalesce(p_from, current_date);

  get diagnostics v_updated = row_count;
  return jsonb_build_object('ok', true, 'updated', v_updated);
end;
$$;

revoke all on function public.servicos_contratos_billing_recalc_mensal_future(uuid, date) from public, anon;
grant execute on function public.servicos_contratos_billing_recalc_mensal_future(uuid, date) to authenticated, service_role;


create or replace function public.servicos_contratos_billing_generate_receivables(
  p_contrato_id uuid,
  p_until date default current_date,
  p_months_ahead int default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_contrato public.servicos_contratos;
  v_rule public.servicos_contratos_billing_rules;
  v_row public.servicos_contratos_billing_schedule;
  v_receber public.contas_a_receber;
  v_cobranca public.servicos_cobrancas;
  v_created int := 0;
  v_start date;
  v_target date;
  v_auto_months int;
  v_desc text;
begin
  perform public.require_permission_for_current_user('servicos','update');
  perform public.require_permission_for_current_user('contas_a_receber','create');

  if v_empresa is null then
    raise exception '[SVC][CONTRATOS][BILLING] empresa_id inválido' using errcode='42501';
  end if;

  select * into v_contrato
  from public.servicos_contratos c
  where c.id = p_contrato_id
    and c.empresa_id = v_empresa;

  if not found then
    raise exception 'Contrato não encontrado ou acesso negado.' using errcode='P0002';
  end if;

  if v_contrato.status <> 'ativo' then
    return jsonb_build_object('ok', true, 'created', 0, 'reason', 'contrato_nao_ativo');
  end if;

  v_rule := public.servicos_contratos_billing_ensure_rule(p_contrato_id);

  v_start := date_trunc('month', coalesce(v_rule.primeira_competencia, coalesce(v_contrato.data_inicio, current_date)))::date;
  v_target := date_trunc('month', coalesce(p_until, current_date))::date;

  if p_months_ahead is null then
    v_auto_months :=
      greatest(
        12,
        (extract(year from age(v_target, v_start))::int * 12) + extract(month from age(v_target, v_start))::int + 1
      );
  else
    v_auto_months := p_months_ahead;
  end if;

  if v_auto_months < 1 then v_auto_months := 1; end if;
  if v_auto_months > 36 then v_auto_months := 36; end if;

  perform public.servicos_contratos_billing_generate_schedule(p_contrato_id, v_auto_months);

  for v_row in
    select *
    from public.servicos_contratos_billing_schedule s
    where s.empresa_id = v_empresa
      and s.contrato_id = p_contrato_id
      and s.status = 'previsto'
      and s.conta_a_receber_id is null
      and s.data_vencimento <= coalesce(p_until, current_date)
    order by s.data_vencimento asc
  loop
    if v_contrato.cliente_id is null then
      raise exception 'Contrato não possui cliente vinculado. Não é possível gerar contas a receber.';
    end if;

    v_desc := null;
    if v_row.kind = 'avulso' and coalesce(nullif(btrim(v_row.descricao), ''), '') <> '' then
      v_desc := format('Contrato %s - %s: %s', coalesce(v_contrato.numero,'(s/n)'), left(coalesce(v_contrato.descricao,''), 60), btrim(v_row.descricao));
    else
      v_desc := format(
        'Contrato %s - %s (%s)',
        coalesce(v_contrato.numero,'(s/n)'),
        left(coalesce(v_contrato.descricao,''), 80),
        to_char(coalesce(v_row.competencia, v_row.data_vencimento), 'YYYY-MM')
      );
    end if;

    begin
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
        v_empresa,
        v_contrato.cliente_id,
        v_desc,
        coalesce(v_row.valor, 0),
        v_row.data_vencimento,
        'pendente'::public.status_conta_receber,
        'SERVICO_CONTRATO_SCHEDULE',
        v_row.id,
        v_rule.centro_de_custo_id,
        'Gerado automaticamente a partir de contrato de serviços.'
      )
      returning * into v_receber;
    exception
      when unique_violation then
        select * into v_receber
        from public.contas_a_receber c
        where c.empresa_id = v_empresa
          and c.origem_tipo = 'SERVICO_CONTRATO_SCHEDULE'
          and c.origem_id = v_row.id
        limit 1;
    end;

    insert into public.servicos_cobrancas (
      empresa_id,
      nota_id,
      cliente_id,
      data_vencimento,
      valor,
      status,
      origem_tipo,
      origem_id,
      conta_a_receber_id,
      observacoes
    )
    values (
      v_empresa,
      null,
      v_contrato.cliente_id,
      v_row.data_vencimento,
      coalesce(v_row.valor, 0),
      'pendente'::public.status_cobranca,
      'SERVICO_CONTRATO_SCHEDULE',
      v_row.id,
      v_receber.id,
      'Gerado automaticamente a partir de contrato de serviços.'
    )
    on conflict do nothing
    returning * into v_cobranca;

    update public.servicos_contratos_billing_schedule s
    set
      conta_a_receber_id = v_receber.id,
      cobranca_id = coalesce(v_cobranca.id, s.cobranca_id),
      status = 'gerado',
      updated_at = now()
    where s.empresa_id = v_empresa
      and s.id = v_row.id;

    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('ok', true, 'created', v_created, 'months_ahead', v_auto_months);
end;
$$;

revoke all on function public.servicos_contratos_billing_generate_receivables(uuid, date, int) from public, anon;
grant execute on function public.servicos_contratos_billing_generate_receivables(uuid, date, int) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');

commit;

