# Sprint 0 — Laboratório local (Ultria)

Objetivo: rodar o Ultria **com banco Supabase local** + **Edge Functions locais** e, opcionalmente, um **WooCommerce mock** para validar UX/fluxos sem depender de DEV/CI.

## Comandos (rápidos)

1) Subir stack local + gerar `.env.local`:
- `yarn local:up`

2) (Opcional) Reset total do banco local (migrations do zero):
- `yarn local:reset`

3) Criar usuário dev local (Supabase Auth local):
- `yarn local:bootstrap:user`

4) Smoke test do Woo mock (salvar secrets → healthcheck):
- `yarn local:smoke:woo`

5) Desligar:
- `yarn local:down`

## Observações importantes

- Nada aqui cria/usa segredos reais. Os arquivos gerados são **locais** e já estão no `.gitignore`.
- O Woo mock é ativado automaticamente **em ambiente local** quando a URL for `https://woo-mock.ultria.invalid`.
- As variáveis do Edge Runtime local ficam em `supabase/.env` (e são espelhadas em `supabase/.env.local`), mas o Supabase local pode não injetar “custom env” automaticamente — há fallback local seguro no backend.
