/*
  # [MIGRATION] Adiciona RPC para definir a empresa ativa na sessão
  Esta função permite que o frontend defina um valor para a sessão do banco de dados
  que será usado por outras RPCs para garantir o isolamento de dados (multi-tenancy).

  ## Segurança:
  - SECURITY INVOKER: A função é executada com as permissões do usuário logado.
  - Validação: Verifica se o usuário é realmente membro da empresa que está tentando definir como ativa, usando a função `is_user_member_of`.
  - Reversibilidade: A função pode ser removida ou alterada sem impacto nos dados.
*/

create or replace function public.set_active_empresa(p_empresa_id uuid)
returns void
language plpgsql
security invoker -- Executa com as permissões do usuário que a chama
set search_path = pg_catalog, public
as $$
begin
  if p_empresa_id is null then
    -- Limpa a configuração se o ID for nulo
    perform set_config('app.current_empresa_id', '', false);
  else
    -- Antes de definir, verifica se o usuário tem permissão para acessar a empresa
    if not public.is_user_member_of(p_empresa_id) then
      raise exception 'Acesso negado a esta empresa.' using errcode = '42501';
    end if;

    -- Define a variável da sessão atual. O 'false' significa que persiste pela sessão.
    perform set_config('app.current_empresa_id', p_empresa_id::text, false);
  end if;
end;
$$;

-- Permissões: Apenas usuários autenticados podem executar esta função.
revoke all on function public.set_active_empresa(uuid) from public, anon;
grant execute on function public.set_active_empresa(uuid) to authenticated;
