/*
  OS-02 Permissões por etapa (técnico vs gestor)

  Regras mínimas:
  - Transições críticas (concluir/cancelar) exigem `os.manage`
  - Edição de OS concluída/cancelada exige `os.manage` (senão read-only)
*/

begin;

create or replace function public._os02_assert_can_edit_os(p_os_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_status public.status_os;
begin
  if v_empresa is null then
    raise exception 'empresa_id inválido' using errcode = '42501';
  end if;

  select os.status into v_status
  from public.ordem_servicos os
  where os.id = p_os_id and os.empresa_id = v_empresa;

  if v_status is null then
    raise exception 'OS não encontrada' using errcode = 'P0002';
  end if;

  if v_status in ('concluida'::public.status_os, 'cancelada'::public.status_os) then
    perform public.require_permission_for_current_user('os','manage');
  end if;
end;
$$;

revoke all on function public._os02_assert_can_edit_os(uuid) from public;
grant execute on function public._os02_assert_can_edit_os(uuid) to authenticated, service_role;

-- Status: concluir/cancelar exige manage
create or replace function public.os_set_status_for_current_user(
  p_os_id uuid,
  p_next public.status_os,
  p_opts jsonb default '{}'::jsonb
)
returns public.ordem_servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_next in ('concluida'::public.status_os, 'cancelada'::public.status_os) then
    perform public.require_permission_for_current_user('os','manage');
  else
    perform public.require_permission_for_current_user('os','update');
  end if;

  return public.os_set_status_for_current_user__unsafe(p_os_id, p_next, p_opts);
end;
$$;

revoke all on function public.os_set_status_for_current_user(uuid, public.status_os, jsonb) from public;
grant execute on function public.os_set_status_for_current_user(uuid, public.status_os, jsonb) to authenticated, service_role;

-- Edição: quando concluída/cancelada, só manage
create or replace function public.update_os_for_current_user(p_id uuid, payload jsonb)
returns public.ordem_servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.require_permission_for_current_user('os','update');
  perform public._os02_assert_can_edit_os(p_id);
  return public.update_os_for_current_user__unsafe(p_id, payload);
end;
$$;

revoke all on function public.update_os_for_current_user(uuid, jsonb) from public;
grant execute on function public.update_os_for_current_user(uuid, jsonb) to authenticated, service_role;

create or replace function public.add_os_item_for_current_user(
  p_os_id uuid,
  payload jsonb
)
returns public.ordem_servico_itens
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.require_permission_for_current_user('os','update');
  perform public._os02_assert_can_edit_os(p_os_id);
  return public.add_os_item_for_current_user__unsafe(p_os_id, payload);
end;
$$;

revoke all on function public.add_os_item_for_current_user(uuid, jsonb) from public;
grant execute on function public.add_os_item_for_current_user(uuid, jsonb) to authenticated, service_role;

create or replace function public.delete_os_item_for_current_user(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_os_id uuid;
begin
  perform public.require_permission_for_current_user('os','update');

  select i.ordem_servico_id into v_os_id
  from public.ordem_servico_itens i
  where i.id = p_item_id and i.empresa_id = public.current_empresa_id();

  if v_os_id is null then
    raise exception 'Item não encontrado' using errcode = 'P0002';
  end if;

  perform public._os02_assert_can_edit_os(v_os_id);
  perform public.delete_os_item_for_current_user__unsafe(p_item_id);
end;
$$;

revoke all on function public.delete_os_item_for_current_user(uuid) from public;
grant execute on function public.delete_os_item_for_current_user(uuid) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

commit;

