-- Adjusts juros/multa on a título (conta a pagar or conta a receber)
-- Used by the conciliation drawer to match extrato value when extrato > título saldo

create or replace function public.financeiro_titulo_ajustar_acrescimo(
  p_titulo_id uuid,
  p_tipo text,         -- 'pagar' | 'receber'
  p_juros numeric default 0,
  p_multa numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_old_juros numeric;
  v_old_multa numeric;
  v_old_valor numeric;
begin
  perform public.require_permission_for_current_user('financeiro', 'update');

  if p_tipo not in ('pagar', 'receber') then
    raise exception 'Tipo inválido: %. Use pagar ou receber.', p_tipo
      using errcode = 'P0001';
  end if;

  if p_tipo = 'pagar' then
    select juros, multa
      into v_old_juros, v_old_multa
    from public.financeiro_contas_pagar
    where id = p_titulo_id
      and empresa_id = v_empresa
    for update;

    if not found then
      raise exception 'Título a pagar não encontrado.' using errcode = 'P0001';
    end if;

    update public.financeiro_contas_pagar
    set juros = round(coalesce(p_juros, juros), 2),
        multa = round(coalesce(p_multa, multa), 2)
    where id = p_titulo_id
      and empresa_id = v_empresa;

    return jsonb_build_object(
      'ok', true,
      'tipo', 'pagar',
      'old_juros', v_old_juros,
      'new_juros', round(coalesce(p_juros, v_old_juros), 2),
      'old_multa', v_old_multa,
      'new_multa', round(coalesce(p_multa, v_old_multa), 2)
    );

  else -- receber
    select valor
      into v_old_valor
    from public.contas_a_receber
    where id = p_titulo_id
      and empresa_id = v_empresa
    for update;

    if not found then
      raise exception 'Título a receber não encontrado.' using errcode = 'P0001';
    end if;

    -- contas_a_receber não tem campos juros/multa, ajusta o valor base
    update public.contas_a_receber
    set valor = round(v_old_valor + coalesce(p_juros, 0) + coalesce(p_multa, 0), 2)
    where id = p_titulo_id
      and empresa_id = v_empresa;

    return jsonb_build_object(
      'ok', true,
      'tipo', 'receber',
      'old_valor', v_old_valor,
      'new_valor', round(v_old_valor + coalesce(p_juros, 0) + coalesce(p_multa, 0), 2)
    );
  end if;
end;
$$;

revoke all on function public.financeiro_titulo_ajustar_acrescimo(uuid, text, numeric, numeric)
  from public, anon;
grant execute on function public.financeiro_titulo_ajustar_acrescimo(uuid, text, numeric, numeric)
  to authenticated, service_role;
