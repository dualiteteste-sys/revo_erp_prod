-- prelude mínimo para rodar baseline no VERIFY
create schema if not exists audit;

-- Stub para current_empresa_id caso seja necessário por defaults
create or replace function public.current_empresa_id()
returns uuid
language sql
stable
set search_path = pg_catalog, public
as $$ select null::uuid $$;

-- Stub para current_user_id caso seja necessário por defaults
create or replace function public.current_user_id()
returns uuid
language sql
stable
set search_path = pg_catalog, public
as $$ select null::uuid $$;
