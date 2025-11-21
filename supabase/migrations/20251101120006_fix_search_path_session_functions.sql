/*
  # [MIGRATION] Fix: Normaliza Search Path em Funções de Sessão
  - Adiciona `set search_path` às funções `set_active_empresa` e `current_empresa_id` para mitigar o aviso de segurança "Function Search Path Mutable".
  - Garante que as funções operem em um escopo de schema previsível e seguro.
*/

-- 1) Redefine a função para definir a empresa ativa na sessão
create or replace function public.set_active_empresa(p_empresa_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Valida se o usuário pertence à empresa
  if not public.is_user_member_of(p_empresa_id) then
    raise exception 'Acesso negado: usuário não pertence a esta empresa.' using errcode = '42501';
  end if;
  
  -- Define a variável de sessão
  perform set_config('revo.current_empresa_id', p_empresa_id::text, false);
end;
$$;

-- 2) Redefine a função para obter a empresa ativa da sessão
create or replace function public.current_empresa_id()
returns uuid
language sql
set search_path = pg_catalog, public
as $$
  select nullif(current_setting('revo.current_empresa_id', true), '')::uuid;
$$;

-- 3) Permissões mínimas (Idempotente)
revoke all on function public.set_active_empresa(uuid) from public, anon;
grant execute on function public.set_active_empresa(uuid) to authenticated;

revoke all on function public.current_empresa_id() from public, anon;
grant execute on function public.current_empresa_id() to authenticated, service_role, postgres;
