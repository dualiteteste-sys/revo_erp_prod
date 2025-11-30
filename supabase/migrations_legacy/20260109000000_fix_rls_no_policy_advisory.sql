/*
  [SECURITY][RLS] Add explicit deny-all ONLY on tables owned by current_user

  - Cria policy "deny_all_explicit" (USING false, WITH CHECK false) onde:
      * c.relrowsecurity = true (RLS ON)
      * não existem policies
      * a tabela é OWNED BY current_user
      * não são schemas de sistema (pg_*, information_schema)
  - Idempotente: só cria onde não há policies.
  - Evita erro "must be owner of table ..." em objetos geridos pelo Supabase.

  Impacto/Security: formaliza deny-all; não altera tabelas com policies. 
  Compatibilidade: inclui partições ('r','p').
  Reversibilidade: DROP POLICY por tabela.
  Performance: nula.
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
    where c.relkind in ('r','p')            -- tabelas e particionadas
      and c.relrowsecurity = true           -- RLS habilitado
      and n.nspname not like 'pg_%'         -- evita schemas do sistema
      and n.nspname <> 'information_schema' -- evita schema do sistema
      and pg_get_userbyid(c.relowner) = current_user -- SOMENTE se somos owners
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
