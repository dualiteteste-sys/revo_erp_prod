-- Wipe de usuários do Auth (PROD)
-- ATENÇÃO: isso remove TODOS os usuários do Auth (auth.users) e dependências via CASCADE.
-- Uso recomendado: via GitHub Actions com confirmação explícita.

begin;

do $$
declare
  v_before bigint;
  v_after bigint;
begin
  select count(*) into v_before from auth.users;
  raise notice 'PROD: auth.users BEFORE = %', v_before;

  -- Remove todos os usuários (sessions, identities, refresh tokens etc via CASCADE)
  execute 'truncate table auth.users cascade';

  select count(*) into v_after from auth.users;
  raise notice 'PROD: auth.users AFTER  = %', v_after;
end $$;

commit;

