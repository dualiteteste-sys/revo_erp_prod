/*
  SUP-STA-04 — Landed cost (rateio de frete/impostos/outros no Recebimento)

  Motivo
  - Hoje o custo médio do estoque via Recebimento usa apenas o valor unitário do XML (fi.vuncom).
  - Isso ignora custos acessórios (frete/seguro/impostos/outros) e distorce margem, relatório e valuation.

  O que muda
  - Adiciona campos de custos adicionais em `public.recebimentos`.
  - Atualiza `public.estoque_process_from_recebimento(p_recebimento_id)` para ratear o total adicional por item
    (base por valor dos itens ou por quantidade) e incorporar no custo médio e no `valor_unitario` do movimento.

  Impacto
  - Apenas correção de dados/fluxo de custo (não cria novas tabelas).
  - Idempotente: `ADD COLUMN IF NOT EXISTS` + `CREATE OR REPLACE FUNCTION`.

  Reversibilidade
  - Reverter os `ALTER TABLE` (drop columns) e restaurar a versão anterior da function em uma migração futura.
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) Campos de landed cost no Recebimento
-- -----------------------------------------------------------------------------
alter table if exists public.recebimentos
  add column if not exists custo_frete numeric(18,2) not null default 0,
  add column if not exists custo_seguro numeric(18,2) not null default 0,
  add column if not exists custo_impostos numeric(18,2) not null default 0,
  add column if not exists custo_outros numeric(18,2) not null default 0,
  add column if not exists rateio_base text not null default 'valor';

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'recebimentos'
      and constraint_name = 'recebimentos_rateio_base_chk'
  ) then
    alter table public.recebimentos
      add constraint recebimentos_rateio_base_chk
      check (rateio_base in ('valor','quantidade'));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2) Recebimento -> estoque_process_from_recebimento (rateio no custo unitário)
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

  -- landed cost
  v_rateio_base text := 'valor';
  v_custo_frete numeric := 0;
  v_custo_seguro numeric := 0;
  v_custo_impostos numeric := 0;
  v_custo_outros numeric := 0;
  v_total_adicional numeric := 0;
  v_base_total numeric := 0;
  v_item_base numeric := 0;
  v_item_share numeric := 0;
  v_adicional_unit numeric := 0;
  v_valor_unitario_eff numeric := 0;
begin
  select
    r.fiscal_nfe_import_id,
    coalesce(nullif(btrim(r.rateio_base),''),'valor'),
    coalesce(r.custo_frete,0),
    coalesce(r.custo_seguro,0),
    coalesce(r.custo_impostos,0),
    coalesce(r.custo_outros,0)
  into
    v_import_id,
    v_rateio_base,
    v_custo_frete,
    v_custo_seguro,
    v_custo_impostos,
    v_custo_outros
  from public.recebimentos r
  where r.id = p_recebimento_id
    and r.empresa_id = v_emp
  limit 1;

  if v_import_id is null then
    raise exception 'Recebimento não encontrado.';
  end if;

  if v_rateio_base not in ('valor','quantidade') then
    v_rateio_base := 'valor';
  end if;

  v_total_adicional := coalesce(v_custo_frete,0) + coalesce(v_custo_seguro,0) + coalesce(v_custo_impostos,0) + coalesce(v_custo_outros,0);

  -- base para rateio (valor total dos itens ou quantidade total)
  select
    case
      when v_rateio_base = 'quantidade' then coalesce(sum(coalesce(nullif(ri.quantidade_conferida, 0), ri.quantidade_xml)), 0)
      else coalesce(sum(coalesce(nullif(ri.quantidade_conferida, 0), ri.quantidade_xml) * coalesce(fi.vuncom, 0)), 0)
    end
  into v_base_total
  from public.recebimento_itens ri
  join public.fiscal_nfe_import_items fi
    on fi.id = ri.fiscal_nfe_item_id
   and fi.empresa_id = v_emp
  where ri.recebimento_id = p_recebimento_id
    and ri.empresa_id = v_emp
    and ri.produto_id is not null;

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
        fi.vuncom as valor_unitario_xml,
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

      -- rateio do adicional para este item
      if v_total_adicional > 0 and v_base_total > 0 then
        if v_rateio_base = 'quantidade' then
          v_item_base := coalesce(v_row.qtd,0);
        else
          v_item_base := coalesce(v_row.qtd,0) * coalesce(v_row.valor_unitario_xml,0);
        end if;
        v_item_share := v_item_base / v_base_total;
        v_adicional_unit := (v_total_adicional * v_item_share) / v_row.qtd;
      else
        v_adicional_unit := 0;
      end if;

      v_valor_unitario_eff := coalesce(v_row.valor_unitario_xml,0) + coalesce(v_adicional_unit,0);

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
      if v_valor_unitario_eff is not null and v_saldo_novo > 0 then
        v_custo_novo := ((v_saldo_ant * v_custo_ant) + (v_row.qtd * v_valor_unitario_eff)) / v_saldo_novo;
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
        nullif(v_valor_unitario_eff, 0),
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

    return jsonb_build_object('status','ok','movimentos',v_rows,'deposito_id',v_dep,'landed_total',v_total_adicional,'rateio_base',v_rateio_base);
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
      fi.vuncom as valor_unitario_xml,
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

    if v_total_adicional > 0 and v_base_total > 0 then
      if v_rateio_base = 'quantidade' then
        v_item_base := coalesce(v_row.qtd,0);
      else
        v_item_base := coalesce(v_row.qtd,0) * coalesce(v_row.valor_unitario_xml,0);
      end if;
      v_item_share := v_item_base / v_base_total;
      v_adicional_unit := (v_total_adicional * v_item_share) / v_row.qtd;
    else
      v_adicional_unit := 0;
    end if;

    v_valor_unitario_eff := coalesce(v_row.valor_unitario_xml,0) + coalesce(v_adicional_unit,0);

    select saldo, custo_medio
      into v_saldo_ant, v_custo_ant
    from public.estoque_saldos
    where empresa_id = v_emp and produto_id = v_row.produto_id
    for update;

    v_saldo_novo := coalesce(v_saldo_ant,0) + v_row.qtd;
    if v_valor_unitario_eff is not null and v_saldo_novo > 0 then
      v_custo_novo := ((coalesce(v_saldo_ant,0) * coalesce(v_custo_ant,0)) + (v_row.qtd * v_valor_unitario_eff)) / v_saldo_novo;
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
      nullif(v_valor_unitario_eff, 0),
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

  return jsonb_build_object('status','ok','movimentos',v_rows,'landed_total',v_total_adicional,'rateio_base',v_rateio_base);
end;
$$;

revoke all on function public.estoque_process_from_recebimento(uuid) from public;
grant execute on function public.estoque_process_from_recebimento(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

