-- Replanejamento: mover operação de produção entre centros e ajustar prioridade
begin;

create or replace function public.industria_operacao_replanejar(
  p_operacao_id uuid,
  p_novo_centro uuid,
  p_nova_prioridade int default null
) returns void
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
begin
  update public.industria_producao_operacoes
     set centro_trabalho_id = coalesce(p_novo_centro, centro_trabalho_id)
   where id = p_operacao_id
     and empresa_id = public.current_empresa_id();

  if p_nova_prioridade is not null then
    update public.industria_producao_ordens
       set prioridade = p_nova_prioridade
     where id = (select ordem_id from public.industria_producao_operacoes where id = p_operacao_id);
  end if;

  perform pg_notify('app_log', '[RPC] industria_operacao_replanejar op='||p_operacao_id||' ct='||p_novo_centro||' prio='||coalesce(p_nova_prioridade, -1));
end;
$$;

grant execute on function public.industria_operacao_replanejar(uuid, uuid, int) to authenticated, service_role;

commit;
