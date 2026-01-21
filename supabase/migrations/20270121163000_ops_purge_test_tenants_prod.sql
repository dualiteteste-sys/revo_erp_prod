-- Purge completo (dados + auth) de tenants de teste em PROD.
-- ATENÇÃO: operação destrutiva e irreversível.
-- Escopo: apaga registros por empresa_id (tabelas tenant-scoped), storage.objects por pasta {empresa_id}/
-- e apaga auth.users associados SOMENTE a estas empresas (sem memberships em outras empresas).

begin;

create or replace function public.ops_purge_empresas(p_empresa_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, auth, storage, extensions
as $$
declare
  v_ids uuid[];
  r record;
  v_sql text;
  v_progress boolean;
  v_pass int := 0;
begin
  v_ids := array(select distinct unnest(p_empresa_ids));
  if v_ids is null or array_length(v_ids, 1) is null then
    raise exception 'empresa_ids obrigatórios';
  end if;

  create temp table tmp_purge_empresa_ids(id uuid) on commit drop;
  insert into tmp_purge_empresa_ids(id)
  select unnest(v_ids);

  create temp table tmp_purge_user_ids(id uuid) on commit drop;
  insert into tmp_purge_user_ids(id)
  select distinct eu.user_id
  from public.empresa_usuarios eu
  join tmp_purge_empresa_ids t on t.id = eu.empresa_id;

  -- Mantém usuários que ainda pertencem a alguma empresa fora da lista (não deletar auth.users nesse caso)
  delete from tmp_purge_user_ids u
  where exists (
    select 1
    from public.empresa_usuarios eu
    where eu.user_id = u.id
      and eu.empresa_id not in (select id from tmp_purge_empresa_ids)
  );

  begin
    -- Remove registros tenant-scoped (todas tabelas em public com coluna empresa_id).
    -- Observação: como existem FKs entre tabelas, fazemos múltiplas passadas e pulamos
    -- temporariamente as tabelas que ainda estejam bloqueadas por foreign key.
    create temp table tmp_purge_tables(schema_name text, table_name text, done boolean default false, attempts int default 0)
    on commit drop;

    insert into tmp_purge_tables(schema_name, table_name)
    select n.nspname as schema_name, c.relname as table_name
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where a.attname = 'empresa_id'
      and a.attnum > 0
      and not a.attisdropped
      and c.relkind = 'r'
      and n.nspname = 'public'
    order by c.relname;

    loop
      exit when not exists (select 1 from tmp_purge_tables where done = false);

      v_pass := v_pass + 1;
      v_progress := false;

      for r in
        select schema_name, table_name
        from tmp_purge_tables
        where done = false
        order by attempts asc, table_name asc
      loop
        begin
          v_sql := format('delete from %I.%I where empresa_id = any($1)', r.schema_name, r.table_name);
          execute v_sql using v_ids;
          update tmp_purge_tables
          set done = true
          where schema_name = r.schema_name and table_name = r.table_name;
          v_progress := true;
        exception
          when foreign_key_violation then
            update tmp_purge_tables
            set attempts = attempts + 1
            where schema_name = r.schema_name and table_name = r.table_name;
          when undefined_table then
            update tmp_purge_tables
            set done = true
            where schema_name = r.schema_name and table_name = r.table_name;
        end;
      end loop;

      if not v_progress then
        raise exception 'Purge bloqueado por constraints. Tabelas restantes: %',
          (select string_agg(format('%I.%I(attempts=%s)', schema_name, table_name, attempts), ', ')
           from tmp_purge_tables
           where done = false);
      end if;

      -- Segurança: evita loop infinito em cenários inesperados
      if v_pass > 50 then
        raise exception 'Purge excedeu o número máximo de passadas (%).', v_pass;
      end if;
    end loop;

    -- Remove objetos de storage em buckets que usam convenção {empresa_id}/{...}
    delete from storage.objects o
    using tmp_purge_empresa_ids t
    where (storage.foldername(o.name))[1] = t.id::text;

    -- Remove as empresas (e quaisquer sobras que não tenham empresa_id)
    delete from public.empresas e
    using tmp_purge_empresa_ids t
    where e.id = t.id;

    -- Purge auth (somente usuários exclusivos dessas empresas)
    if to_regclass('public.profiles') is not null then
      execute 'delete from public.profiles where id = any(select id from tmp_purge_user_ids)';
    end if;

    if to_regclass('auth.identities') is not null then
      execute 'delete from auth.identities where user_id = any(select id from tmp_purge_user_ids)';
    end if;

    execute 'delete from auth.users where id = any(select id from tmp_purge_user_ids)';
  exception
    when others then
      raise;
  end;
end;
$$;

revoke all on function public.ops_purge_empresas(uuid[]) from public;
grant execute on function public.ops_purge_empresas(uuid[]) to service_role;

-- Executa purge (IDs fornecidos pelo usuário, tenants de teste)
select public.ops_purge_empresas(array[
  '10ba24bb-ac60-4a2f-af52-9573e57620b4'::uuid,
  '20010d75-3cd9-4e44-be6f-c78258f3ea56'::uuid,
  '5b149f30-da92-47cb-a1a3-33549e010b61'::uuid,
  '610d536c-58c2-49c4-8e8d-4012b622f341'::uuid,
  '8daf85cd-44fa-440e-a4ad-f8788305cafa'::uuid,
  'ddd1da32-127e-4f02-85f6-a815aec01f62'::uuid,
  'f96d0fee-3595-47dc-a4d8-54d4a6de7c95'::uuid
]);

commit;
