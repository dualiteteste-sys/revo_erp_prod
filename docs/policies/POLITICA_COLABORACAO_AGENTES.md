<!--
Regra do repo (AGENTS.md): não duplicar documentação.
Este documento é o canônico para colaboração com múltiplos agentes/PRs.
-->

# POLÍTICA — COLABORAÇÃO COM MÚLTIPLOS AGENTES (Branches + PRs + CI)

Objetivo: permitir que **vários agentes** trabalhem em paralelo com **mínima colisão**, mantendo **CI verde**, **zero regressão** e respeitando o fluxo **dev → PR → main**.

## 1) Regras de fluxo (obrigatórias)

1) **Nunca trabalhar direto em `dev` ou `main`**
   - Todo agente deve trabalhar em **branch própria** e abrir PR para `dev`.
2) **`main` só recebe PR vindo de `dev`**
   - Nunca abrir PR direto `feature → main` (ver gate em `.github/workflows/require-dev-before-main.yml`).
3) **PR pequeno por padrão**
   - Preferir lotes de 3–5 mudanças por PR, com objetivo claro (reduz tempo de CI e risco).
4) **Nada de segredos no repo**
   - Apenas nomes/uso; valores ficam em Secrets/ENV.

## 2) Padrão de branch por agente

Formato recomendado:

`ai/<agent-id>/<tipo>-<slug>`

Onde:
- `<agent-id>`: slug do nome do agente (minúsculo, `a-z0-9-`).
- `<tipo>`: `feat` | `fix` | `docs` | `chore` | `refactor` | `test` | `ci` | `perf` | `hotfix`
- `<slug>`: descrição curta (ex.: `tenant-header-guard`, `e2e-flake-retry`).

Exemplos:
- `ai/bugs-especialist-neo/fix-extratos-dedup`
- `ai/frontend-especialist-mouse/feat-dashboard-shortcuts`
- `ai/consultor-the-architect/ci-concurrency-release-gate`

### 2.1 IDs sugeridos (a partir do print atual)

Da lista visível no print:
- `consultor-the-architect`
- `melhorias-sati`
- `bugs-especialist-neo`
- `bugs-especialist-trinity`
- `bugs-especialist-cypher`
- `frontend-especialist-mouse`

Obs.: o nome do “Core Especialist - …” está truncado no print; definir o slug assim que o nome completo estiver confirmado.

## 3) PRs: alvo, auto-merge e checks

Fluxo padrão:
1) `ai/...` → **PR para `dev`**
2) Quando `dev` estiver verde e aprovado: **PR `dev` → `main`**

Auto-merge:
- Habilitar **Auto-merge** nos PRs para `dev` (quando disponível) para reduzir “espera humana”.
- Auto-merge funciona melhor com **required checks** + “branch up-to-date”.

⚠️ Importante (GitHub Free + repo privado):
- No plano **Free** em **repo privado**, você pode usar GitHub Actions normalmente, mas **branch protection / required checks** podem ficar limitados.
- Se não der para tornar checks obrigatórios via proteção de branch, trate “CI verde” como **regra operacional**: sem merge manual quando estiver vermelho.

## 4) GitHub Actions: evitando pipelines se atropelarem

Regra: todo workflow “de gate” (unit/e2e/build/deploy) deve ter `concurrency` para:
- cancelar runs antigas do **mesmo PR/branch**, e
- evitar que múltiplos agentes “entupam” o pipeline.

Padrão recomendado:

```yml
concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

## 5) Operação do dia a dia (anti-caos)

- Evitar “push em rajada” no mesmo PR: agrupe commits e empurre menos vezes.
- Se o time estiver “apertando” `dev` demais, defina uma janela rápida de **freeze** (ex.: 30–60 min) para deixar `dev` estabilizar e permitir o PR `dev→main` concluir.

## 6) Checklist mínimo (para PR → `dev`)

- [ ] Branch no padrão `ai/<agent-id>/<tipo>-<slug>`
- [ ] PR aponta para `dev` (exceto PR `dev→main`)
- [ ] CI relevante ficou ✅ (Release Gate / Verify Migrations / E2E Gate quando aplicável)
- [ ] Sem segredos / sem drift de Supabase (DDL só via migration)

