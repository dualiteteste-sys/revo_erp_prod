-- Migration: otimizações de busca/ordenacao em public.pessoas
-- Requisitos:
--   - Extensão pg_trgm já existente (validada). Se necessário, descomente a linha abaixo.
-- create extension if not exists pg_trgm with schema public;

-- 1. Coluna gerada para busca agregada (nome, doc_unico, email)
--    Usamos lower() para favorecer o trgm + ilike; null-safe com coalesce.
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='pessoas'
      and column_name='pessoa_search'
  ) then
    alter table public.pessoas
      add column pessoa_search text
      generated always as (
        lower(
          coalesce(nome,'') || ' ' ||
          coalesce(doc_unico,'') || ' ' ||
          coalesce(email,'')
        )
      ) stored;
  end if;
end$$;

-- 2. Índice GIN trgm na coluna agregada de busca
create index if not exists idx_pessoas_search_trgm
  on public.pessoas
  using gin (pessoa_search gin_trgm_ops);

-- 3. Índice para paginação/ordenacao por created_at dentro do tenant
create index if not exists idx_pessoas_empresa_created_at
  on public.pessoas (empresa_id, created_at desc);
