-- MIG: add is_principal to public.empresa_usuarios (compat p/ RPCs legadas)
-- Segurança: mantém RLS; default false; não expõe dados; search_path implícito ao schema.
-- Reversível: ALTER TABLE ... DROP COLUMN is_principal;

-- 0) pré-checagem: garantir existência da tabela
do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name  = 'empresa_usuarios'
  ) then
    raise exception 'Tabela public.empresa_usuarios não encontrada.';
  end if;
end$$;

-- 1) adicionar coluna se não existir (idempotente)
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'empresa_usuarios'
      and column_name  = 'is_principal'
  ) then
    alter table public.empresa_usuarios
      add column is_principal boolean not null default false;
  end if;
end$$;

-- 2) índice parcial (opcional) para lookups por principal; idempotente
do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname  = 'empresa_usuarios_is_principal_idx'
  ) then
    create index empresa_usuarios_is_principal_idx
      on public.empresa_usuarios (empresa_id, user_id)
      where is_principal = true;
  end if;
end$$;

-- 3) recarregar schema do PostgREST p/ refletir novas colunas/índices
select pg_notify('pgrst','reload schema');
