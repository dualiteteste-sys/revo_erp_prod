/*
  Tesouraria → Conciliação
  Estado da arte: “Reverter conciliação” deve desfazer o efeito financeiro
  SOMENTE quando for seguro (ex.: movimentação criada pela própria conciliação do extrato).

  Caso a movimentação tenha sido criada fora desse fluxo (manual / outro módulo),
  a reversão faz apenas o desvínculo e retorna uma mensagem clara.
*/

begin;

create or replace function public.financeiro_extratos_bancarios_reverter_conciliacao(p_extrato_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_extrato record;
  v_mov record;
  v_mov_id uuid;
  v_safe_to_delete boolean := false;
begin
  perform public.require_permission_for_current_user('tesouraria','manage');

  perform pg_advisory_xact_lock(hashtextextended(p_extrato_id::text, 0));

  select *
  into v_extrato
  from public.financeiro_extratos_bancarios e
  where e.id = p_extrato_id
    and e.empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'Extrato não encontrado ou acesso negado.';
  end if;

  v_mov_id := v_extrato.movimentacao_id;

  -- Sempre desvincula o extrato (idempotente)
  perform public.financeiro_extratos_bancarios_desvincular(p_extrato_id);

  if v_mov_id is null then
    return jsonb_build_object(
      'kind', 'noop',
      'message', 'Extrato já estava sem movimentação vinculada.'
    );
  end if;

  select *
  into v_mov
  from public.financeiro_movimentacoes m
  where m.id = v_mov_id
    and m.empresa_id = v_empresa
  for update;

  if not found then
    return jsonb_build_object(
      'kind', 'unlinked_only',
      'message', 'Vínculo removido, mas a movimentação vinculada não foi encontrada (possivelmente já removida).',
      'movimentacao_id', v_mov_id
    );
  end if;

  -- Só é seguro apagar quando a movimentação foi criada especificamente para conciliar ESTE extrato.
  v_safe_to_delete :=
    v_mov.origem_tipo like 'tesouraria_conciliacao_extrato%'
    and v_mov.origem_id = p_extrato_id
    and not exists (
      select 1
      from public.financeiro_extratos_bancarios_movimentacoes x
      where x.empresa_id = v_empresa
        and x.movimentacao_id = v_mov_id
        and x.extrato_id <> p_extrato_id
    )
    and not exists (
      select 1
      from public.financeiro_extratos_bancarios e2
      where e2.empresa_id = v_empresa
        and e2.movimentacao_id = v_mov_id
        and e2.id <> p_extrato_id
    );

  if v_safe_to_delete then
    begin
      delete from public.financeiro_movimentacoes m
      where m.id = v_mov_id
        and m.empresa_id = v_empresa;
    exception
      when foreign_key_violation then
        -- Segurança: não apagar se houver dependências.
        return jsonb_build_object(
          'kind', 'unlinked_only',
          'message', 'Vínculo removido, mas a movimentação possui dependências e não pode ser apagada. Faça estorno/ajuste pelo módulo de origem.',
          'movimentacao_id', v_mov_id
        );
    end;

    return jsonb_build_object(
      'kind', 'deleted_movimentacao',
      'message', 'Conciliação revertida: vínculo removido e movimentação gerada pela conciliação foi apagada.',
      'movimentacao_id', v_mov_id
    );
  end if;

  return jsonb_build_object(
    'kind', 'unlinked_only',
    'message', 'Vínculo removido. A movimentação não foi apagada porque não foi criada pela conciliação do extrato.',
    'movimentacao_id', v_mov_id
  );
end;
$$;

revoke all on function public.financeiro_extratos_bancarios_reverter_conciliacao(uuid) from public, anon;
grant execute on function public.financeiro_extratos_bancarios_reverter_conciliacao(uuid) to authenticated, service_role;

commit;

