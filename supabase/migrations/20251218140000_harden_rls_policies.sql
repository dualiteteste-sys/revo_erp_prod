/*
# [Security Hardening] Forçar RLS + corrigir user_permission_overrides
- Mantém políticas existentes (não sobrescreve).
- Força RLS nas tabelas com empresa_id que já têm RLS ligado.
- Habilita RLS e cria políticas por operação (idempotentes) em user_permission_overrides.
- SD + search_path fixo; índices essenciais já existentes.

## Query Description: [This operation hardens the security of the multi-tenant system by enforcing Row Level Security (RLS) on all tables that have it enabled. It also corrects the `user_permission_overrides` table by enabling RLS and adding specific, idempotent policies for SELECT, INSERT, UPDATE, and DELETE operations, ensuring data is strictly isolated by `empresa_id`.]

## Metadata:
- Schema-Category: ["Structural", "Security"]
- Impact-Level: ["Medium"]
- Requires-Backup: [false]
- Reversible: [true]

## Structure Details:
- Tables Affected: `atributos`, `ecommerces`, `empresa_addons`, `empresa_usuarios`, `fornecedores`, `linhas_produto`, `marcas`, `ordem_servico_parcelas`, `pessoa_contatos`, `pessoa_enderecos`, `pessoas`, `products_legacy_archive`, `produto_anuncios`, `produto_atributos`, `produto_componentes`, `produto_fornecedores`, `produto_imagens`, `produto_tags`, `produtos`, `servicos`, `subscriptions`, `tabelas_medidas`, `tags`, `transportadoras`, `user_active_empresa`, `user_permission_overrides`.
- RLS Policies Added: `upo_select_own_company`, `upo_insert_own_company`, `upo_update_own_company`, `upo_delete_own_company` on `user_permission_overrides`.
- RLS Enforcement: `FORCE ROW LEVEL SECURITY` applied to all listed tables.

## Security Implications:
- RLS Status: [Enabled/Forced]
- Policy Changes: [Yes]
- Auth Requirements: [All operations will now strictly require an authenticated user with a valid company context.]

## Performance Impact:
- Indexes: [No new indexes added.]
- Triggers: [No new triggers added.]
- Estimated Impact: [Low. Queries might have a slight overhead due to RLS checks, but this is essential for security and is supported by existing indexes.]
*/

-- 0) Garantia: funções de contexto já padronizadas
--   - public.current_user_id()
--   - public.current_empresa_id()
-- Assumimos que já existem e seguem SD + search_path fixo.

-- 1) Forçar RLS (apenas FORCE) nas tabelas com empresa_id que já têm RLS=ON e FORCE=OFF
do $$
declare
  v_sql text;
  v_tbl text;
  v_list text[] := array[
    'atributos',
    'ecommerces',
    'empresa_addons',
    'empresa_usuarios',
    'fornecedores',
    'marcas',
    'pessoas',
    'products_legacy_archive',
    'produto_anuncios',
    'produto_atributos',
    'produto_componentes',
    'produto_fornecedores',
    'produto_imagens',
    'produto_tags',
    'produtos',
    'servicos',
    'subscriptions',
    'tabelas_medidas',
    'tags',
    'transportadoras',
    'user_active_empresa',
    'centros_de_custo',
    'contas_a_pagar',
    'contas_a_receber',
    'ordens_de_servico',
    'ordem_servico_itens',
    'ordem_servico_parcelas'
  ];
begin
  foreach v_tbl in array v_list loop
    -- Apenas se a tabela existir, tiver coluna empresa_id, RLS=ON e FORCE=OFF
    if exists (
      select 1
      from information_schema.tables t
      where t.table_schema='public' and t.table_name=v_tbl
    ) and exists (
      select 1
      from information_schema.columns c
      where c.table_schema='public' and c.table_name=v_tbl and c.column_name='empresa_id'
    ) and exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=v_tbl and c.relkind='r' and c.relrowsecurity=true and c.relforcerowsecurity=false
    ) then
      v_sql := format('alter table %I.%I force row level security;', 'public', v_tbl);
      execute v_sql;
    end if;
  end loop;
end
$$;

-- 2) Regularizar user_permission_overrides (habilitar/forçar RLS + políticas por operação)
do $$
begin
  -- habilita RLS se necessário
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='user_permission_overrides') then
    -- enable RLS
    execute 'alter table public.user_permission_overrides enable row level security';
    -- force RLS
    execute 'alter table public.user_permission_overrides force row level security';

    -- políticas idempotentes
    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='user_permission_overrides' and policyname='upo_select_own_company'
    ) then
      execute $p$
        create policy upo_select_own_company
        on public.user_permission_overrides
        for select to authenticated
        using (empresa_id = public.current_empresa_id());
      $p$;
    end if;

    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='user_permission_overrides' and policyname='upo_insert_own_company'
    ) then
      execute $p$
        create policy upo_insert_own_company
        on public.user_permission_overrides
        for insert to authenticated
        with check (empresa_id = public.current_empresa_id());
      $p$;
    end if;

    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='user_permission_overrides' and policyname='upo_update_own_company'
    ) then
      execute $p$
        create policy upo_update_own_company
        on public.user_permission_overrides
        for update to authenticated
        using (empresa_id = public.current_empresa_id())
        with check (empresa_id = public.current_empresa_id());
      $p$;
    end if;

    if not exists (
      select 1 from pg_policies where schemaname='public' and tablename='user_permission_overrides' and policyname='upo_delete_own_company'
    ) then
      execute $p$
        create policy upo_delete_own_company
        on public.user_permission_overrides
        for delete to authenticated
        using (empresa_id = public.current_empresa_id());
      $p$;
    end if;
  end if;
end
$$;

-- 3) Sinalizar PostgREST
select pg_notify('pgrst','reload schema');
