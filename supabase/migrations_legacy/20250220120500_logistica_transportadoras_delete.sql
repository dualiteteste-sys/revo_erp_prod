/*
  # Logística - Adicionar RPC de Exclusão

  ## Query Description
  Adiciona a função RPC faltante para excluir transportadoras, respeitando o RLS.

  ## Impact Summary
  - Segurança: SECURITY DEFINER com search_path restrito.
  - Compatibilidade: Cria função se não existir.
*/

create or replace function public.logistica_transportadoras_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.logistica_transportadoras
  where id = p_id
    and empresa_id = public.current_empresa_id();
end;
$$;

revoke all on function public.logistica_transportadoras_delete from public;
grant execute on function public.logistica_transportadoras_delete to authenticated, service_role;
