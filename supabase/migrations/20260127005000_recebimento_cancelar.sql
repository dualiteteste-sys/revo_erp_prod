/*
  # Recebimento: estorno/cancelamento (para concluídos)

  Objetivo:
  - Não permitir "excluir" recebimentos concluídos (rastreabilidade).
  - Permitir CANCELAR/ESTORNAR um recebimento concluído, revertendo impactos no estoque.

  Regras:
  - Somente recebimentos com status = 'concluido' podem ser cancelados.
  - Marca recebimento como 'cancelado' e registra motivo.
  - Para `classificacao='estoque_proprio'`: cria movimentos de saída (estorno) e ajusta estoque_lotes (best-effort).
  - Para `classificacao='material_cliente'`: cria movimentos de saída (estorno) contra `entrada_beneficiamento` (best-effort).
*/

create schema if not exists public;

alter table public.recebimentos
  add column if not exists cancelado_at timestamptz,
  add column if not exists cancelado_por uuid,
  add column if not exists cancelado_motivo text;

create index if not exists idx_recebimentos_cancelado
  on public.recebimentos (empresa_id, cancelado_at);

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
    -- Legado/ambiente antigo: assume estoque próprio para permitir estorno.
    v_classificacao := 'estoque_proprio';
  end if;

  -- 1) ESTOQUE PRÓPRIO: estorno baseado nos itens do recebimento
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

      -- Ajuste de saldo por lote (best-effort)
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

      -- Movimento de estorno (idempotente quando existir unique de origem)
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
        when undefined_column then
          insert into public.estoque_movimentos (
            empresa_id, produto_id, data_movimento,
            tipo, tipo_mov, quantidade,
            origem_tipo, origem_id, lote, observacoes
          ) values (
            v_emp, v_item.produto_id, current_date,
            'saida', 'estorno_nfe', v_qtd,
            'recebimento_estorno', p_recebimento_id, v_lote,
            left('Estorno de Recebimento (NF-e) - '||coalesce(nullif(v_item.xprod,''),'item'), 250)
          );
        when others then
          -- Sem unique p/ ON CONFLICT: evita duplicar se já existir
          if not exists (
            select 1 from public.estoque_movimentos m
            where m.empresa_id = v_emp
              and m.origem_tipo = 'recebimento_estorno'
              and m.origem_id = p_recebimento_id
              and m.produto_id = v_item.produto_id
              and m.tipo_mov = 'estorno_nfe'
          ) then
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
              );
            exception when undefined_column then
              insert into public.estoque_movimentos (
                empresa_id, produto_id, data_movimento,
                tipo, tipo_mov, quantidade,
                origem_tipo, origem_id, lote, observacoes
              ) values (
                v_emp, v_item.produto_id, current_date,
                'saida', 'estorno_nfe', v_qtd,
                'recebimento_estorno', p_recebimento_id, v_lote,
                left('Estorno de Recebimento (NF-e) - '||coalesce(nullif(v_item.xprod,''),'item'), 250)
              );
            end;
          end if;
      end;

      v_rows := v_rows + 1;
    end loop;

  -- 2) MATERIAL DO CLIENTE: estorno best-effort baseado em movimentos de beneficiamento
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
        when undefined_column then
          insert into public.estoque_movimentos (
            empresa_id, produto_id, data_movimento,
            tipo, tipo_mov, quantidade,
            origem_tipo, origem_id, lote, observacoes
          ) values (
            v_emp, v_mov.produto_id, current_date,
            'saida', 'estorno_beneficiamento', v_qtd,
            'nfe_beneficiamento_estorno', v_import_id, v_lote,
            left('Estorno de entrada para beneficiamento - recebimento='||p_recebimento_id::text, 250)
          );
        when others then
          if not exists (
            select 1 from public.estoque_movimentos m
            where m.empresa_id = v_emp
              and m.origem_tipo = 'nfe_beneficiamento_estorno'
              and m.origem_id = v_import_id
              and m.produto_id = v_mov.produto_id
              and m.tipo_mov = 'estorno_beneficiamento'
          ) then
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
              );
            exception when undefined_column then
              insert into public.estoque_movimentos (
                empresa_id, produto_id, data_movimento,
                tipo, tipo_mov, quantidade,
                origem_tipo, origem_id, lote, observacoes
              ) values (
                v_emp, v_mov.produto_id, current_date,
                'saida', 'estorno_beneficiamento', v_qtd,
                'nfe_beneficiamento_estorno', v_import_id, v_lote,
                left('Estorno de entrada para beneficiamento - recebimento='||p_recebimento_id::text, 250)
              );
            end;
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

