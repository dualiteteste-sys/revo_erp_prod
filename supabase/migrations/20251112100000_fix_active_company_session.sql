/*
  # [MIGRATION] Corrige o gerenciamento de sessão da empresa ativa
  - Garante que a empresa selecionada no frontend seja comunicada ao backend.
  - `current_empresa_id()`: Função para ler o ID da empresa da sessão.
  - `set_active_empresa(uuid)`: Função para definir o ID da empresa na sessão.
*/

-- 1) Função para obter o ID da empresa ativa da sessão.
-- É `STABLE` para permitir que seja usada em RLS e índices.
create or replace function public.current_empresa_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_empresa_id', true), '')::uuid;
$$;

-- 2) Função para definir a empresa ativa na sessão do usuário.
-- É `SECURITY DEFINER` para poder usar `set_config` e verificar a permissão do usuário.
create or replace function public.set_active_empresa(p_empresa_id uuid)
returns void
language plpgsql
security definer
-- `set search_path` previne ataques de sequestro de caminho.
set search_path = pg_catalog, public
as $$
begin
  -- Se p_empresa_id for nulo, limpa a configuração da sessão.
  if p_empresa_id is null then
    perform set_config('app.current_empresa_id', null, false);
    return;
  end if;

  -- Verifica se o usuário atual é membro da empresa que está tentando definir como ativa.
  -- Isso impede que um usuário defina uma empresa à qual não pertence.
  if not public.is_user_member_of(p_empresa_id) then
    raise exception 'Acesso negado: usuário não pertence à empresa especificada.';
  end if;

  -- Define a variável de sessão. O terceiro parâmetro `false` torna a configuração
  -- válida por toda a duração da sessão de conexão, sobrevivendo a transações.
  perform set_config('app.current_empresa_id', p_empresa_id::text, false);
end;
$$;

-- 3) Permissões
-- Apenas usuários autenticados podem chamar estas funções.
revoke all on function public.current_empresa_id() from public, anon;
grant execute on function public.current_empresa_id() to authenticated, service_role, postgres;

revoke all on function public.set_active_empresa(uuid) from public, anon;
grant execute on function public.set_active_empresa(uuid) to authenticated, service_role, postgres;
