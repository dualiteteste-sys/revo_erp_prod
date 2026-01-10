-- ============================================================================
-- Serviços / Contratos (MVP3): Cancelar/Suspender impactando agenda e títulos
-- ============================================================================
--
-- Objetivo:
-- - Ao suspender/cancelar contrato: cancelar agenda futura (status='cancelado').
-- - Opcionalmente: cancelar títulos futuros (contas_a_receber pendentes) gerados
--   por schedule do contrato, e marcar cobrança como cancelada.
-- - Ao reativar contrato (status='ativo'): `generate_schedule` deve reabrir
--   linhas canceladas (sem título) para voltar a ficar “previsto”.

create or replace function public.servicos_contratos_billing_cancel_future(
  p_contrato_id uuid,
  p_cancel_receivables boolean default false,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_contrato public.servicos_contratos;
  v_now date := current_date;
  v_schedule_cancelled int := 0;
  v_receivables_cancelled int := 0;
  v_cobrancas_cancelled int := 0;
begin
  perform public.require_permission_for_current_user('servicos','update');

  if p_cancel_receivables then
    perform public.require_permission_for_current_user('contas_a_receber','update');
  end if;

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

  -- Cancela apenas o futuro (não mexe no histórico).
  update public.servicos_contratos_billing_schedule s
  set status = 'cancelado'
  where s.empresa_id = v_empresa
    and s.contrato_id = p_contrato_id
    and s.status = 'previsto'
    and s.data_vencimento > v_now;

  get diagnostics v_schedule_cancelled = row_count;

  if p_cancel_receivables then
    -- Cancela títulos futuros (pendentes) gerados por este contrato via origem_tipo/origem_id
    -- e marca cobranças como canceladas.
    with rows_to_cancel as (
      select
        s.id as schedule_id,
        s.conta_a_receber_id as receber_id,
        s.cobranca_id as cobranca_id
      from public.servicos_contratos_billing_schedule s
      join public.contas_a_receber r on r.id = s.conta_a_receber_id
      where s.empresa_id = v_empresa
        and s.contrato_id = p_contrato_id
        and s.conta_a_receber_id is not null
        and s.data_vencimento > v_now
        and r.status <> 'pago'::public.status_conta_receber
    ),
    upd_receber as (
      update public.contas_a_receber r
      set
        status = 'cancelado'::public.status_conta_receber,
        observacoes = case
          when coalesce(nullif(btrim(p_reason), ''), '') = '' then observacoes
          when observacoes is null or btrim(observacoes) = '' then '[CANCELADO] ' || btrim(p_reason)
          else observacoes || E'\n' || '[CANCELADO] ' || btrim(p_reason)
        end,
        updated_at = now()
      where r.empresa_id = v_empresa
        and r.id in (select receber_id from rows_to_cancel where receber_id is not null)
        and r.status <> 'pago'::public.status_conta_receber
      returning r.id
    ),
    upd_cobranca as (
      update public.servicos_cobrancas c
      set status = 'cancelada', updated_at = now()
      where c.empresa_id = v_empresa
        and c.id in (select cobranca_id from rows_to_cancel where cobranca_id is not null)
        and c.status <> 'paga'
      returning c.id
    )
    update public.servicos_contratos_billing_schedule s
    set status = 'cancelado'
    where s.empresa_id = v_empresa
      and s.id in (select schedule_id from rows_to_cancel);

    select count(*) into v_receivables_cancelled from upd_receber;
    select count(*) into v_cobrancas_cancelled from upd_cobranca;
  end if;

  return jsonb_build_object(
    'ok', true,
    'schedule_cancelled', v_schedule_cancelled,
    'receivables_cancelled', v_receivables_cancelled,
    'cobrancas_cancelled', v_cobrancas_cancelled
  );
end;
$$;

revoke all on function public.servicos_contratos_billing_cancel_future(uuid, boolean, text) from public, anon;
grant execute on function public.servicos_contratos_billing_cancel_future(uuid, boolean, text) to authenticated, service_role;


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

  select public.servicos_contratos_billing_ensure_rule(p_contrato_id) into v_rule;
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

-- Versão admin (worker): mesma lógica, mas sem depender de current_empresa_id()
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
  v_reopened int := 0;
  v_was_insert boolean;
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

      v_was_insert := null;
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

revoke all on function public.servicos_contratos_billing_generate_schedule_admin(uuid, int) from public, anon;
grant execute on function public.servicos_contratos_billing_generate_schedule_admin(uuid, int) to service_role;

select pg_notify('pgrst','reload schema');
