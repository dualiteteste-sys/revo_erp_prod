-- =============================================================================
-- Migration: Ativar RLS na tabela empresa_features
-- Descrição: Habilita o RLS e adiciona políticas de segurança para garantir
--            que os usuários só possam acessar os registros da sua própria empresa.
-- Impacto:
--   - Segurança: Alto. Isola os dados de features por empresa.
--   - Reversibilidade: Sim, desativando o RLS ou removendo as políticas.
-- =============================================================================

do $$
begin
  -- Habilita RLS (idempotente)
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'empresa_features'
  ) then
    raise exception 'Tabela public.empresa_features não existe';
  end if;

  alter table public.empresa_features enable row level security;

  -- Opcional: force RLS (se desejado)
  alter table public.empresa_features force row level security;

  -- SELECT
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='empresa_features' and policyname='empresa_features_select_own_company') then
    execute $p$
      create policy empresa_features_select_own_company
      on public.empresa_features
      for select
      to authenticated
      using (empresa_id = public.current_empresa_id());
    $p$;
  end if;

  -- INSERT
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='empresa_features' and policyname='empresa_features_insert_own_company') then
    execute $p$
      create policy empresa_features_insert_own_company
      on public.empresa_features
      for insert
      to authenticated
      with check (empresa_id = public.current_empresa_id());
    $p$;
  end if;

  -- UPDATE
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='empresa_features' and policyname='empresa_features_update_own_company') then
    execute $p$
      create policy empresa_features_update_own_company
      on public.empresa_features
      for update
      to authenticated
      using (empresa_id = public.current_empresa_id())
      with check (empresa_id = public.current_empresa_id());
    $p$;
  end if;

  -- DELETE
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='empresa_features' and policyname='empresa_features_delete_own_company') then
    execute $p$
      create policy empresa_features_delete_own_company
      on public.empresa_features
      for delete
      to authenticated
      using (empresa_id = public.current_empresa_id());
    $p$;
  end if;

  -- Índice essencial (empresa_id)
  if not exists (select 1 from pg_indexes where schemaname='public' and tablename='empresa_features' and indexname='empresa_features__empresa_id') then
    execute 'create index empresa_features__empresa_id on public.empresa_features (empresa_id)';
  end if;
end
$$;
