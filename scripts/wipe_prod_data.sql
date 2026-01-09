-- Wipe de dados do PROD (sem dropar tabelas)
-- Motivo:
--   - Precisamos recomeçar do zero (empresas + dados CRUD + storage + auth),
--     mantendo o schema/migrations/objetos intactos.
-- Impacto:
--   - Remove TODOS os registros "por empresa" no schema public (tabelas que possuem coluna empresa_id),
--     remove todas as empresas (public.empresas), remove TODOS os usuários do Auth (auth.users)
--     e remove TODOS os objetos do Storage (storage.objects). Buckets permanecem.
-- Reversibilidade:
--   - Não é reversível sem backup. Rode somente com certeza.

begin;

-- Evitar timeouts em bases maiores
set local statement_timeout = 0;
set local lock_timeout = '10s';

-- 1) Storage: remove todos os arquivos (mantém buckets)
do $$
declare
  v_before bigint;
  v_after bigint;
begin
  select count(*) into v_before from storage.objects;
  raise notice 'PROD: storage.objects BEFORE = %', v_before;

  execute 'truncate table storage.objects';

  select count(*) into v_after from storage.objects;
  raise notice 'PROD: storage.objects AFTER  = %', v_after;
end $$;

-- 2) Dados do app por empresa (tabelas com empresa_id) + empresas
do $$
declare
  v_tables text;
  v_count_empresas_before bigint;
  v_count_empresas_after bigint;
begin
  select count(*) into v_count_empresas_before from public.empresas;
  raise notice 'PROD: public.empresas BEFORE = %', v_count_empresas_before;

  /*
    Estratégia "segura":
    - Trunca somente tabelas que têm coluna empresa_id (dados digitados / multi-tenant).
    - Depois trunca public.empresas com CASCADE para limpar possíveis dependências restantes.
    - Isso preserva tabelas "globais" (ex.: plans/roles/catálogos) que não possuem empresa_id.
  */
  select string_agg(format('%I.%I', c.table_schema, c.table_name), ', ' order by c.table_schema, c.table_name)
    into v_tables
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema
   and t.table_name = c.table_name
  where c.table_schema = 'public'
    and t.table_type = 'BASE TABLE'
    and c.column_name = 'empresa_id';

  if v_tables is not null and length(v_tables) > 0 then
    raise notice 'PROD: truncating company-scoped tables (empresa_id) ...';
    execute 'truncate ' || v_tables || ' restart identity cascade';
  else
    raise notice 'PROD: no public tables with empresa_id found (skipping).';
  end if;

  raise notice 'PROD: truncating public.empresas ...';
  execute 'truncate table public.empresas restart identity cascade';

  select count(*) into v_count_empresas_after from public.empresas;
  raise notice 'PROD: public.empresas AFTER  = %', v_count_empresas_after;
end $$;

-- 3) Auth: remove todos os usuários (para permitir reutilizar e-mails)
do $$
declare
  v_before bigint;
  v_after bigint;
begin
  select count(*) into v_before from auth.users;
  raise notice 'PROD: auth.users BEFORE = %', v_before;

  -- Remove usuários + dependências (sessions, identities, refresh tokens etc)
  execute 'truncate table auth.users cascade';

  select count(*) into v_after from auth.users;
  raise notice 'PROD: auth.users AFTER  = %', v_after;
end $$;

-- 4) Verificação rápida (somente SELECT)
select
  'public.empresas'::text as table_name,
  count(*)::bigint as rows
from public.empresas
union all
select
  'auth.users'::text as table_name,
  count(*)::bigint as rows
from auth.users
union all
select
  'storage.objects'::text as table_name,
  count(*)::bigint as rows
from storage.objects
order by table_name;

commit;
