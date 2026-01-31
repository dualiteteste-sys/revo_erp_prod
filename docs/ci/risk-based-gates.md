# CI — Gates por risco (Estado da Arte)

Objetivo: manter o repositório **seguro** (sem regressões, sem drift de Supabase), mas evitar 1h+ de CI para mudanças de baixo risco (ex.: textos/branding da landing).

## Princípio

1) **Risco alto** (Supabase/tenant/billing/auth/financeiro): sempre roda o gate completo.
2) **Risco médio** (UI do app): roda unit + E2E (smoke ou completo, conforme o workflow).
3) **Risco baixo** (landing/branding/estático): roda build + unit + bundle (sem E2E e sem verify migrations).

> Importante: “baixo risco” não significa “sem risco”. Significa que o custo/benefício do E2E completo e do verify migrations clean-slate é ruim para esse tipo de mudança.

## Como a decisão é feita (automaticamente)

### Paths (principal)

Os workflows usam um *paths filter* para detectar:

- **DB change** (`db=true`):
  - `supabase/migrations/**`
  - `supabase/functions/**`
  - `scripts/**`
- **APP change** (`app=true`):
  - `src/**`
  - `public/**`
  - `index.html`
  - `vite.config.ts`, `tailwind.config.js`, `package.json`, `yarn.lock`, `.yarn/**`

### Landing-only (otimização)

Quando a mudança está restrita a:

- `src/components/landing/**`
- `public/**`
- `index.html`

…o CI aplica um **fast gate**:

- `yarn verify:bundle`
- `yarn test --run`
- `yarn build`

## Override por labels (quando necessário)

Em PRs, é possível forçar o nível de risco:

- `risk:high`: força gate completo mesmo se for landing-only
- `risk:low`: permite fast gate quando for landing-only

Se nenhum label estiver presente, o comportamento é `auto` (paths-based).

## “Fail fast” (prático)

No `main`, se houver mudança de DB:

- o job `Release Gate (Unit + E2E)` só roda **depois** do `Verify Migrations (Clean Slate)` passar.
- isso evita gastar 1h em E2E quando o DB gate já falhou em ~5–10 min.

## O que continua obrigatório (não negociar)

- Mudança em Supabase: **sempre** via `supabase/migrations/*` e com verify migrations passando (clean slate).
- Merge em `main`: só com checks verdes (branch protection).

## Como usar no dia a dia (regra simples)

- Mudou **só** landing/branding: deixe rodar o fast gate (não adicione `risk:high`).
- Mudou `src/**` em módulos críticos (billing/auth/tenant/financeiro): aplique label `risk:high`.
- Ficou em dúvida: aplique `risk:high`.

