/*
  # [SECURITY][RLS] Add explicit deny-all where RLS has no policies

  Impacto / Segurança
  - Adiciona policy "deny_all_explicit" (USING false, WITH CHECK false) onde RLS está ON e sem policies.
  - Equivale ao default do RLS (nega tudo), apenas torna explícito p/ satisfazer o lint.

  Compatibilidade
  - Não altera tabelas com policies existentes.
  - Cobre schemas não-sistêmicos (inclui audit, storage, auth etc.), mas só age se c.relrowsecurity = true e sem policies.

  Reversibilidade
  - Removível via DROP POLICY por tabela.

  Performance
  - Nula.
*/

set local search_path = pg_catalog;

do $$
declare
  r record;
begin
  for r in
    select
      n.nspname,
      c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r'                   -- apenas tabelas
      and c.relrowsecurity = true           -- RLS habilitado
      and n.nspname not like 'pg_%'         -- evita schemas do sistema
      and n.nspname <> 'information_schema' -- evita schema do sistema
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
  loop
    execute format(
      'create policy "deny_all_explicit" on %I.%I for all using (false) with check (false);',
      r.nspname, r.relname
    );
    raise notice 'Created deny_all_explicit policy for %.%', r.nspname, r.relname;
  end loop;
end
$$ language plpgsql;
