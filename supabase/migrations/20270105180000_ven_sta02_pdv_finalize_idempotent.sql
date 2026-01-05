/*
  VEN-STA-02: PDV resiliente (idempotência server-side)

  Motivo
  - O fluxo anterior finalizava PDV via 3 chamadas (vendas_upsert_pedido + financeiro_movimentacoes_upsert + vendas_baixar_estoque),
    o que podia gerar efeitos colaterais duplicados em caso de retry/timeouts.

  O que muda
  - Introduz `public.vendas_pdv_finalize_v2(...)` que finaliza o PDV em 1 transação, com lock por pedido e sem duplicar:
    - status/canal do pedido
    - movimento financeiro (origem_tipo='venda_pdv', origem_id=<pedido_id>)
    - baixa de estoque (já idempotente via vendas_baixar_estoque)

  Impacto
  - Mais confiável para retries (offline-lite, timeouts, double-click, refresh).

  Reversibilidade
  - Seguro: é apenas uma função nova. Se necessário, pode-se fazer rollback removendo a função.
*/

begin;

create or replace function public.vendas_pdv_finalize_v2(
  p_pedido_id uuid,
  p_conta_corrente_id uuid,
  p_baixar_estoque boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_row public.vendas_pedidos%rowtype;
  v_doc text;
  v_mov_id uuid;
  v_mov jsonb;
begin
  perform public.require_permission_for_current_user('vendas', 'update');

  if v_emp is null then
    raise exception '[PDV][finalize] Nenhuma empresa ativa encontrada' using errcode = '42501';
  end if;

  if p_pedido_id is null then
    raise exception '[PDV][finalize] pedido_id é obrigatório' using errcode = '22004';
  end if;
  if p_conta_corrente_id is null then
    raise exception '[PDV][finalize] conta_corrente_id é obrigatório' using errcode = '22004';
  end if;

  -- Lock por pedido para evitar double-click/retry concorrente
  perform pg_advisory_xact_lock(hashtextextended(p_pedido_id::text, 0));

  select *
    into v_row
    from public.vendas_pedidos p
   where p.id = p_pedido_id
     and p.empresa_id = v_emp
   for update;

  if not found then
    raise exception '[PDV][finalize] Pedido não encontrado na empresa atual' using errcode = 'P0002';
  end if;

  if v_row.status = 'cancelado' then
    raise exception '[PDV][finalize] Pedido cancelado não pode ser finalizado' using errcode = 'P0001';
  end if;

  v_doc := 'PDV-' || v_row.numero::text;

  -- Finaliza pedido (idempotente por estado)
  update public.vendas_pedidos
     set canal = 'pdv',
         status = 'concluido',
         updated_at = now()
   where id = v_row.id
     and empresa_id = v_emp;

  -- Financeiro: garante movimento único por origem (idempotente)
  select m.id
    into v_mov_id
    from public.financeiro_movimentacoes m
   where m.empresa_id = v_emp
     and m.origem_tipo = 'venda_pdv'
     and m.origem_id = v_row.id
   limit 1;

  if v_mov_id is null then
    begin
      v_mov := public.financeiro_movimentacoes_upsert(
        jsonb_build_object(
          'conta_corrente_id', p_conta_corrente_id,
          'tipo_mov', 'entrada',
          'valor', v_row.total_geral,
          'descricao', 'Venda PDV #' || v_row.numero::text,
          'documento_ref', v_doc,
          'origem_tipo', 'venda_pdv',
          'origem_id', v_row.id,
          'categoria', 'Vendas',
          'observacoes', 'Gerado automaticamente pelo PDV'
        )
      );
      v_mov_id := nullif(v_mov->>'id','')::uuid;
    exception
      when unique_violation then
        -- Se houver índice único por origem, um retry concorrente pode bater aqui; busca o existente.
        select m.id
          into v_mov_id
          from public.financeiro_movimentacoes m
         where m.empresa_id = v_emp
           and m.origem_tipo = 'venda_pdv'
           and m.origem_id = v_row.id
         limit 1;
    end;
  end if;

  if v_mov_id is not null then
    v_mov := public.financeiro_movimentacoes_get(v_mov_id);

    -- Se ainda não conciliado, permite corrigir conta_corrente_id sem duplicar (ex.: tentativa anterior).
    if (v_mov->>'conciliado')::boolean is false
       and nullif(v_mov->>'conta_corrente_id','')::uuid is distinct from p_conta_corrente_id then
      begin
        v_mov := public.financeiro_movimentacoes_upsert(
          jsonb_build_object(
            'id', v_mov_id,
            'conta_corrente_id', p_conta_corrente_id,
            'tipo_mov', 'entrada',
            'valor', v_row.total_geral,
            'descricao', 'Venda PDV #' || v_row.numero::text,
            'documento_ref', v_doc,
            'origem_tipo', 'venda_pdv',
            'origem_id', v_row.id,
            'categoria', 'Vendas',
            'observacoes', 'Atualizado automaticamente pelo PDV (correção de conta)'
          )
        );
      exception
        when others then
          -- Não bloqueia finalize: mantém o registro existente.
          null;
      end;
    end if;
  end if;

  if p_baixar_estoque then
    perform public.vendas_baixar_estoque(v_row.id, v_doc);
  end if;

  return jsonb_build_object(
    'ok', true,
    'pedido_id', v_row.id,
    'documento_ref', v_doc,
    'financeiro_movimentacao_id', v_mov_id,
    'estoque_baixado_at', (select p.estoque_baixado_at from public.vendas_pedidos p where p.id = v_row.id)
  );
end;
$$;

revoke all on function public.vendas_pdv_finalize_v2(uuid, uuid, boolean) from public;
grant execute on function public.vendas_pdv_finalize_v2(uuid, uuid, boolean) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';

