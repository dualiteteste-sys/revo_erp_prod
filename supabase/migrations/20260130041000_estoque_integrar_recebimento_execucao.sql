/*
  Estoque: integrar entradas por Recebimento e baixas por Execução (consumo)

  Objetivo:
  - Garantir que "Controle de Estoque" reflita:
      - entradas via `finalizar_recebimento` (estoque_process_from_recebimento)
      - saídas via `industria_producao_consumir__unsafe`
  - Atualizar `estoque_saldos` (snapshot) e preencher saldos no kardex (`estoque_movimentos.saldo_anterior/saldo_atual`).
*/

BEGIN;

create schema if not exists public;

-- -----------------------------------------------------------------------------
-- 1) Recebimento -> estoque_process_from_recebimento (preenche saldos + snapshot)
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
  v_lote text := 'SEM_LOTE';
  v_rows int := 0;
  v_saldo_ant numeric := 0;
  v_saldo_novo numeric := 0;
  v_custo_ant numeric := 0;
  v_custo_novo numeric := 0;
begin
  select fiscal_nfe_import_id into v_import_id
  from public.recebimentos
  where id = p_recebimento_id
    and empresa_id = v_emp
  limit 1;

  if v_import_id is null then
    raise exception 'Recebimento não encontrado.';
  end if;

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

    -- lock snapshot
    select saldo, custo_medio
      into v_saldo_ant, v_custo_ant
    from public.estoque_saldos
    where empresa_id = v_emp and produto_id = v_row.produto_id
    for update;

    if not found then
      v_saldo_ant := 0;
      v_custo_ant := 0;
      insert into public.estoque_saldos (empresa_id, produto_id, saldo, custo_medio)
      values (v_emp, v_row.produto_id, 0, 0)
      on conflict (empresa_id, produto_id) do nothing;
    end if;

    v_saldo_novo := v_saldo_ant + v_row.qtd;
    if v_row.valor_unitario is not null and v_saldo_novo > 0 then
      v_custo_novo := ((v_saldo_ant * v_custo_ant) + (v_row.qtd * v_row.valor_unitario)) / v_saldo_novo;
    else
      v_custo_novo := v_custo_ant;
    end if;

    update public.estoque_saldos
    set saldo = v_saldo_novo, custo_medio = v_custo_novo, updated_at = now()
    where empresa_id = v_emp and produto_id = v_row.produto_id;

    -- lote SEM_LOTE (best-effort)
    begin
      insert into public.estoque_lotes (empresa_id, produto_id, lote, saldo)
      values (v_emp, v_row.produto_id, v_lote, v_row.qtd)
      on conflict (empresa_id, produto_id, lote)
      do update set saldo = public.estoque_lotes.saldo + excluded.saldo, updated_at = now();
    exception when undefined_table then
      null;
    end;

    -- movimento idempotente por origem
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
      v_saldo_ant, v_saldo_novo,
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
-- 2) Execução -> industria_producao_consumir__unsafe (atualiza snapshot)
-- -----------------------------------------------------------------------------
create or replace function public.industria_producao_consumir__unsafe(
    p_ordem_id uuid,
    p_componente_id uuid,
    p_lote text,
    p_quantidade numeric,
    p_etapa_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_empresa_id uuid := public.current_empresa_id();
    v_produto_id uuid;
    v_reservado_this numeric := 0;
    v_saldo_lote numeric;
    v_saldo_ant numeric := 0;
    v_saldo_novo numeric := 0;
    v_custo_ant numeric := 0;
BEGIN
    SELECT produto_id INTO v_produto_id
    FROM public.industria_producao_componentes
    WHERE id = p_componente_id AND ordem_id = p_ordem_id AND empresa_id = v_empresa_id;

    IF v_produto_id IS NULL THEN
        RAISE EXCEPTION 'Componente não encontrado.';
    END IF;

    SELECT saldo INTO v_saldo_lote
    FROM public.estoque_lotes
    WHERE empresa_id = v_empresa_id AND produto_id = v_produto_id AND lote = p_lote;

    IF v_saldo_lote < p_quantidade THEN
        RAISE EXCEPTION 'Saldo insuficiente no lote % para consumir %.', p_lote, p_quantidade;
    END IF;

    -- snapshot (lock)
    insert into public.estoque_saldos (empresa_id, produto_id, saldo, custo_medio)
    values (v_empresa_id, v_produto_id, 0, 0)
    on conflict (empresa_id, produto_id) do nothing;

    select saldo, custo_medio
      into v_saldo_ant, v_custo_ant
    from public.estoque_saldos
    where empresa_id = v_empresa_id and produto_id = v_produto_id
    for update;

    v_saldo_novo := coalesce(v_saldo_ant,0) - p_quantidade;

    update public.estoque_saldos
    set saldo = v_saldo_novo, custo_medio = v_custo_ant, updated_at = now()
    where empresa_id = v_empresa_id and produto_id = v_produto_id;

    -- Register Movement (SAIDA)
    INSERT INTO public.estoque_movimentos (
        empresa_id, produto_id, data_movimento,
        tipo, tipo_mov, quantidade,
        saldo_anterior, saldo_atual,
        custo_medio,
        origem_tipo, origem_id, lote, observacoes
    )
    VALUES (
        v_empresa_id, v_produto_id, current_date,
        'saida', 'consumo_producao', p_quantidade,
        coalesce(v_saldo_ant,0), v_saldo_novo,
        v_custo_ant,
        'ordem_producao', p_ordem_id, p_lote,
        'Consumo OP ' || (SELECT numero FROM public.industria_producao_ordens WHERE id = p_ordem_id)
    );

    -- Update Lot Balance
    UPDATE public.estoque_lotes
    SET saldo = saldo - p_quantidade, updated_at = now()
    WHERE empresa_id = v_empresa_id AND produto_id = v_produto_id AND lote = p_lote;

    -- Reservation housekeeping
    SELECT quantidade INTO v_reservado_this
    FROM public.industria_reservas
    WHERE empresa_id = v_empresa_id AND ordem_id = p_ordem_id
      AND componente_id = p_componente_id AND lote = p_lote;

    IF v_reservado_this IS NOT NULL AND v_reservado_this > 0 THEN
        UPDATE public.industria_reservas
        SET quantidade = GREATEST(0, quantidade - p_quantidade), updated_at = now()
        WHERE empresa_id = v_empresa_id AND ordem_id = p_ordem_id
          AND componente_id = p_componente_id AND lote = p_lote;

        DELETE FROM public.industria_reservas
        WHERE empresa_id = v_empresa_id AND ordem_id = p_ordem_id
          AND componente_id = p_componente_id AND lote = p_lote AND quantidade <= 0;
    END IF;

    UPDATE public.industria_producao_componentes
    SET
        quantidade_consumida = quantidade_consumida + p_quantidade,
        quantidade_reservada = (
            SELECT COALESCE(SUM(quantidade), 0)
            FROM public.industria_reservas
            WHERE empresa_id = v_empresa_id AND componente_id = p_componente_id
        ),
        updated_at = now()
    WHERE id = p_componente_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

revoke all on function public.industria_producao_consumir__unsafe(uuid, uuid, text, numeric, uuid) from public, anon, authenticated;
grant execute on function public.industria_producao_consumir__unsafe(uuid, uuid, text, numeric, uuid) to service_role, postgres;

select pg_notify('pgrst', 'reload schema');

COMMIT;

