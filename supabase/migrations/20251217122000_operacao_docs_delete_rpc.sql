-- RPC para excluir documento (registro). O arquivo no storage deve ser removido no cliente.
begin;

drop function if exists public.industria_operacao_doc_delete(uuid);
create or replace function public.industria_operacao_doc_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  delete from public.industria_operacao_documentos d
   where d.id = p_id
     and d.empresa_id = public.current_empresa_id();
end;
$$;

revoke all on function public.industria_operacao_doc_delete(uuid) from public;
grant execute on function public.industria_operacao_doc_delete(uuid) to authenticated, service_role;

commit;

