-- RG01 — DB asserts (Security/Multi-tenant)
-- Executado após `supabase db reset` no `verify:migrations`.

DO $$
DECLARE
  v_count int;
BEGIN
  /*
    Assert 1: não pode existir tabela em `public` com grants para `authenticated`
    e RLS desabilitado (alto risco de vazamento).
  */
  SELECT count(*)::int
  INTO v_count
  FROM (
    WITH grants AS (
      SELECT
        table_name,
        bool_or(privilege_type = 'SELECT') AS sel,
        bool_or(privilege_type = 'INSERT') AS ins,
        bool_or(privilege_type = 'UPDATE') AS upd,
        bool_or(privilege_type = 'DELETE') AS del
      FROM information_schema.role_table_grants
      WHERE grantee = 'authenticated'
        AND table_schema = 'public'
      GROUP BY table_name
    ),
    tables AS (
      SELECT
        c.relname::text AS table_name,
        c.relrowsecurity AS rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        -- Foca em objetos "graváveis" (tabelas/foreign/partitioned). Views não entram aqui.
        AND c.relkind IN ('r','p','f')
    )
    SELECT g.table_name
    FROM grants g
    JOIN tables t USING (table_name)
    WHERE NOT t.rls_enabled
      AND (g.sel OR g.ins OR g.upd OR g.del)
      -- Exceção (baixo risco): tabela de estatísticas criada por extensão `wrappers` pode vir com grants amplos.
      -- O hardening depende do owner e pode variar por ambiente.
      AND g.table_name <> 'wrappers_fdw_stats'
  ) q;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'RG01 fail: existem tabelas com grants para authenticated sem RLS (count=%).', v_count;
  END IF;

  /*
    Assert 2: nenhuma policy `qual=true` / `with_check=true` em tabelas com empresa_id
    deve estar acessível para `authenticated`/`public` (service_role pode).
  */
  SELECT count(*)::int
  INTO v_count
  FROM pg_policies p
  JOIN information_schema.columns c
    ON c.table_schema = p.schemaname
   AND c.table_name = p.tablename
   AND c.column_name = 'empresa_id'
  WHERE p.schemaname = 'public'
    AND (
      trim(lower(coalesce(p.qual, ''))) = 'true'
      OR trim(lower(coalesce(p.with_check, ''))) = 'true'
    )
    AND (
      p.roles::text ILIKE '%authenticated%'
      OR p.roles::text ILIKE '%public%'
      OR p.roles::text ILIKE '%anon%'
    );

  IF v_count > 0 THEN
    RAISE EXCEPTION 'RG01 fail: existem policies permissivas (qual/with_check=true) em tabelas com empresa_id acessíveis a authenticated/public (count=%).', v_count;
  END IF;
END;
$$;
