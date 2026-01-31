# Release Gate (como rodar local e no CI)

Objetivo: garantir que **DEV → main → PROD** não tenha surpresas (migrations, E2E e regressões).

## CI por risco (Estado da Arte)

O projeto usa gates **proporcionais ao risco** (paths/labels) para evitar CI de 1h+ em mudanças de baixo risco (ex.: textos/branding da landing), sem abrir mão de segurança nos domínios críticos.

Documento: `docs/ci/risk-based-gates.md`

## Rodar local (antes de PR)

- Release completo (unit + e2e + migrations):
  - `yarn release:check`

- Apenas o “clean slate” do banco + asserts (RG-03 DB):
  - Requer `psql` instalado.
  - `yarn verify:migrations:rg03`

## No CI

- O `main` roda:
  - `Verify Migrations (Clean Slate)` (inclui `scripts/rg03_db_asserts.sql`)
  - `Release Gate (Unit + E2E)`
  - `Deploy to Production` (com diff esperado vs PROD)

## Nota rápida

- Se algo quebrar em PROD e “funcionar em DEV”, rode:
  - `Compare DEV vs PROD schema (public)` no branch certo (`main` para “o que deveria estar em produção”).
