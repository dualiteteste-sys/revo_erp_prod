# CI/CD Pipeline — Contexto do Domínio

Estado atual dos pipelines de CI/CD, gates, tempos e otimizações.
Leia antes de tocar em qualquer workflow em `.github/workflows/`.

---

## 1) Visão geral dos workflows principais

```
dev branch → release-gate-dev.yml → netlify-deploy-dev.yml
                                          ↓
                               auto-promote-dev-to-main.yml (cria PR)
                                          ↓
main branch → supabase-migrations-main.yml (verify + deploy) → netlify-deploy-main.yml
```

---

## 2) release-gate-dev.yml (CI de dev)

**Trigger:** push em `dev` ou PR → `dev`

**Jobs:**

| Step | Condicional | Tempo estimado |
|---|---|---|
| Detect changes | Sempre | ~30s |
| Build + bundle budget | Sempre | ~2-3min |
| Unit tests (`yarn test --run`) | Sempre | ~1-2min |
| Install Playwright (Chromium) | Se não landing-only | ~1-2min |
| E2E gate all (34 specs) | Se não landing-only | ~12-18min |
| Install psql + supabase CLI | Se `db=true` (migration mudou) | ~1min |
| Verify migrations + RG-03 | Se `db=true` | ~8-12min |

**Total típico:**
- Mudança de frontend sem migration: ~15-20min
- Mudança com migration: ~25-35min
- Landing-only: ~5-7min (pula E2E e migrations)

**Risk labels:**
- `risk:high` → força gate completo (mesmo landing-only)
- `risk:low` → permite gate rápido

---

## 3) supabase-migrations-main.yml (CI/CD de main)

**Trigger:** push em `main` ou PR → `main`

**Jobs paralelos:**

### verify-migrations (timeout: 35min)
- Start Supabase local (clean slate)
- Apply all migrations
- RG-03 asserts
- RPC coverage check
- Edge Function coverage check
- Schema snapshot (artefato)

### release-gate (aguarda verify-migrations)
**Gate level por origem do PR:**
- PR de `dev` → `dev-fast`: apenas build + unit (sem E2E — já rodou no dev CI)
- PR genérico → `auto`: build + unit + E2E completo
- Label `risk:high` → gate completo (mesmo de `dev`)
- Landing-only → apenas build + unit

**Total tempo main (pipeline completo):**
- PR de dev (dev-fast): ~20-25min (verify-migrations + build/unit em paralelo)
- PR genérico: ~40-55min (verify-migrations + E2E completo)

---

## 4) netlify-deploy-dev.yml

**Trigger:** push em `dev`

**Otimização:** smart diff — só deploya se mudou `src/`, `public/`, `index.html`, configs ou `yarn.lock`.
Migrations-only push: pula deploy Netlify completamente.

**Smoke test:** após deploy, verifica que a URL DEV retorna HTTP 200.

---

## 5) netlify-deploy-main.yml

**Trigger:** após `supabase-migrations-main.yml` completar com sucesso.

**Steps:** precheck secrets → build (PROD) → resolve Netlify site → deploy.

---

## 6) Otimizações ativas

| Otimização | Onde | Efeito |
|---|---|---|
| `dev-fast` gate | main CI | PR de dev pula E2E (já validado) |
| Yarn cache (`actions/cache@v4`) | main CI | Economiza ~2min de install |
| Playwright cache | main CI | Economiza ~1-2min de download |
| Path filter (dorny/paths-filter) | dev + main CI | Pula steps desnecessários |
| Landing-only detection | dev + main CI | Pula E2E para mudanças de landing |
| Smart diff Netlify deploy | netlify-deploy-dev | Pula build se apenas migrations mudaram |

---

## 7) Secret scanning (TruffleHog)

**Adicionado em:** FASE 2 do planejamento de guardrails (2026-03-06)

Roda antes do build no `release-gate-dev.yml`. Falha o CI se encontrar secrets hardcoded no repo.
Configurado com `--only-verified` para minimizar falsos positivos.

---

## 8) Schema compare (RG-02)

O `deploy-prod` job do `supabase-migrations-main.yml` compara o schema aplicado em PROD contra o snapshot gerado pelo `verify-migrations`. Qualquer divergência bloqueia o deploy.

Artefatos: `expected_public_schema.txt`, `prod_public_schema.txt` (retidos 7 dias).

---

## 9) Secrets necessários por ambiente

| Secret | Usado em | Obrigatório para |
|---|---|---|
| `VITE_SUPABASE_URL_DEV` | dev CI, netlify-dev | E2E, build |
| `VITE_SUPABASE_ANON_KEY_DEV` | dev CI, netlify-dev | E2E, build |
| `VITE_SUPABASE_URL_PROD` | netlify-main | Build prod |
| `VITE_SUPABASE_ANON_KEY_PROD` | netlify-main | Build prod |
| `SUPABASE_DB_URL_PROD` | main CI deploy | Apply migrations prod |
| `SUPABASE_ACCESS_TOKEN` | main CI deploy | Deploy Edge Functions |
| `SUPABASE_PROJECT_REF_PROD` | main CI deploy | Deploy Edge Functions |
| `NETLIFY_AUTH_TOKEN` | netlify-dev/main | Deploy Netlify |
| `NETLIFY_SITE_ID_DEV` | netlify-dev | Deploy Netlify DEV |
| `NETLIFY_SITE_ID_PROD` | netlify-main | Deploy Netlify PROD |
| `VITE_SENTRY_DSN_DEV/PROD` | build | Sentry tracking |

---

## 10) Como adicionar um novo step ao CI

1. Editar o workflow correspondente em `.github/workflows/`.
2. Adicionar o step com condicional adequado (usar `if: steps.app_changes.outputs.should_deploy_app == 'true'` se for step de deploy).
3. Testar com `workflow_dispatch` antes de depender em PRs críticos.
4. Atualizar este arquivo com o novo step e seu tempo estimado.

---

## Última atualização — 2026-03-06

- TruffleHog adicionado ao release-gate-dev.yml (FASE 2).
- Smoke test pós-Netlify DEV adicionado ao netlify-deploy-dev.yml (FASE 2).
- Sentry `tracesSampleRate` corrigido para 0.1 em prod (era 1.0 queimando quota).
- Estado atual: guardrails em 9.5/10.
