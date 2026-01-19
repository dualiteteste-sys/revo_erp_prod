/*
  FIN: Recorrências — aplicar alteração em "esta / futuras / todas em aberto"

  Motivação:
  - Quando uma conta (pagar/receber) foi gerada por recorrência (origem_tipo='RECORRENCIA'),
    o usuário precisa escolher o escopo da alteração (estado da arte):
      - somente esta ocorrência
      - esta e próximas (futuras)
      - todas em aberto (da recorrência)

  Observações:
  - Mantém segurança multi-tenant via current_empresa_id().
  - Preserva contas já pagas/baixadas/canceladas (não altera).
  - Alterações em Supabase => migration.
*/

begin;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'financeiro_recorrencia_apply_scope'
  ) then
    create type public.financeiro_recorrencia_apply_scope as enum ('single', 'future', 'all_open');
  end if;
end $$;

drop function if exists public.financeiro_recorrencias_apply_update(uuid, public.financeiro_recorrencia_apply_scope, jsonb);
create or replace function public.financeiro_recorrencias_apply_update(
  p_ocorrencia_id uuid,
  p_scope public.financeiro_recorrencia_apply_scope,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_user_id uuid := auth.uid();

  o record;
  r record;

  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_patch_propagate jsonb;

  v_updated_template int := 0;
  v_updated_accounts int := 0;
  v_skipped_locked int := 0;
begin
  if v_empresa_id is null then
    raise exception 'empresa_context_missing';
  end if;

  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if jsonb_typeof(v_patch) <> 'object' then
    raise exception 'invalid_patch';
  end if;

  select o0.*
  into o
  from public.financeiro_recorrencias_ocorrencias o0
  where o0.id = p_ocorrencia_id
    and o0.empresa_id = v_empresa_id;

  if not found then
    raise exception 'ocorrencia_not_found';
  end if;

  select r0.*
  into r
  from public.financeiro_recorrencias r0
  where r0.id = o.recorrencia_id
    and r0.empresa_id = v_empresa_id;

  if not found then
    raise exception 'recorrencia_not_found';
  end if;

  -- Guards: RBAC por domínio (contas a pagar/receber).
  if r.tipo = 'pagar' then
    perform public.require_permission_for_current_user('contas_a_pagar', 'update');
  else
    perform public.require_permission_for_current_user('contas_a_receber', 'update');
  end if;

  -- Remover campos que nunca devem propagar automaticamente.
  v_patch_propagate := v_patch
    - 'id'
    - 'empresa_id'
    - 'created_at'
    - 'updated_at'
    - 'status'
    - 'data_emissao'
    - 'data_pagamento'
    - 'valor_pago'
    - 'multa'
    - 'juros'
    - 'desconto'
    - 'saldo'
    - 'origem_tipo'
    - 'origem_id'
    - 'data_vencimento';

  if p_scope = 'single' then
    -- Somente a conta desta ocorrência (pode alterar vencimento, se enviado).
    if r.tipo = 'pagar' then
      if o.conta_pagar_id is null then
        raise exception 'conta_not_linked';
      end if;

      update public.financeiro_contas_pagar cp
      set
        descricao = case when v_patch ? 'descricao' then nullif(v_patch->>'descricao','') else cp.descricao end,
        documento_ref = case when v_patch ? 'documento_ref' then nullif(v_patch->>'documento_ref','') else cp.documento_ref end,
        observacoes = case when v_patch ? 'observacoes' then v_patch->>'observacoes' else cp.observacoes end,
        categoria = case when v_patch ? 'categoria' then nullif(v_patch->>'categoria','') else cp.categoria end,
        forma_pagamento = case when v_patch ? 'forma_pagamento' then nullif(v_patch->>'forma_pagamento','') else cp.forma_pagamento end,
        centro_de_custo_id = case when v_patch ? 'centro_de_custo_id' then nullif(v_patch->>'centro_de_custo_id','')::uuid else cp.centro_de_custo_id end,
        fornecedor_id = case when v_patch ? 'fornecedor_id' then nullif(v_patch->>'fornecedor_id','')::uuid else cp.fornecedor_id end,
        valor_total = case when v_patch ? 'valor_total' then nullif(v_patch->>'valor_total','')::numeric else cp.valor_total end,
        data_vencimento = case when v_patch ? 'data_vencimento' then nullif(v_patch->>'data_vencimento','')::date else cp.data_vencimento end
      where cp.id = o.conta_pagar_id
        and cp.empresa_id = v_empresa_id;

      get diagnostics v_updated_accounts = row_count;
    else
      if o.conta_receber_id is null then
        raise exception 'conta_not_linked';
      end if;

      update public.contas_a_receber cr
      set
        descricao = case when v_patch ? 'descricao' then nullif(v_patch->>'descricao','') else cr.descricao end,
        observacoes = case when v_patch ? 'observacoes' then v_patch->>'observacoes' else cr.observacoes end,
        centro_de_custo_id = case when v_patch ? 'centro_de_custo_id' then nullif(v_patch->>'centro_de_custo_id','')::uuid else cr.centro_de_custo_id end,
        cliente_id = case when v_patch ? 'cliente_id' then nullif(v_patch->>'cliente_id','')::uuid else cr.cliente_id end,
        valor = case when v_patch ? 'valor' then nullif(v_patch->>'valor','')::numeric else cr.valor end,
        data_vencimento = case when v_patch ? 'data_vencimento' then nullif(v_patch->>'data_vencimento','')::date else cr.data_vencimento end
      where cr.id = o.conta_receber_id
        and cr.empresa_id = v_empresa_id;

      get diagnostics v_updated_accounts = row_count;
    end if;

    return jsonb_build_object(
      'ok', true,
      'scope', p_scope,
      'empresa_id', v_empresa_id,
      'recorrencia_id', r.id,
      'ocorrencia_id', o.id,
      'updated_template', 0,
      'updated_accounts', v_updated_accounts,
      'skipped_locked', 0
    );
  end if;

  -- Escopo future/all_open: atualiza o template + contas abertas/pendentes, preservando pagas/canceladas.
  -- Se o patch não tiver nada relevante para propagação, ainda assim consideramos OK.
  if v_patch_propagate = '{}'::jsonb then
    return jsonb_build_object(
      'ok', true,
      'scope', p_scope,
      'empresa_id', v_empresa_id,
      'recorrencia_id', r.id,
      'ocorrencia_id', o.id,
      'updated_template', 0,
      'updated_accounts', 0,
      'skipped_locked', 0,
      'reason', 'no_propagatable_fields'
    );
  end if;

  update public.financeiro_recorrencias fr
  set
    descricao = case when v_patch_propagate ? 'descricao' then nullif(v_patch_propagate->>'descricao','') else fr.descricao end,
    documento_ref = case when v_patch_propagate ? 'documento_ref' then nullif(v_patch_propagate->>'documento_ref','') else fr.documento_ref end,
    observacoes = case when v_patch_propagate ? 'observacoes' then v_patch_propagate->>'observacoes' else fr.observacoes end,
    centro_de_custo_id = case when v_patch_propagate ? 'centro_de_custo_id' then nullif(v_patch_propagate->>'centro_de_custo_id','')::uuid else fr.centro_de_custo_id end,
    fornecedor_id = case when v_patch_propagate ? 'fornecedor_id' then nullif(v_patch_propagate->>'fornecedor_id','')::uuid else fr.fornecedor_id end,
    cliente_id = case when v_patch_propagate ? 'cliente_id' then nullif(v_patch_propagate->>'cliente_id','')::uuid else fr.cliente_id end,
    valor_total = case when v_patch_propagate ? 'valor_total' then nullif(v_patch_propagate->>'valor_total','')::numeric else fr.valor_total end,
    valor = case when v_patch_propagate ? 'valor' then nullif(v_patch_propagate->>'valor','')::numeric else fr.valor end,
    categoria = case when v_patch_propagate ? 'categoria' then nullif(v_patch_propagate->>'categoria','') else fr.categoria end,
    forma_pagamento = case when v_patch_propagate ? 'forma_pagamento' then nullif(v_patch_propagate->>'forma_pagamento','') else fr.forma_pagamento end
  where fr.id = r.id
    and fr.empresa_id = v_empresa_id;

  get diagnostics v_updated_template = row_count;

  if r.tipo = 'pagar' then
    -- Atualiza apenas contas em aberto.
    update public.financeiro_contas_pagar cp
    set
      descricao = case when v_patch_propagate ? 'descricao' then nullif(v_patch_propagate->>'descricao','') else cp.descricao end,
      documento_ref = case when v_patch_propagate ? 'documento_ref' then nullif(v_patch_propagate->>'documento_ref','') else cp.documento_ref end,
      observacoes = case when v_patch_propagate ? 'observacoes' then v_patch_propagate->>'observacoes' else cp.observacoes end,
      categoria = case when v_patch_propagate ? 'categoria' then nullif(v_patch_propagate->>'categoria','') else cp.categoria end,
      forma_pagamento = case when v_patch_propagate ? 'forma_pagamento' then nullif(v_patch_propagate->>'forma_pagamento','') else cp.forma_pagamento end,
      centro_de_custo_id = case when v_patch_propagate ? 'centro_de_custo_id' then nullif(v_patch_propagate->>'centro_de_custo_id','')::uuid else cp.centro_de_custo_id end,
      fornecedor_id = case when v_patch_propagate ? 'fornecedor_id' then nullif(v_patch_propagate->>'fornecedor_id','')::uuid else cp.fornecedor_id end,
      valor_total = case when v_patch_propagate ? 'valor_total' then nullif(v_patch_propagate->>'valor_total','')::numeric else cp.valor_total end
    from public.financeiro_recorrencias_ocorrencias o2
    where o2.empresa_id = v_empresa_id
      and o2.recorrencia_id = r.id
      and o2.conta_pagar_id = cp.id
      and cp.empresa_id = v_empresa_id
      and cp.status = 'aberta'
      and (
        (p_scope = 'future' and o2.seq >= o.seq)
        or (p_scope = 'all_open')
      );

    get diagnostics v_updated_accounts = row_count;
  else
    update public.contas_a_receber cr
    set
      descricao = case when v_patch_propagate ? 'descricao' then nullif(v_patch_propagate->>'descricao','') else cr.descricao end,
      observacoes = case when v_patch_propagate ? 'observacoes' then v_patch_propagate->>'observacoes' else cr.observacoes end,
      centro_de_custo_id = case when v_patch_propagate ? 'centro_de_custo_id' then nullif(v_patch_propagate->>'centro_de_custo_id','')::uuid else cr.centro_de_custo_id end,
      cliente_id = case when v_patch_propagate ? 'cliente_id' then nullif(v_patch_propagate->>'cliente_id','')::uuid else cr.cliente_id end,
      valor = case when v_patch_propagate ? 'valor' then nullif(v_patch_propagate->>'valor','')::numeric else cr.valor end
    from public.financeiro_recorrencias_ocorrencias o2
    where o2.empresa_id = v_empresa_id
      and o2.recorrencia_id = r.id
      and o2.conta_receber_id = cr.id
      and cr.empresa_id = v_empresa_id
      and cr.status in ('pendente','vencido')
      and (
        (p_scope = 'future' and o2.seq >= o.seq)
        or (p_scope = 'all_open')
      );

    get diagnostics v_updated_accounts = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'scope', p_scope,
    'empresa_id', v_empresa_id,
    'recorrencia_id', r.id,
    'ocorrencia_id', o.id,
    'updated_template', v_updated_template,
    'updated_accounts', v_updated_accounts,
    'skipped_locked', v_skipped_locked
  );
end;
$$;

revoke all on function public.financeiro_recorrencias_apply_update(uuid, public.financeiro_recorrencia_apply_scope, jsonb) from public, anon;
grant execute on function public.financeiro_recorrencias_apply_update(uuid, public.financeiro_recorrencia_apply_scope, jsonb) to authenticated, service_role;

commit;

