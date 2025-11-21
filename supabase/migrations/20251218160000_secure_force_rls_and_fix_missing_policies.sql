/*
[SECURITY] RLS hardening incremental e seguro (idempotente)
- Força RLS onde já está ON e FORCE=OFF (apenas tabelas com empresa_id)
- Cria políticas por operação SÓ em tabelas com empresa_id e sem NENHUMA política
- Preserva políticas existentes e não altera catálogos RBAC
*/

-- 0) Premissas: funções de contexto já existem (current_user_id(), current_empresa_id())

----------------------------
-- 1) FORÇAR RLS onde falta
----------------------------
do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity = true
      and c.relforcerowsecurity = false
      and exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name=c.relname and column_name='empresa_id'
      )
  loop
    execute format('alter table %I.%I force row level security;', r.schema_name, r.table_name);
  end loop;
end
$$;

------------------------------------------------------------------------------------
-- 2) HABILITAR RLS + CRIAR POLÍTICAS por operação apenas onde NÃO existem políticas
------------------------------------------------------------------------------------
do $$
declare
  r record;
  v_has_policies boolean;
begin
  for r in
    select t.table_name
    from information_schema.tables t
    where t.table_schema='public'
      and t.table_type='BASE TABLE'
      and exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name=t.table_name and column_name='empresa_id'
      )
      and t.table_name not in ('roles','permissions','role_permissions')
  loop
    -- a) habilitar RLS se ainda não estiver ON
    if exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='public' and c.relname=r.table_name and c.relkind='r' and c.relrowsecurity=false
    ) then
      execute format('alter table public.%I enable row level security;', r.table_name);
    end if;

    -- b) se a tabela já tem qualquer política, não cria novas
    select exists (
      select 1 from pg_policies p
      where p.schemaname='public' and p.tablename=r.table_name
    ) into v_has_policies;

    if not v_has_policies then
      -- SELECT
      execute format($fmt$
        create policy %I_select_own_company
        on public.%I
        for select to authenticated
        using (empresa_id = public.current_empresa_id());
      $fmt$, r.table_name, r.table_name);

      -- INSERT
      execute format($fmt$
        create policy %I_insert_own_company
        on public.%I
        for insert to authenticated
        with check (empresa_id = public.current_empresa_id());
      $fmt$, r.table_name, r.table_name);

      -- UPDATE
      execute format($fmt$
        create policy %I_update_own_company
        on public.%I
        for update to authenticated
        using (empresa_id = public.current_empresa_id())
        with check (empresa_id = public.current_empresa_id());
      $fmt$, r.table_name, r.table_name);

      -- DELETE
      execute format($fmt$
        create policy %I_delete_own_company
        on public.%I
        for delete to authenticated
        using (empresa_id = public.current_empresa_id());
      $fmt$, r.table_name, r.table_name);
    end if;

    -- c) força RLS se ainda não estiver forçado
    if exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='public' and c.relname=r.table_name and c.relkind='r' and c.relforcerowsecurity=false
    ) then
      execute format('alter table public.%I force row level security;', r.table_name);
    end if;
  end loop;
end
$$;

-- 3) PostgREST: recarregar schema
select pg_notify('pgrst','reload schema');
