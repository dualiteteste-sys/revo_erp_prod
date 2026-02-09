# Hosting FinOps (Netlify + Supabase)

Objetivo: manter margem previsivel por cliente sem perda de desempenho.

## 1) Modelo atual (resumo)

- Frontend estatico (Vite) publicado no Netlify.
- Build principal roda no GitHub Actions; Netlify recebe `dist/` via CLI.
- Backend transacional roda em Supabase (RPC/RLS) e Stripe.

## 2) Principais vetores de custo

- Netlify: bandwidth/requests/deploys.
- Supabase: banco, storage, egress e compute.
- Stripe: tarifas por transacao.

## 3) Hardening aplicado no repo

- Deploy Netlify DEV/PROD passa a ser executado apenas quando commit toca frontend/runtime:
  - `src/**`, `public/**`, `index.html`, `vite/tailwind/postcss`, `package/yarn`, `netlify.toml`.
- `netlify.toml` remove configuracao de build forcado e adiciona `ignore` inteligente.
- Script `scripts/netlify_ignore.sh` evita build no Netlify para mudancas nao-runtime.

## 4) Configuracao recomendada no painel do Netlify

1. Em `Site settings -> Build & deploy`:
   - Desabilitar Auto Deploy de branches que nao precisam preview.
   - Manter deploy de producao controlado por pipeline (GitHub Actions).
2. Em `Deploy Previews`:
   - Habilitar apenas para PRs criticos; desabilitar para rotina interna.
3. Em `Usage and billing`:
   - Criar alertas de credits (thresholds 50%, 75%, 90%).

## 5) Observabilidade minima de custo

Registrar mensalmente:

- Netlify: GB transferidos, requests, numero de deploys.
- Supabase: egress, storage, rows lidas/escritas em RPCs criticas.
- Custo por cliente = (infra total do mes / clientes ativos).

## 6) Evolucao recomendada (proximo ciclo)

Se o custo de Netlify crescer acima da margem alvo por cliente:

1. Migrar frontend estatico para Cloudflare Pages.
2. Manter backend em Supabase e pagamentos em Stripe.
3. Preservar pipeline atual com deploy automatizado por GitHub Actions.

Isso costuma reduzir variabilidade de custo para apps SPA de alto trafego.
