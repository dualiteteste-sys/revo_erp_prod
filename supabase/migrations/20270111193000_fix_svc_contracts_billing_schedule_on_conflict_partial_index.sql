-- ============================================================================
-- FIX: Contratos / Billing — ON CONFLICT deve casar com índice UNIQUE parcial
-- ============================================================================
--
-- Bug:
--   servicos_contratos_billing_schedule tem UNIQUE parcial:
--     svc_contracts_billing_schedule_mensal_uk
--       (empresa_id, contrato_id, kind, competencia) WHERE kind='mensal' AND competencia IS NOT NULL
--   Logo, `ON CONFLICT (empresa_id, contrato_id, kind, competencia)` sem `WHERE`
--   falha com:
--     42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification
--
-- Fix:
--   Use `ON CONFLICT (...) WHERE kind='mensal' AND competencia IS NOT NULL` para
--   inferir corretamente o índice parcial.
--

begin;

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
          where kind = 'mensal' and competencia is not null
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

-- Best-effort: ajuda PostgREST a enxergar alterações rapidamente
notify pgrst, 'reload schema';

commit;

