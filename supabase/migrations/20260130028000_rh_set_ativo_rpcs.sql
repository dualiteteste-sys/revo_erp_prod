/*
  RH: RPCs utilitárias para ativar/inativar registros

  Motivo:
  - Evitar que a UI precise reenviar payload completo (ex.: nome/setor) apenas para alternar o status.
  - Manter fluxo "Ativar/Inativar" consistente com outras telas (cadastros).
*/

begin;

create or replace function public.rh_set_cargo_ativo(
  p_id uuid,
  p_ativo boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.rh_cargos
  set ativo = p_ativo
  where id = p_id
    and empresa_id = public.current_empresa_id();

  if not found then
    raise exception '[RH][rh_set_cargo_ativo] Cargo não encontrado.' using errcode = 'P0001';
  end if;

  perform pg_notify('app_log', '[RPC] rh_set_cargo_ativo ' || p_id || ' -> ' || p_ativo::text);
end;
$$;

create or replace function public.rh_set_colaborador_ativo(
  p_id uuid,
  p_ativo boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.rh_colaboradores
  set ativo = p_ativo
  where id = p_id
    and empresa_id = public.current_empresa_id();

  if not found then
    raise exception '[RH][rh_set_colaborador_ativo] Colaborador não encontrado.' using errcode = 'P0001';
  end if;

  perform pg_notify('app_log', '[RPC] rh_set_colaborador_ativo ' || p_id || ' -> ' || p_ativo::text);
end;
$$;

revoke all on function public.rh_set_cargo_ativo(uuid, boolean) from public, anon;
grant execute on function public.rh_set_cargo_ativo(uuid, boolean) to authenticated, service_role;

revoke all on function public.rh_set_colaborador_ativo(uuid, boolean) from public, anon;
grant execute on function public.rh_set_colaborador_ativo(uuid, boolean) to authenticated, service_role;

commit;

