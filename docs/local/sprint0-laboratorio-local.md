# Sprint 0 — Laboratório local (Ultria)

Objetivo: validar UX e fluxos de integrações (WooCommerce e futuros canais) **localmente**, com:
- banco Postgres/Supabase local (migrations aplicadas);
- Edge Functions locais;
- usuário local para login;
- WooCommerce mock opcional (sem internet, sem chaves reais).

## Setup (1ª vez)

1) Subir Supabase local e gerar envs:
- `yarn local:up`

2) Criar usuário dev local:
- `yarn local:bootstrap:user`

3) Subir o app:
- `yarn dev`

Login padrão (local):
- email: `dev@local.ultria`
- senha: `DevLocal123!`

## Reset (quando quiser “zerar” o banco)
- `yarn local:reset`
- `yarn local:bootstrap:user`

## Smoke test (Woo mock)
Verifica o básico sem Woo real:
- cria store Woo (mock) via `woocommerce-admin`
- roda `stores.healthcheck`

Executar:
- `yarn local:smoke:woo`

## Woo mock (como usar na UI)
Use a URL:
- `https://woo-mock.ultria.invalid`

Na UI, o botão **“Testar conexão”** funciona offline quando a URL acima é usada (o endpoint `woocommerce-test-connection` também respeita o mock).

Observações:
- O mock é ativado automaticamente **em ambiente local** quando a URL da loja for `https://woo-mock.ultria.invalid` (sem depender de env/secrets).
- As variáveis “custom” do Edge Runtime (ex.: `INTEGRATIONS_MASTER_KEY`) podem não ser injetadas automaticamente pelo Supabase local. Para isso, o backend aplica um **fallback local seguro** (somente quando `SUPABASE_URL` é `http://kong:*`/`127.0.0.1`) para destravar desenvolvimento offline.
- Ainda assim, o `local:up` gera `supabase/.env` e `supabase/.env.local` (ignorados pelo git) para manter compatibilidade com outros modos de serve/debug.
