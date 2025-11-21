-- Crie… RPC de diagnóstico (RLS aplica nas tabelas referenciadas, mas aqui não tocamos tabelas)
create or replace function public.whoami()
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'user_id',     public.current_user_id(),
    'empresa_id',  public.current_empresa_id()
  );
$$;

-- ACL mínima
revoke all on function public.whoami() from public, anon;
grant execute on function public.whoami() to authenticated, service_role, postgres;
