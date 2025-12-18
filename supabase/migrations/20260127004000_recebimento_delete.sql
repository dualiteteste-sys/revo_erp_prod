/*
  # Recebimento: excluir com segurança

  - Permite excluir um recebimento (e seus itens/conferências por cascade).
  - Por padrão, bloqueia excluir recebimentos já concluídos (p_force=false).
*/

create schema if not exists public;

create or replace function public.recebimento_delete(
  p_recebimento_id uuid,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_status text;
begin
  select status into v_status
  from public.recebimentos
  where id = p_recebimento_id
    and empresa_id = v_emp
  limit 1;

  if v_status is null then
    raise exception 'Recebimento não encontrado.';
  end if;

  if v_status = 'concluido' and not p_force then
    raise exception 'Recebimento concluído não pode ser excluído. Cancele ou use exclusão forçada.';
  end if;

  delete from public.recebimentos
  where id = p_recebimento_id
    and empresa_id = v_emp;

  return jsonb_build_object('status','ok');
end;
$$;

revoke all on function public.recebimento_delete(uuid, boolean) from public;
grant execute on function public.recebimento_delete(uuid, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';

