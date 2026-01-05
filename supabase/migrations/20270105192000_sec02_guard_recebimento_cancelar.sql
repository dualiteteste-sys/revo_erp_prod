/*
  SEC-02/RG-03: Garantir guard de permissão em `recebimento_cancelar`

  Contexto
  - `scripts/rg03_db_asserts.sql` valida que certas RPCs SECURITY DEFINER usadas pelo app
    contêm `require_permission_for_current_user(...)` no corpo.
  - A versão "multi-estoque" de `recebimento_cancelar` reintroduzida em `20270105184000`
    estava sem o guard explícito (apesar do fluxo depender de permissão).

  O que faz
  - Reaplica `require_plano_mvp_allows('suprimentos')` e `require_permission_for_current_user('suprimentos','update')`
    no início da function, mantendo a lógica existente.
*/

begin;

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
  perform public.require_plano_mvp_allows('suprimentos');
  perform public.require_permission_for_current_user('suprimentos','update');

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

      v_rows := v_rows + 1;
    end loop;
  elsif v_classificacao = 'material_cliente' then
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

