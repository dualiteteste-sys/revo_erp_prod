/*
  FIN-STA-02: fix (RBAC + SEC/RG-03)

  Motivo
  - RG-03/SEC-02 exige que RPCs SECURITY DEFINER usadas pelo app tenham guard de permissão.
  - A Tesouraria (financeiro_movimentacoes_upsert) precisa manter o enforcement de RBAC
    e ainda suportar `centro_de_custo_id`.
*/

begin;

create or replace function public.financeiro_movimentacoes_upsert(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid;
  v_tipo text;
  v_valor numeric;
  v_cc_id uuid;
  v_centro_id uuid := nullif(p_payload->>'centro_de_custo_id','')::uuid;
begin
  if p_payload->>'id' is null then
    perform public.require_permission_for_current_user('tesouraria','create');
  else
    perform public.require_permission_for_current_user('tesouraria','update');
  end if;

  v_tipo := coalesce(p_payload->>'tipo_mov', 'entrada');
  v_valor := (p_payload->>'valor')::numeric;
  v_cc_id := (p_payload->>'conta_corrente_id')::uuid;

  if v_cc_id is null then
    raise exception 'conta_corrente_id é obrigatório.';
  end if;
  if v_tipo not in ('entrada','saida') then
    raise exception 'tipo_mov inválido.';
  end if;
  if v_valor is null or v_valor <= 0 then
    raise exception 'valor inválido.';
  end if;

  perform public._fin04_assert_centro_de_custo(v_centro_id);

  if p_payload->>'id' is not null then
    update public.financeiro_movimentacoes m
    set
      conta_corrente_id   = v_cc_id,
      data_movimento      = coalesce((p_payload->>'data_movimento')::date, data_movimento),
      data_competencia    = (p_payload->>'data_competencia')::date,
      tipo_mov            = v_tipo,
      valor               = v_valor,
      descricao           = p_payload->>'descricao',
      documento_ref       = p_payload->>'documento_ref',
      origem_tipo         = p_payload->>'origem_tipo',
      origem_id           = nullif(p_payload->>'origem_id','')::uuid,
      categoria           = p_payload->>'categoria',
      centro_custo        = p_payload->>'centro_custo',
      centro_de_custo_id  = v_centro_id,
      observacoes         = p_payload->>'observacoes'
    where m.id = (p_payload->>'id')::uuid
      and m.empresa_id = v_empresa
    returning m.id into v_id;
  else
    insert into public.financeiro_movimentacoes (
      empresa_id, conta_corrente_id, data_movimento, data_competencia, tipo_mov, valor,
      descricao, documento_ref, origem_tipo, origem_id, categoria, centro_custo, centro_de_custo_id, conciliado, observacoes
    ) values (
      v_empresa,
      v_cc_id,
      coalesce((p_payload->>'data_movimento')::date, current_date),
      (p_payload->>'data_competencia')::date,
      v_tipo,
      v_valor,
      p_payload->>'descricao',
      p_payload->>'documento_ref',
      p_payload->>'origem_tipo',
      nullif(p_payload->>'origem_id','')::uuid,
      p_payload->>'categoria',
      p_payload->>'centro_custo',
      v_centro_id,
      coalesce((p_payload->>'conciliado')::boolean, false),
      p_payload->>'observacoes'
    )
    returning id into v_id;
  end if;

  perform pg_notify('app_log', '[RPC] financeiro_movimentacoes_upsert: ' || v_id);
  return public.financeiro_movimentacoes_get(v_id);
end;
$$;

revoke all on function public.financeiro_movimentacoes_upsert(jsonb) from public;
grant execute on function public.financeiro_movimentacoes_upsert(jsonb) to authenticated, service_role;

commit;

