/*
# [EMERGENCY] Harden RLS and Function Permissions
This migration applies critical security hardening to the database. It revokes default function execution permissions from the `anon` role, whitelisting only essential functions. It also enforces Row Level Security (RLS) on all public tables and explicitly denies access to backup tables.

## Query Description: "This operation significantly restricts public access to database functions and enforces data isolation policies across all tables. It is a critical security update designed to prevent unauthorized data access and potential SQL injection vectors. No data loss is expected, but it's crucial to test application functionality after applying, especially public-facing features that might rely on now-revoked function permissions."

## Metadata:
- Schema-Category: "Structural"
- Impact-Level: "High"
- Requires-Backup: false
- Reversible: false

## Structure Details:
Affects permissions on all functions in the `public` schema and RLS policies on all tables in the `public` schema.

## Security Implications:
- RLS Status: Enforced on all tables.
- Policy Changes: Yes, adds `deny_all` policies to backup tables.
- Auth Requirements: Revokes function execution from `anon`, tightening security.

## Performance Impact:
- Indexes: None
- Triggers: None
- Estimated Impact: Negligible. May slightly improve query planning by reducing the number of accessible functions for the `anon` role.
*/

-- [EMERGÊNCIA][HARDEN] Revogar EXECUTE de funções para anon (whitelist mínima) + reforço RLS

-- 0) Whitelist de funções que o PostgREST/landing realmente precisam para usuário anônimo.
--    Ajuste a lista se você tiver outras funções PUBLICAMENTE necessárias.
create or replace function public._is_whitelisted_function(p_oid oid)
returns boolean language sql as $$
  select (n.nspname, p.proname, oidvectortypes(p.proargtypes)) in (
    -- manter ensure_request_context acessível a anon (evita 401/permission denied em select público)
    ('public','ensure_request_context','')
  )
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.oid = p_oid;
$$;

-- 1) Revogar EXECUTE de TODAS as funções public.* para anon, exceto whitelist
do $$
declare r record;
begin
  for r in
    select p.oid, n.nspname, p.proname, oidvectortypes(p.proargtypes) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    if not public._is_whitelisted_function(r.oid) then
      execute format('revoke execute on function %I.%I(%s) from anon;', r.nspname, r.proname, r.args);
    else
      -- garante execute para anon na whitelist
      execute format('grant execute on function %I.%I(%s) to anon;', r.nspname, r.proname, r.args);
    end if;
  end loop;
end$$;

-- 2) Forçar RLS em todas as tabelas do schema public (idempotente)
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relkind='r'
  loop
    execute format('alter table public.%I enable row level security;', t.relname);
    begin
      execute format('alter table public.%I force row level security;', t.relname);
    exception when others then
      -- versões/ambientes que não suportam FORCE RLS
      null;
    end;
  end loop;
end$$;

-- 3) Tabelas de backup/_bak: negar tudo explicitamente para anon/authenticated
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relkind='r'
      and (c.relname like '\_bak%' escape '\'
           or c.relname like '%\_bak%' escape '\'
           or c.relname like 'backup%' )
  loop
    execute format('revoke all on table public.%I from anon, authenticated;', t.relname);
    -- RLS deny-all (idempotente)
    if exists (
      select 1 from information_schema.tables
      where table_schema='public' and table_name=t.relname
    ) then
      execute format('drop policy if exists deny_all_%1$s on public.%1$s;', t.relname);
      execute format($p$
        create policy deny_all_%1$s on public.%1$s
        for all to anon, authenticated
        using (false) with check(false);
      $p$, t.relname);
    end if;
  end loop;
end$$;

-- 4) (opcional) Garantir que apenas plans sejam públicos (já deve existir policy de SELECT active=true)
-- grant usage on schema public to anon; -- mantenha se já necessário para landing/REST
-- grant select on table public.plans to anon; -- RLS ainda filtra; avalie manter

-- 5) Reload do PostgREST
select pg_notify('pgrst','reload schema');
