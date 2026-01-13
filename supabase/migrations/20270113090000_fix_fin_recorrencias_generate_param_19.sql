-- Financeiro: fix recorrências_generate ($19 mismatch)
-- Bug: a query dinâmica para insert em financeiro_contas_pagar (quando existe centro_de_custo_id)
-- referencia $19, mas o USING possui apenas 18 parâmetros → "there is no parameter $19".

begin;

drop function if exists public.financeiro_recorrencias_generate(uuid, date, int);
create or replace function public.financeiro_recorrencias_generate(
  p_recorrencia_id uuid,
  p_until date default null,
  p_max int default 24
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  r public.financeiro_recorrencias;
  v_created_occ int := 0;
  v_created_accounts int := 0;
  v_repaired_accounts int := 0;
  v_rowcount int := 0;
  v_seq_start int := 0;
  v_seq int := 0;
  v_due_nominal date;
  v_due date;
  v_months_step int;
  v_existing record;
  v_occ_id uuid;
  v_account_id uuid;
  v_has_centro_cp boolean;
  v_has_centro_cr boolean;
begin
  select * into r
  from public.financeiro_recorrencias
  where id = p_recorrencia_id and empresa_id = v_empresa;

  if not found then
    raise exception '[FIN][REC] Recorrência não encontrada.' using errcode='P0002';
  end if;

  if r.tipo = 'pagar' then
    perform public.require_permission_for_current_user('contas_a_pagar','create');
  else
    perform public.require_permission_for_current_user('contas_a_receber','create');
  end if;

  if not r.ativo then
    return jsonb_build_object('status','skipped','reason','inactive');
  end if;

  if r.tipo = 'pagar' then
    if r.fornecedor_id is null then
      raise exception '[FIN][REC] fornecedor_id é obrigatório.' using errcode='P0001';
    end if;
    if r.valor_total is null then
      raise exception '[FIN][REC] valor_total é obrigatório.' using errcode='P0001';
    end if;
  else
    if r.cliente_id is null then
      raise exception '[FIN][REC] cliente_id é obrigatório.' using errcode='P0001';
    end if;
    if r.valor is null then
      raise exception '[FIN][REC] valor é obrigatório.' using errcode='P0001';
    end if;
  end if;

  select coalesce(max(o.seq), -1) + 1 into v_seq_start
  from public.financeiro_recorrencias_ocorrencias o
  where o.empresa_id = v_empresa and o.recorrencia_id = r.id;

  -- Detecta coluna centro_de_custo_id nos alvos (compat drift)
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='financeiro_contas_pagar' and column_name='centro_de_custo_id'
  ) into v_has_centro_cp;
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='contas_a_receber' and column_name='centro_de_custo_id'
  ) into v_has_centro_cr;

  v_months_step := case r.frequencia
    when 'mensal' then 1
    when 'bimestral' then 2
    when 'trimestral' then 3
    when 'semestral' then 6
    when 'anual' then 12
    else null
  end;

  -- Loop: gera até p_until (ou p_max novas ocorrências) respeitando end_date.
  v_seq := v_seq_start;
  while v_created_occ < greatest(1, least(p_max, 240)) loop
    if r.frequencia = 'semanal' then
      -- primeira data: alinhar para o weekday a partir do start_date
      v_due_nominal := (r.start_date + ((7 + r.weekday - extract(dow from r.start_date)::int) % 7)) + (v_seq * 7);
    else
      v_due_nominal := public.financeiro__add_months_clamp_dom(r.start_date, v_seq * v_months_step, r.day_of_month);
    end if;

    v_due := public.financeiro__adjust_business_day(v_due_nominal, r.ajuste_dia_util);

    exit when r.end_date is not null and v_due > r.end_date;
    exit when p_until is not null and v_due > p_until;

    -- Insere ocorrência (idempotente) e captura id
    insert into public.financeiro_recorrencias_ocorrencias (empresa_id, recorrencia_id, seq, data_vencimento)
    values (v_empresa, r.id, v_seq, v_due)
    on conflict (empresa_id, recorrencia_id, seq) do nothing;

    get diagnostics v_rowcount = row_count;
    v_created_occ := v_created_occ + v_rowcount;

    select o.id, o.conta_pagar_id, o.conta_receber_id
      into v_existing
      from public.financeiro_recorrencias_ocorrencias o
     where o.empresa_id = v_empresa and o.recorrencia_id = r.id and o.seq = v_seq
     limit 1;

    v_occ_id := v_existing.id;

    -- Gera conta se ainda não existe / não está vinculada
    if r.tipo = 'pagar' then
      if v_existing.conta_pagar_id is null then
        v_account_id := null;

        if v_has_centro_cp then
          execute $q$
            insert into public.financeiro_contas_pagar (
              empresa_id, fornecedor_id, documento_ref, descricao, data_emissao, data_vencimento,
              valor_total, valor_pago, multa, juros, desconto, forma_pagamento, categoria, status, observacoes,
              origem_tipo, origem_id, centro_de_custo_id
            ) values (
              $1,$2,$3,$4,$5,$6,
              $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
              $17,$18
            )
            returning id
          $q$
          using
            v_empresa,
            r.fornecedor_id,
            r.documento_ref,
            r.descricao,
            null::date,
            v_due,
            coalesce(r.valor_total, 0),
            0::numeric,
            0::numeric,
            0::numeric,
            0::numeric,
            r.forma_pagamento,
            r.categoria,
            'aberta',
            r.observacoes,
            'RECORRENCIA',
            v_occ_id,
            r.centro_de_custo_id
          into v_account_id;
        else
          execute $q$
            insert into public.financeiro_contas_pagar (
              empresa_id, fornecedor_id, documento_ref, descricao, data_emissao, data_vencimento,
              valor_total, valor_pago, multa, juros, desconto, forma_pagamento, categoria, status, observacoes,
              origem_tipo, origem_id
            ) values (
              $1,$2,$3,$4,$5,$6,
              $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
              $17,$18
            )
            returning id
          $q$
          using
            v_empresa,
            r.fornecedor_id,
            r.documento_ref,
            r.descricao,
            null::date,
            v_due,
            coalesce(r.valor_total, 0),
            0::numeric,
            0::numeric,
            0::numeric,
            0::numeric,
            r.forma_pagamento,
            r.categoria,
            'aberta',
            r.observacoes,
            'RECORRENCIA',
            v_occ_id
          into v_account_id;
        end if;

        update public.financeiro_recorrencias_ocorrencias
           set conta_pagar_id = v_account_id
         where empresa_id = v_empresa and id = v_existing.id;

        v_created_accounts := v_created_accounts + 1;
      end if;
    else
      if v_existing.conta_receber_id is null then
        v_account_id := null;

        if v_has_centro_cr then
          execute $q$
            insert into public.contas_a_receber (
              empresa_id, cliente_id, descricao, valor, data_vencimento, status, observacoes,
              origem_tipo, origem_id, centro_de_custo_id
            ) values (
              $1,$2,$3,$4,$5,$6,$7,
              $8,$9,$10
            )
            returning id
          $q$
          using
            v_empresa,
            r.cliente_id,
            r.descricao,
            coalesce(r.valor, 0),
            v_due,
            'pendente'::public.status_conta_receber,
            r.observacoes,
            'RECORRENCIA',
            v_existing.id,
            r.centro_de_custo_id
          into v_account_id;
        else
          execute $q$
            insert into public.contas_a_receber (
              empresa_id, cliente_id, descricao, valor, data_vencimento, status, observacoes,
              origem_tipo, origem_id
            ) values (
              $1,$2,$3,$4,$5,$6,$7,
              $8,$9
            )
            returning id
          $q$
          using
            v_empresa,
            r.cliente_id,
            r.descricao,
            coalesce(r.valor, 0),
            v_due,
            'pendente'::public.status_conta_receber,
            r.observacoes,
            'RECORRENCIA',
            v_existing.id
          into v_account_id;
        end if;

        update public.financeiro_recorrencias_ocorrencias
           set conta_receber_id = v_account_id
         where empresa_id = v_empresa and id = v_existing.id;

        v_created_accounts := v_created_accounts + 1;
      end if;
    end if;

    v_seq := v_seq + 1;
  end loop;

  -- Backfill: se houver ocorrências antigas sem conta, tenta criar e vincular (idempotente).
  if r.tipo = 'pagar' then
    for v_existing in
      select o.id, o.data_vencimento
      from public.financeiro_recorrencias_ocorrencias o
      where o.empresa_id = v_empresa
        and o.recorrencia_id = r.id
        and o.conta_pagar_id is null
        and (p_until is null or o.data_vencimento <= p_until)
        and (r.end_date is null or o.data_vencimento <= r.end_date)
      order by o.seq
      limit 500
    loop
      select cp.id into v_account_id
      from public.financeiro_contas_pagar cp
      where cp.empresa_id = v_empresa
        and cp.origem_tipo = 'RECORRENCIA'
        and cp.origem_id = v_existing.id
      limit 1;

      if v_account_id is null then
        if v_has_centro_cp then
          execute $q$
            insert into public.financeiro_contas_pagar (
              empresa_id, fornecedor_id, documento_ref, descricao, data_emissao, data_vencimento,
              valor_total, valor_pago, multa, juros, desconto, forma_pagamento, categoria, status, observacoes,
              origem_tipo, origem_id, centro_de_custo_id
            ) values (
              $1,$2,$3,$4,$5,$6,
              $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
              $17,$18
            )
            returning id
          $q$
          using
            v_empresa,
            r.fornecedor_id,
            r.documento_ref,
            r.descricao,
            null::date,
            v_existing.data_vencimento,
            coalesce(r.valor_total, 0),
            0::numeric, 0::numeric, 0::numeric, 0::numeric,
            r.forma_pagamento,
            r.categoria,
            'aberta',
            r.observacoes,
            'RECORRENCIA',
            v_existing.id,
            r.centro_de_custo_id
          into v_account_id;
        else
          execute $q$
            insert into public.financeiro_contas_pagar (
              empresa_id, fornecedor_id, documento_ref, descricao, data_emissao, data_vencimento,
              valor_total, valor_pago, multa, juros, desconto, forma_pagamento, categoria, status, observacoes,
              origem_tipo, origem_id
            ) values (
              $1,$2,$3,$4,$5,$6,
              $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
              $17,$18
            )
            returning id
          $q$
          using
            v_empresa,
            r.fornecedor_id,
            r.documento_ref,
            r.descricao,
            null::date,
            v_existing.data_vencimento,
            coalesce(r.valor_total, 0),
            0::numeric, 0::numeric, 0::numeric, 0::numeric,
            r.forma_pagamento,
            r.categoria,
            'aberta',
            r.observacoes,
            'RECORRENCIA',
            v_existing.id
          into v_account_id;
        end if;
      end if;

      if v_account_id is not null then
        update public.financeiro_recorrencias_ocorrencias
           set conta_pagar_id = v_account_id
         where empresa_id = v_empresa and id = v_existing.id
           and conta_pagar_id is null;

        get diagnostics v_rowcount = row_count;
        v_repaired_accounts := v_repaired_accounts + v_rowcount;
      end if;
    end loop;
  else
    for v_existing in
      select o.id, o.data_vencimento
      from public.financeiro_recorrencias_ocorrencias o
      where o.empresa_id = v_empresa
        and o.recorrencia_id = r.id
        and o.conta_receber_id is null
        and (p_until is null or o.data_vencimento <= p_until)
        and (r.end_date is null or o.data_vencimento <= r.end_date)
      order by o.seq
      limit 500
    loop
      select cr.id into v_account_id
      from public.contas_a_receber cr
      where cr.empresa_id = v_empresa
        and cr.origem_tipo = 'RECORRENCIA'
        and cr.origem_id = v_existing.id
      limit 1;

      if v_account_id is null then
        if v_has_centro_cr then
          execute $q$
            insert into public.contas_a_receber (
              empresa_id, cliente_id, descricao, valor, data_vencimento, status, observacoes,
              origem_tipo, origem_id, centro_de_custo_id
            ) values (
              $1,$2,$3,$4,$5,$6,$7,
              $8,$9,$10
            )
            returning id
          $q$
          using
            v_empresa,
            r.cliente_id,
            r.descricao,
            coalesce(r.valor, 0),
            v_existing.data_vencimento,
            'pendente'::public.status_conta_receber,
            r.observacoes,
            'RECORRENCIA',
            v_existing.id,
            r.centro_de_custo_id
          into v_account_id;
        else
          execute $q$
            insert into public.contas_a_receber (
              empresa_id, cliente_id, descricao, valor, data_vencimento, status, observacoes,
              origem_tipo, origem_id
            ) values (
              $1,$2,$3,$4,$5,$6,$7,
              $8,$9
            )
            returning id
          $q$
          using
            v_empresa,
            r.cliente_id,
            r.descricao,
            coalesce(r.valor, 0),
            v_existing.data_vencimento,
            'pendente'::public.status_conta_receber,
            r.observacoes,
            'RECORRENCIA',
            v_existing.id
          into v_account_id;
        end if;
      end if;

      if v_account_id is not null then
        update public.financeiro_recorrencias_ocorrencias
           set conta_receber_id = v_account_id
         where empresa_id = v_empresa and id = v_existing.id
           and conta_receber_id is null;

        get diagnostics v_rowcount = row_count;
        v_repaired_accounts := v_repaired_accounts + v_rowcount;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'status','ok',
    'ocorrencias_novas', v_created_occ,
    'contas_geradas', v_created_accounts,
    'contas_reparadas', v_repaired_accounts
  );
end;
$$;

revoke all on function public.financeiro_recorrencias_generate(uuid, date, int) from public, anon;
grant execute on function public.financeiro_recorrencias_generate(uuid, date, int) to authenticated, service_role;

commit;
