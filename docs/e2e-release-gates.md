# E2E Release Gates (Serviços vs Indústria)

Objetivo: garantir que o **happy path** do plano escolhido continua funcionando sem erros de console e sem regressões “silenciosas”.

## Como pensar (analogia rápida)

- **Gate = checklist do piloto** antes de decolar.
- Se o gate falhar, não é “chato”: é um aviso de que a build pode subir, mas o usuário vai ver erro/bug.

## Suites disponíveis

As suites são scripts em `package.json`:

- `yarn test:e2e:gate:servicos`
  - foco: OS/Serviços + relatórios + fiscal + financeiro (base)
- `yarn test:e2e:gate:industria`
  - foco: Indústria/Beneficiamento + suprimentos/estoque + fiscal + financeiro (base)
- `yarn test:e2e:gate:all`
  - roda as duas em conjunto (suite completa)

## O que cada suite cobre (por arquivos)

### Base (rodar em qualquer plano)

- Login/Auth: `e2e/auth.spec.ts`
- Cadastros (clientes/fornecedores): `e2e/partners-smoke.spec.ts`
- RH/Qualidade (navegação mínima): `e2e/rh-qualidade-smoke.spec.ts`
- Financeiro (fluxos + relatórios): `e2e/financeiro-flows.spec.ts`, `e2e/financeiro-relatorios-smoke.spec.ts`
- Fiscal (NF-e telas básicas): `e2e/fiscal-nfe-smoke.spec.ts`

### Plano A — Serviços

- Serviços (listar/criar): `e2e/services-smoke.spec.ts`
- OS (lista/criação): `e2e/os-smoke.spec.ts`
- OS docs (upload/list): `e2e/os-docs-smoke.spec.ts`
- Relatórios de OS/Serviços: `e2e/os-relatorios-smoke.spec.ts`

### Plano B — Indústria

- Beneficiamento (fluxo): `e2e/beneficiamento-flow.spec.ts`
- Estoque (smoke): `e2e/suprimentos-estoque-smoke.spec.ts`
- Compras (smoke): `e2e/compras-smoke.spec.ts`
- Relatórios Indústria: `e2e/industria-relatorios-smoke.spec.ts`

## Regras do gate (importante)

O gate falha se detectar:
- `console.error` no browser
- `pageerror` (ex.: exception não tratada)

Isso é controlado em `e2e/fixtures.ts:1`.

## Rodar no CI (GitHub Actions)

Workflow: `E2E Release Gate (dev)` (`.github/workflows/e2e-release-gate-dev.yml:1`)

- Em `push`/`PR` para `dev`: roda `gate:all`.
- Em `workflow_dispatch`: você escolhe a suite `all|servicos|industria`.

## Dica prática de operação

- Se você está trabalhando só em **Serviços**, rode `gate:servicos` localmente.
- Se você está trabalhando só em **Indústria**, rode `gate:industria` localmente.
- Antes de mergear para `main`, deixe o CI rodar `gate:all`.

