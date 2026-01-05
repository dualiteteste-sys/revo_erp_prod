/*
  SUP: Compatibilizar Recebimento/Estorno com Multi-Estoque (depósitos)

  Contexto
  - O módulo de multi-estoque usa `estoque_saldos_depositos` + `estoque_movimentos.deposito_id`.
  - O fluxo de Recebimento (finalizar_recebimento -> estoque_process_from_recebimento) e o estorno (recebimento_cancelar)
    ainda atualizavam apenas `estoque_saldos` e movimentos sem `deposito_id`, o que fazia os saldos “sumirem” no modo multi-depósito.

  O que muda
  - Quando existir `public.estoque_saldos_depositos` (multi-estoque ativo), o Recebimento passa a lançar a entrada no
    depósito padrão (via `suprimentos_default_deposito_ensure()`), preenchendo também `estoque_saldos` (total).
  - O estorno de Recebimento passa a lançar a saída no mesmo depósito padrão.

  Impacto
  - Não altera schema; apenas a lógica das functions.
  - Idempotência: movimentos continuam protegidos por unique (empresa_id, origem_tipo, origem_id, produto_id, tipo_mov).

  Reversibilidade
  - Basta reverter estas `CREATE OR REPLACE FUNCTION` para a versão anterior (migração futura).
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) Recebimento -> estoque_process_from_recebimento (entrada por depósito)
-- -----------------------------------------------------------------------------
create or replace function public.estoque_process_from_recebimento(
  p_recebimento_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_import_id uuid;
  v_row record;
  v_rows int := 0;
  v_has_depositos boolean := false;
  v_dep uuid;
  v_lote text := 'SEM_LOTE';
  v_saldo_ant numeric := 0;
  v_saldo_novo numeric := 0;
  v_custo_ant numeric := 0;
  v_custo_novo numeric := 0;
  v_total numeric := 0;
  v_total_custo numeric := 0;
  v_doc text;
begin
  select fiscal_nfe_import_id into v_import_id
  from public.recebimentos
  where id = p_recebimento_id
    and empresa_id = v_emp
  limit 1;

  if v_import_id is null then
    raise exception 'Recebimento não encontrado.';
  end if;

  v_has_depositos := (to_regclass('public.estoque_saldos_depositos') is not null);
  if v_has_depositos then
    begin
      v_dep := public.suprimentos_default_deposito_ensure();
    exception when undefined_function then
      v_has_depositos := false;
    end;
  end if;

  v_doc := 'REC-' || left(replace(p_recebimento_id::text, '-', ''), 12);

  -- ---------------------------------------------------------------------------
  -- A) Multi-estoque ativo: atualiza saldo por depósito e cria movimento com deposito_id
  -- ---------------------------------------------------------------------------
  if v_has_depositos then
    insert into public.estoque_saldos_depositos (empresa_id, produto_id, deposito_id, saldo, custo_medio)
    select distinct v_emp, ri.produto_id, v_dep, 0, 0
    from public.recebimento_itens ri
    where ri.recebimento_id = p_recebimento_id
      and ri.empresa_id = v_emp
      and ri.produto_id is not null
    on conflict (empresa_id, produto_id, deposito_id) do nothing;

    for v_row in
      select
        ri.produto_id,
        coalesce(nullif(ri.quantidade_conferida, 0), ri.quantidade_xml) as qtd,
        fi.vuncom as valor_unitario,
        fi.xprod as xprod
      from public.recebimento_itens ri
      join public.fiscal_nfe_import_items fi
        on fi.id = ri.fiscal_nfe_item_id
       and fi.empresa_id = v_emp
      where ri.recebimento_id = p_recebimento_id
        and ri.empresa_id = v_emp
        and ri.produto_id is not null
    loop
      if coalesce(v_row.qtd, 0) <= 0 then
        continue;
      end if;

      -- lock por (empresa, deposito) para serializar saldo
      perform pg_advisory_xact_lock(
        ('x'||substr(replace(v_emp::text,'-',''),1,16))::bit(64)::bigint,
        ('x'||substr(replace(v_dep::text,'-',''),1,16))::bit(64)::bigint
      );

      select saldo, custo_medio
        into v_saldo_ant, v_custo_ant
      from public.estoque_saldos_depositos
      where empresa_id = v_emp and produto_id = v_row.produto_id and deposito_id = v_dep
      for update;

      if not found then
        v_saldo_ant := 0;
        v_custo_ant := 0;
        insert into public.estoque_saldos_depositos (empresa_id, produto_id, deposito_id, saldo, custo_medio)
        values (v_emp, v_row.produto_id, v_dep, 0, 0)
        on conflict (empresa_id, produto_id, deposito_id) do nothing;
      end if;

      v_saldo_novo := v_saldo_ant + v_row.qtd;
      if v_row.valor_unitario is not null and v_saldo_novo > 0 then
        v_custo_novo := ((v_saldo_ant * v_custo_ant) + (v_row.qtd * v_row.valor_unitario)) / v_saldo_novo;
      else
        v_custo_novo := v_custo_ant;
      end if;

      update public.estoque_saldos_depositos
      set saldo = v_saldo_novo, custo_medio = v_custo_novo, updated_at = now()
      where empresa_id = v_emp and produto_id = v_row.produto_id and deposito_id = v_dep;

      -- atualiza o saldo total (soma dos depósitos)
      select coalesce(sum(saldo),0), coalesce(sum(saldo * custo_medio),0)
        into v_total, v_total_custo
      from public.estoque_saldos_depositos
      where empresa_id = v_emp and produto_id = v_row.produto_id;

      insert into public.estoque_saldos (empresa_id, produto_id, saldo, custo_medio)
      values (v_emp, v_row.produto_id, v_total, case when v_total <= 0 then 0 else (v_total_custo / v_total) end)
      on conflict (empresa_id, produto_id) do update
        set saldo = excluded.saldo,
            custo_medio = excluded.custo_medio,
            updated_at = now();

      -- best-effort: compat com reservas por lote
      begin
        insert into public.estoque_lotes (empresa_id, produto_id, lote, saldo)
        values (v_emp, v_row.produto_id, v_lote, v_row.qtd)
        on conflict (empresa_id, produto_id, lote)
        do update set saldo = public.estoque_lotes.saldo + excluded.saldo, updated_at = now();
      exception when undefined_table then
        null;
      end;

      insert into public.estoque_movimentos (
        empresa_id,
        produto_id,
        deposito_id,
        data_movimento,
        tipo,
        tipo_mov,
        quantidade,
        saldo_anterior,
        saldo_atual,
        custo_medio,
        valor_unitario,
        origem_tipo,
        origem_id,
        origem,
        lote,
        observacoes
      )
      values (
        v_emp,
        v_row.produto_id,
        v_dep,
        current_date,
        'entrada',
        'entrada_nfe',
        v_row.qtd,
        v_saldo_ant,
        v_saldo_novo,
        v_custo_novo,
        v_row.valor_unitario,
        'recebimento',
        p_recebimento_id,
        v_doc,
        v_lote,
        left('Entrada via Recebimento - '||coalesce(nullif(v_row.xprod,''),'item'), 250)
      )
      on conflict (empresa_id, origem_tipo, origem_id, produto_id, tipo_mov)
      do update set
        deposito_id = excluded.deposito_id,
        quantidade = excluded.quantidade,
        saldo_anterior = excluded.saldo_anterior,
        saldo_atual = excluded.saldo_atual,
        custo_medio = excluded.custo_medio,
        valor_unitario = excluded.valor_unitario,
        origem = excluded.origem,
        observacoes = excluded.observacoes,
        updated_at = now();

      v_rows := v_rows + 1;
    end loop;

    return jsonb_build_object('status','ok','movimentos',v_rows,'deposito_id',v_dep);
  end if;

  -- ---------------------------------------------------------------------------
  -- B) Legado: mantém comportamento anterior (sem depósito)
  -- ---------------------------------------------------------------------------
  -- garante rows em estoque_saldos (evita lock inexistente durante o loop)
  insert into public.estoque_saldos (empresa_id, produto_id, saldo, custo_medio)
  select distinct v_emp, ri.produto_id, 0, 0
  from public.recebimento_itens ri
  where ri.recebimento_id = p_recebimento_id
    and ri.empresa_id = v_emp
    and ri.produto_id is not null
  on conflict (empresa_id, produto_id) do nothing;

  for v_row in
    select
      ri.produto_id,
      coalesce(nullif(ri.quantidade_conferida, 0), ri.quantidade_xml) as qtd,
      fi.vuncom as valor_unitario,
      fi.xprod as xprod
    from public.recebimento_itens ri
    join public.fiscal_nfe_import_items fi
      on fi.id = ri.fiscal_nfe_item_id
     and fi.empresa_id = v_emp
    where ri.recebimento_id = p_recebimento_id
      and ri.empresa_id = v_emp
      and ri.produto_id is not null
  loop
    if coalesce(v_row.qtd, 0) <= 0 then
      continue;
    end if;

    select saldo, custo_medio
      into v_saldo_ant, v_custo_ant
    from public.estoque_saldos
    where empresa_id = v_emp and produto_id = v_row.produto_id
    for update;

    v_saldo_novo := coalesce(v_saldo_ant,0) + v_row.qtd;
    if v_row.valor_unitario is not null and v_saldo_novo > 0 then
      v_custo_novo := ((coalesce(v_saldo_ant,0) * coalesce(v_custo_ant,0)) + (v_row.qtd * v_row.valor_unitario)) / v_saldo_novo;
    else
      v_custo_novo := coalesce(v_custo_ant,0);
    end if;

    update public.estoque_saldos
    set saldo = v_saldo_novo, custo_medio = v_custo_novo, updated_at = now()
    where empresa_id = v_emp and produto_id = v_row.produto_id;

    insert into public.estoque_movimentos (
      empresa_id, produto_id, data_movimento,
      tipo, tipo_mov, quantidade,
      saldo_anterior, saldo_atual,
      custo_medio,
      valor_unitario,
      origem_tipo, origem_id, lote, observacoes
    )
    values (
      v_emp, v_row.produto_id, current_date,
      'entrada', 'entrada_nfe', v_row.qtd,
      coalesce(v_saldo_ant,0), v_saldo_novo,
      v_custo_novo,
      v_row.valor_unitario,
      'recebimento', p_recebimento_id, v_lote,
      left('Entrada via NF-e (Recebimento) - '||coalesce(nullif(v_row.xprod,''),'item'), 250)
    )
    on conflict (empresa_id, origem_tipo, origem_id, produto_id, tipo_mov)
    do update set
      quantidade = excluded.quantidade,
      saldo_anterior = excluded.saldo_anterior,
      saldo_atual = excluded.saldo_atual,
      custo_medio = excluded.custo_medio,
      valor_unitario = excluded.valor_unitario,
      updated_at = now();

    v_rows := v_rows + 1;
  end loop;

  return jsonb_build_object('status','ok','movimentos',v_rows);
end;
$$;

revoke all on function public.estoque_process_from_recebimento(uuid) from public;
grant execute on function public.estoque_process_from_recebimento(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) Estorno de recebimento -> atualizar saldo por depósito quando multi-estoque ativo
-- -----------------------------------------------------------------------------
create or replace function public.recebimento_cancelar(
  p_recebimento_id uuid,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_status text;
  v_classificacao text;
  v_import_id uuid;
  v_item record;
  v_mov record;
  v_lote text;
  v_qtd numeric;
  v_rows int := 0;
  v_has_depositos boolean := false;
  v_dep uuid;
  v_doc text;
  v_saldo_ant numeric := 0;
  v_saldo_novo numeric := 0;
  v_custo_ant numeric := 0;
  v_total numeric := 0;
  v_total_custo numeric := 0;
begin
  select status, classificacao, fiscal_nfe_import_id
    into v_status, v_classificacao, v_import_id
  from public.recebimentos
  where id = p_recebimento_id
    and empresa_id = v_emp
  for update;

  if v_status is null then
    raise exception 'Recebimento não encontrado.';
  end if;

  if v_status = 'cancelado' then
    return jsonb_build_object('status','already_cancelled');
  end if;

  if v_status <> 'concluido' then
    raise exception 'Somente recebimentos concluídos podem ser cancelados (status atual: %).', v_status;
  end if;

  if v_classificacao is null then
    v_classificacao := 'estoque_proprio';
  end if;

  v_has_depositos := (to_regclass('public.estoque_saldos_depositos') is not null);
  if v_has_depositos then
    begin
      v_dep := public.suprimentos_default_deposito_ensure();
    exception when undefined_function then
      v_has_depositos := false;
    end;
  end if;

  v_doc := 'REC-ESTORNO-' || left(replace(p_recebimento_id::text, '-', ''), 12);

  if v_classificacao = 'estoque_proprio' then
    for v_item in
      select
        ri.produto_id,
        coalesce(nullif(ri.quantidade_conferida, 0), ri.quantidade_xml) as qtd,
        fi.vuncom as valor_unitario,
        fi.xprod as xprod
      from public.recebimento_itens ri
      join public.fiscal_nfe_import_items fi
        on fi.id = ri.fiscal_nfe_item_id
       and fi.empresa_id = v_emp
      where ri.recebimento_id = p_recebimento_id
        and ri.empresa_id = v_emp
        and ri.produto_id is not null
    loop
      v_qtd := coalesce(v_item.qtd, 0);
      if v_qtd <= 0 then
        continue;
      end if;

      v_lote := 'SEM_LOTE';

      if v_has_depositos then
        perform pg_advisory_xact_lock(
          ('x'||substr(replace(v_emp::text,'-',''),1,16))::bit(64)::bigint,
          ('x'||substr(replace(v_dep::text,'-',''),1,16))::bit(64)::bigint
        );

        insert into public.estoque_saldos_depositos (empresa_id, produto_id, deposito_id, saldo, custo_medio)
        values (v_emp, v_item.produto_id, v_dep, 0, 0)
        on conflict (empresa_id, produto_id, deposito_id) do nothing;

        select saldo, custo_medio
          into v_saldo_ant, v_custo_ant
        from public.estoque_saldos_depositos
        where empresa_id = v_emp and produto_id = v_item.produto_id and deposito_id = v_dep
        for update;

        v_saldo_novo := coalesce(v_saldo_ant,0) - v_qtd;

        update public.estoque_saldos_depositos
        set saldo = v_saldo_novo, custo_medio = v_custo_ant, updated_at = now()
        where empresa_id = v_emp and produto_id = v_item.produto_id and deposito_id = v_dep;

        select coalesce(sum(saldo),0), coalesce(sum(saldo * custo_medio),0)
          into v_total, v_total_custo
        from public.estoque_saldos_depositos
        where empresa_id = v_emp and produto_id = v_item.produto_id;

        insert into public.estoque_saldos (empresa_id, produto_id, saldo, custo_medio)
        values (v_emp, v_item.produto_id, v_total, case when v_total <= 0 then 0 else (v_total_custo / v_total) end)
        on conflict (empresa_id, produto_id) do update
          set saldo = excluded.saldo,
              custo_medio = excluded.custo_medio,
              updated_at = now();

        begin
          update public.estoque_lotes
          set saldo = greatest(coalesce(saldo,0) - v_qtd, 0),
              updated_at = now()
          where empresa_id = v_emp
            and produto_id = v_item.produto_id
            and lote = v_lote;
        exception when undefined_table then
          null;
        end;

        insert into public.estoque_movimentos (
          empresa_id,
          produto_id,
          deposito_id,
          data_movimento,
          tipo,
          tipo_mov,
          quantidade,
          saldo_anterior,
          saldo_atual,
          custo_medio,
          valor_unitario,
          origem_tipo,
          origem_id,
          origem,
          lote,
          observacoes
        )
        values (
          v_emp,
          v_item.produto_id,
          v_dep,
          current_date,
          'saida',
          'estorno_nfe',
          v_qtd,
          coalesce(v_saldo_ant,0),
          v_saldo_novo,
          coalesce(v_custo_ant,0),
          v_item.valor_unitario,
          'recebimento_estorno',
          p_recebimento_id,
          v_doc,
          v_lote,
          left('Estorno de Recebimento - '||coalesce(nullif(v_item.xprod,''),'item'), 250)
        )
        on conflict (empresa_id, origem_tipo, origem_id, produto_id, tipo_mov)
        do update set
          deposito_id = excluded.deposito_id,
          quantidade = excluded.quantidade,
          saldo_anterior = excluded.saldo_anterior,
          saldo_atual = excluded.saldo_atual,
          custo_medio = excluded.custo_medio,
          valor_unitario = excluded.valor_unitario,
          origem = excluded.origem,
          observacoes = excluded.observacoes,
          updated_at = now();

        v_rows := v_rows + 1;
        continue;
      end if;

      -- fallback legado (sem depósito)
      begin
        update public.estoque_lotes
        set saldo = greatest(coalesce(saldo,0) - v_qtd, 0),
            updated_at = now()
        where empresa_id = v_emp
          and produto_id = v_item.produto_id
          and lote = v_lote;
      exception when undefined_table then
        null;
      end;

      begin
        insert into public.estoque_movimentos (
          empresa_id, produto_id, data_movimento,
          tipo, tipo_mov, quantidade, valor_unitario,
          origem_tipo, origem_id, lote, observacoes
        ) values (
          v_emp, v_item.produto_id, current_date,
          'saida', 'estorno_nfe', v_qtd, v_item.valor_unitario,
          'recebimento_estorno', p_recebimento_id, v_lote,
          left('Estorno de Recebimento (NF-e) - '||coalesce(nullif(v_item.xprod,''),'item'), 250)
        )
        on conflict (empresa_id, origem_tipo, origem_id, produto_id, tipo_mov)
        do update set
          quantidade = excluded.quantidade,
          valor_unitario = excluded.valor_unitario,
          updated_at = now();
      exception
        when others then
          if not exists (
            select 1 from public.estoque_movimentos m
            where m.empresa_id = v_emp
              and m.origem_tipo = 'recebimento_estorno'
              and m.origem_id = p_recebimento_id
              and m.produto_id = v_item.produto_id
              and m.tipo_mov = 'estorno_nfe'
          ) then
            insert into public.estoque_movimentos (
              empresa_id, produto_id, data_movimento,
              tipo, tipo_mov, quantidade, valor_unitario,
              origem_tipo, origem_id, lote, observacoes
            ) values (
              v_emp, v_item.produto_id, current_date,
              'saida', 'estorno_nfe', v_qtd, v_item.valor_unitario,
              'recebimento_estorno', p_recebimento_id, v_lote,
              left('Estorno de Recebimento (NF-e) - '||coalesce(nullif(v_item.xprod,''),'item'), 250)
            );
          end if;
      end;

      v_rows := v_rows + 1;
    end loop;

  elsif v_classificacao = 'material_cliente' then
    -- Mantém o comportamento anterior (best-effort)
    for v_mov in
      select produto_id, quantidade, valor_unitario, coalesce(lote,'SEM_LOTE') as lote
      from public.estoque_movimentos
      where empresa_id = v_emp
        and origem_tipo = 'nfe_beneficiamento'
        and origem_id = v_import_id
        and tipo_mov = 'entrada_beneficiamento'
    loop
      v_qtd := coalesce(v_mov.quantidade, 0);
      if v_qtd <= 0 then
        continue;
      end if;

      v_lote := coalesce(v_mov.lote, 'SEM_LOTE');

      begin
        update public.estoque_lotes
        set saldo = greatest(coalesce(saldo,0) - v_qtd, 0),
            updated_at = now()
        where empresa_id = v_emp
          and produto_id = v_mov.produto_id
          and lote = v_lote;
      exception when undefined_table then
        null;
      end;

      begin
        insert into public.estoque_movimentos (
          empresa_id, produto_id, data_movimento,
          tipo, tipo_mov, quantidade, valor_unitario,
          origem_tipo, origem_id, lote, observacoes
        ) values (
          v_emp, v_mov.produto_id, current_date,
          'saida', 'estorno_beneficiamento', v_qtd, v_mov.valor_unitario,
          'nfe_beneficiamento_estorno', v_import_id, v_lote,
          left('Estorno de entrada para beneficiamento - recebimento='||p_recebimento_id::text, 250)
        )
        on conflict (empresa_id, origem_tipo, origem_id, produto_id, tipo_mov)
        do update set
          quantidade = excluded.quantidade,
          valor_unitario = excluded.valor_unitario,
          updated_at = now();
      exception
        when others then
          if not exists (
            select 1 from public.estoque_movimentos m
            where m.empresa_id = v_emp
              and m.origem_tipo = 'nfe_beneficiamento_estorno'
              and m.origem_id = v_import_id
              and m.produto_id = v_mov.produto_id
              and m.tipo_mov = 'estorno_beneficiamento'
          ) then
            insert into public.estoque_movimentos (
              empresa_id, produto_id, data_movimento,
              tipo, tipo_mov, quantidade, valor_unitario,
              origem_tipo, origem_id, lote, observacoes
            ) values (
              v_emp, v_mov.produto_id, current_date,
              'saida', 'estorno_beneficiamento', v_qtd, v_mov.valor_unitario,
              'nfe_beneficiamento_estorno', v_import_id, v_lote,
              left('Estorno de entrada para beneficiamento - recebimento='||p_recebimento_id::text, 250)
            );
          end if;
      end;

      v_rows := v_rows + 1;
    end loop;
  else
    raise exception 'Classificação inválida para estorno: %', v_classificacao;
  end if;

  update public.recebimentos
  set status = 'cancelado',
      cancelado_at = now(),
      cancelado_por = auth.uid(),
      cancelado_motivo = nullif(trim(p_motivo), ''),
      updated_at = now()
  where id = p_recebimento_id
    and empresa_id = v_emp;

  return jsonb_build_object('status','ok','movimentos_estorno',v_rows,'classificacao',v_classificacao);
end;
$$;

revoke all on function public.recebimento_cancelar(uuid, text) from public;
grant execute on function public.recebimento_cancelar(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

