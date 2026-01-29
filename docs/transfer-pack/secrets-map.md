# SECRETS MAP (sem segredos)

Regra: **nunca** colocar valores aqui. Somente nomes, onde ficam e como rotacionar.

| SECRET_NAME | Onde fica | Quem usa | Quando necessário | Como rotacionar |
|---|---|---|---|---|
| `SUPABASE_DB_URL_DEV` | GitHub Secrets | Workflows migrations/ops | CI DEV | Gerar nova URL (Supabase) e atualizar Secret |
| `SUPABASE_DB_URL_PROD` | GitHub Secrets | Workflows migrations/ops | CI PROD | Idem |
| `SUPABASE_DB_URL_VERIFY` | GitHub Secrets | Restore drill/verify | CI DR-VERIFY | Idem |
| `SUPABASE_ACCESS_TOKEN` | GitHub Secrets | Deploy functions/migrations | Deploy Edge Functions | Revogar token e gerar novo (Supabase) |
| `SUPABASE_PROJECT_REF_PROD` | GitHub Secrets | Deploy functions | Deploy PROD | Atualizar se trocar projeto |
| `VITE_SUPABASE_URL_DEV` | GitHub Secrets / Netlify env | Frontend dev | Build dev | Atualizar env |
| `VITE_SUPABASE_ANON_KEY_DEV` | GitHub Secrets / Netlify env | Frontend dev | Build dev | Atualizar env |
| `VITE_SUPABASE_FUNCTIONS_URL_DEV` | GitHub Secrets / Netlify env | Frontend dev | Build dev | Atualizar env |
| `VITE_SITE_URL_DEV` | GitHub Secrets / Netlify env | Frontend dev | Links/redirects | Atualizar env |
| `VITE_SENTRY_DSN_DEV` | GitHub Secrets / Netlify env | Frontend dev | Observabilidade | Atualizar DSN |
| `VITE_SUPABASE_URL_PROD` | GitHub Secrets / Netlify env | Frontend prod | Build prod | Atualizar env |
| `VITE_SUPABASE_ANON_KEY_PROD` | GitHub Secrets / Netlify env | Frontend prod | Build prod | Atualizar env |
| `VITE_SUPABASE_FUNCTIONS_URL_PROD` | GitHub Secrets / Netlify env | Frontend prod | Build prod | Atualizar env |
| `VITE_SITE_URL_PROD` | GitHub Secrets / Netlify env | Frontend prod | Links/redirects | Atualizar env |
| `VITE_SENTRY_DSN_PROD` | GitHub Secrets / Netlify env | Frontend prod | Observabilidade | Atualizar DSN |
| `NETLIFY_AUTH_TOKEN` | GitHub Secrets | `.github/workflows/netlify-deploy-*.yml` | Deploy automático | Rotacionar no Netlify e atualizar |
| `NETLIFY_SITE_ID_PROD` | GitHub Secrets | Deploy main | Deploy prod | Atualizar se trocar site |
| `NETLIFY_SITE_ID_DEV` | GitHub Secrets | Deploy dev | Deploy dev | Atualizar se trocar site |
| `R2_ENDPOINT` | GitHub Secrets | Backups/restore | Backup/restore | Atualizar endpoint se mudar conta/região |
| `R2_BUCKET` | GitHub Secrets | Backups/restore | Backup/restore | Atualizar se mudar bucket |
| `R2_ACCESS_KEY_ID` | GitHub Secrets | Backups/restore | Backup/restore | Rotacionar no Cloudflare R2 |
| `R2_SECRET_ACCESS_KEY` | GitHub Secrets | Backups/restore | Backup/restore | Rotacionar no Cloudflare R2 |
| `GITHUB_TOKEN` | Supabase Edge Functions Secrets | `ops-tenant-backups`/dispatch | Disparar workflows (backup/restore) | Rotacionar PAT no GitHub e atualizar secret |
| `GITHUB_REPO` | Supabase Edge Functions Secrets | `ops-tenant-backups`/dispatch | Formato `owner/repo` | Atualizar se mudar repo |
| `GITHUB_DEFAULT_REF` | Supabase Edge Functions Secrets | `ops-tenant-backups`/dispatch | Ref default (ex.: `main`) | Atualizar se trocar fluxo |
| `GITHUB_API_BASE_URL` | Supabase Edge Functions Secrets | `ops-tenant-backups`/dispatch | GitHub REST base | Atualizar só se trocar host |
| `STRIPE_SECRET_KEY_PROD` | GitHub Secrets (Supabase deploy) | Deploy Edge Functions | Billing live | Rotacionar no Stripe |
| `STRIPE_WEBHOOK_SECRET_PROD` | GitHub Secrets (Supabase deploy) | Deploy Edge Functions | Webhooks live | Rotacionar endpoint secret no Stripe |
| `STRIPE_SECRET_KEY_TEST` | Supabase Edge Functions Secrets (DEV) | Edge functions billing | Billing test (DEV) | Rotacionar no Stripe (modo teste) |
| `STRIPE_WEBHOOK_SECRET_TEST` | Supabase Edge Functions Secrets (DEV) | Edge functions billing | Webhooks test (DEV) | Rotacionar endpoint secret no Stripe (test) |
| `BILLING_TRIAL_DAYS` | Supabase Edge Functions Secrets | Billing checkout/sync | Definir trial beta | Atualizar valor e redeploy functions |
| `ALLOWED_ORIGINS` | Supabase Edge Functions Secrets | CORS functions | CORS por ambiente | Atualizar lista (sem valores no repo) |
| `ALLOW_ALL_ORIGINS` | Supabase Edge Functions Secrets | CORS functions | Modo permissivo (dev/local) | Desativar em PROD |
| `FOCUSNFE_WEBHOOK_SECRET_PROD` | GitHub Secrets | `focusnfe-webhook` | NF-e prod | Rotacionar no FocusNFe |
| `FOCUSNFE_WEBHOOK_SECRET_HML` | GitHub Secrets | `focusnfe-webhook` | NF-e hml | Rotacionar no FocusNFe |
| `E2E_USER` | GitHub Secrets | Playwright E2E | E2E gates | Alterar usuário/senha de teste |
| `E2E_PASS` | GitHub Secrets | Playwright E2E | E2E gates | Alterar usuário/senha de teste |
| `E2E_PLAN` | GitHub Secrets | Playwright E2E | Plan gating | Ajustar plano alvo |

RISCO:
- Algumas Edge Functions também dependem de env vars no Supabase (Dashboard → Edge Functions → Secrets). Validar via `supabase/functions/**`.
- Nomes reais de secrets “DEV vs PROD” podem variar (ex.: `STRIPE_SECRET_KEY` vs `STRIPE_SECRET_KEY_PROD`). Validar por busca:
  - `rg -n \"Deno.env.get\\(\" supabase/functions -S`
