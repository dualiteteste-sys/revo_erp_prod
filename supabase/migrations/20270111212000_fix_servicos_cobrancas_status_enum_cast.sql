-- ============================================================================
-- FIX: Contratos / Billing — não depender do type public.status_cobranca
-- ============================================================================
--
-- Bug:
--   Alguns ambientes não possuem o enum `public.status_cobranca` (status é text).
--   O RPC `servicos_contratos_billing_generate_receivables` fazia:
--     'pendente'::public.status_cobranca
--   causando erro 400 (42704) "type public.status_cobranca does not exist".
--
-- Fix:
--   Usar string literal (compatível com coluna text e também com enum, se existir).
--

begin;

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
  v_cobranca_id uuid;
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

    v_cobranca_id := null;
    begin
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
        'pendente',
        'SERVICO_CONTRATO_SCHEDULE',
        v_row.id,
        v_receber.id,
        'Gerado automaticamente a partir de contrato de serviços.'
      )
      on conflict do nothing
      returning id into v_cobranca_id;
    exception
      when undefined_column then
        -- Ambiente legado (antes das colunas de origem); não deve ocorrer após migrations,
        -- mas evita quebrar hard em caso de drift.
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
          v_empresa,
          null,
          v_contrato.cliente_id,
          v_row.data_vencimento,
          coalesce(v_row.valor, 0),
          'pendente',
          v_receber.id
        )
        on conflict do nothing
        returning id into v_cobranca_id;
    end;

    if v_cobranca_id is null then
      select sc.id into v_cobranca_id
      from public.servicos_cobrancas sc
      where sc.empresa_id = v_empresa
        and sc.conta_a_receber_id = v_receber.id
      limit 1;
    end if;

    update public.servicos_contratos_billing_schedule s
    set
      conta_a_receber_id = v_receber.id,
      cobranca_id = coalesce(v_cobranca_id, s.cobranca_id),
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

