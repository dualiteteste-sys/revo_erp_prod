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

-- RG01 (ecommerce): diagnostics deve usar colunas de secrets Woo (anti-regressão do bug "pendente").
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'ecommerce_connection_diagnostics'
  LIMIT 1;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'RG01 fail: missing function public.ecommerce_connection_diagnostics(text)';
  END IF;

  IF position('woo_consumer_key' in v_def) = 0 OR position('woo_consumer_secret' in v_def) = 0 THEN
    RAISE EXCEPTION 'RG01 fail: ecommerce_connection_diagnostics must check woo_consumer_key/woo_consumer_secret (stored secrets)';
  END IF;
END;
$$;

-- RG01 (woocommerce queue): jobs_claim deve considerar store status=error (transiente) e tratar next_run_at NULL.
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'woocommerce_sync_jobs_claim'
  LIMIT 1;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'RG01 fail: missing function public.woocommerce_sync_jobs_claim(int, uuid, text)';
  END IF;

  IF position('s.status IN (''active'',''error'')' in v_def) = 0 THEN
    RAISE EXCEPTION 'RG01 fail: woocommerce_sync_jobs_claim must allow store status=error (transient)';
  END IF;

  IF position('COALESCE(j.next_run_at' in v_def) = 0 THEN
    RAISE EXCEPTION 'RG01 fail: woocommerce_sync_jobs_claim must treat NULL next_run_at safely via COALESCE';
  END IF;
END;
$$;
