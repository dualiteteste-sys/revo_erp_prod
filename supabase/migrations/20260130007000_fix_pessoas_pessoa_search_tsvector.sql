/*
  Fix: alinhar coluna `public.pessoas.pessoa_search` com o schema esperado (VERIFY).

  Cenário:
  - Em bancos antigos/PROD, `pessoa_search` pode não existir ou existir como TEXT.
  - No VERIFY (clean DB), nossa cadeia cria `pessoa_search` como TSVECTOR para busca rápida.
  - A Action de deploy compara VERIFY vs PROD e deve passar após aplicar migrations.

  Estratégia:
  - Se não existe: cria como TSVECTOR (generated) + índice GIN.
  - Se existe como TEXT (ou similares): converte para TSVECTOR usando concatenação de campos principais.
  - Se já é TSVECTOR: garante índice GIN.
*/

BEGIN;

do $$
declare
  v_udt_name text;
  v_is_generated text;
begin
  select c.udt_name
    into v_udt_name
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'pessoas'
     and c.column_name = 'pessoa_search';

  select c.is_generated
    into v_is_generated
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'pessoas'
     and c.column_name = 'pessoa_search';

  if v_udt_name is null then
    execute $sql$
      alter table public.pessoas
        add column pessoa_search tsvector
        generated always as (
          to_tsvector(
            'portuguese',
            coalesce(nome,'') || ' ' ||
            coalesce(fantasia,'') || ' ' ||
            coalesce(doc_unico,'') || ' ' ||
            coalesce(email,'') || ' ' ||
            coalesce(telefone,'') || ' ' ||
            coalesce(celular,'') || ' ' ||
            coalesce(codigo_externo,'')
          )
        ) stored
    $sql$;
  elsif coalesce(v_is_generated, 'NEVER') = 'ALWAYS' and v_udt_name <> 'tsvector' then
    -- Não dá para alterar tipo com USING em coluna GENERATED. Como é coluna derivada,
    -- recriamos com o tipo correto.
    execute 'drop index if exists public.idx_pessoas_pessoa_search';
    execute 'alter table public.pessoas drop column pessoa_search';
    execute $sql$
      alter table public.pessoas
        add column pessoa_search tsvector
        generated always as (
          to_tsvector(
            'portuguese',
            coalesce(nome,'') || ' ' ||
            coalesce(fantasia,'') || ' ' ||
            coalesce(doc_unico,'') || ' ' ||
            coalesce(email,'') || ' ' ||
            coalesce(telefone,'') || ' ' ||
            coalesce(celular,'') || ' ' ||
            coalesce(codigo_externo,'')
          )
        ) stored
    $sql$;
  elsif v_udt_name in ('text','varchar','bpchar') then
    execute $sql$
      alter table public.pessoas
        alter column pessoa_search type tsvector
        using to_tsvector(
          'portuguese',
          coalesce(nome,'') || ' ' ||
          coalesce(fantasia,'') || ' ' ||
          coalesce(doc_unico,'') || ' ' ||
          coalesce(email,'') || ' ' ||
          coalesce(telefone,'') || ' ' ||
          coalesce(celular,'') || ' ' ||
          coalesce(codigo_externo,'')
        )
    $sql$;
  end if;

  -- Garantir índice GIN correto.
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'pessoas'
      and c.column_name = 'pessoa_search'
      and c.udt_name = 'tsvector'
  ) then
    execute 'drop index if exists public.idx_pessoas_pessoa_search';
    execute 'create index if not exists idx_pessoas_pessoa_search on public.pessoas using gin (pessoa_search)';
  end if;
end $$;

select pg_notify('pgrst','reload schema');

COMMIT;
