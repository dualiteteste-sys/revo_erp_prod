# PROVAS / VALIDAÇÃO (checklist executável)

## 1) Checklists executados ✅/❌

- [ ] `yarn release:check`
- [ ] `yarn verify:migrations`
- [ ] `yarn test:e2e:gate:all`
- [ ] Inventário PostgREST `.from()` ok (allowlist)
- [ ] Inventário `supabase.from()` ok (allowlist)
- [ ] Anti-tenant-leak (duas abas) ok

## 2) Comandos (referência)

```bash
yarn release:check
yarn verify:migrations
yarn test:e2e:gate:all
node scripts/check_supabase_from_allowlist.mjs
node scripts/check_postgrest_from_allowlist.mjs
node scripts/check_no_direct_financeiro_tables.mjs
```

## 3) SQL de validação (sem dados sensíveis)

### 3.1 Verificar `pgrst.db_pre_request`

```sql
select
  rolname,
  rolconfig
from pg_roles
where rolname in ('anon','authenticated','service_role');
```

### 3.2 Verificar tenant GUC e resolução

```sql
select current_setting('app.current_empresa_id', true) as guc_empresa;
select public.current_empresa_id() as current_empresa;
```

## 4) Evidências (onde anexar)

- PR: linkar `yarn release:check` (CI) e o workflow relevante.
- Issue: anexar output dos SQL acima (sem dados sensíveis).

