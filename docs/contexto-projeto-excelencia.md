# Contexto do projeto (para novos chats / novos devs)

Este documento existe para que qualquer pessoa (ou um novo “contexto” de IA) consiga continuar o trabalho **sem perder a linha**: o que já existe, o que é regra de ouro, e como entregar com qualidade.

## Entrada principal (AGENTS)

Antes de qualquer coisa, leia `AGENTS.md` (raiz). Ele é a “constituição” do projeto: invariantes, DoD, gatilhos e links para os demais docs.

## 1) Regras de ouro (não negociar)

1) **Schema do banco só muda via migration versionada** (`supabase/migrations/*`).
2) **PROD só recebe deploy via `main`** (merge + Actions).
3) **Uma tarefa só é “concluída” quando as GitHub Actions estiverem verdes**.
4) Se “corrigiu no dashboard do Supabase”, **vira migration no mesmo dia** (mudança fantasma = drift).

## 2) Ambientes (Supabase)

- **REVO-DEV**: ambiente de desenvolvimento (pode resetar quando necessário).
- **REVO-PROD**: ambiente de produção (mudanças controladas).
- **DR-VERIFY**: suporte/backup/DR.

## 3) Branches (GitHub)

- **`dev`**: desenvolvimento contínuo (features em andamento).
- **`main`**: “linha de produção” (o que deve estar em PROD).

## 4) Release Gate (o que dá confiança)

O projeto tem gates (local/CI) para reduzir surpresa em PROD:

- Unit: `yarn test --run`
- E2E: `yarn test:e2e:gate:all`
- Migrations: `yarn verify:migrations` (banco limpo + push local)

Script “tudo de uma vez”:

- `yarn release:check`

## 5) Onde ficam as coisas (mapa mental)

- **Supabase migrations**: `supabase/migrations/*`
- **Workflows Actions**: `.github/workflows/*`
- **Settings (painel lateral)**:
  - Config: `src/config/settingsMenuConfig.ts`
  - Render: `src/components/settings/SettingsContent.tsx`
- **RBAC**:
  - DB: migrations `rbac_*` (roles/permissions/overrides)
  - App: `src/hooks/useCan.ts`, `src/components/auth/RequirePermission.tsx`
- **Planos/Limites**:
  - View: `public.empresa_features`
  - Hook: `src/hooks/useEmpresaFeatures.ts`

## 6) Dependências entre módulos (ponta a ponta)

### 6.1 Financeiro (core)

- **Tesouraria** (`financeiro_contas_correntes`, `financeiro_movimentacoes`) é a base das “baixas”.
- **Contas a Receber** e **Contas a Pagar** geram/consomem movimentações (entrada/saída).
- Regras importantes:
  - Estorno deve **reverter estado** e **registrar trilha** (movimentação inversa).
  - Operações devem ser seguras contra duplicidade (idempotência por “origem” quando aplicável).

### 6.2 Suprimentos → Financeiro

- **Compras recebida** pode gerar **Conta a Pagar**.
- **Recebimento (NF-e import) concluído** pode gerar **Conta a Pagar**.

### 6.3 Serviços (OS) → Financeiro

- **OS concluída** pode gerar **Conta a Receber**.

### 6.4 Feature flags / planos → Guards

- O app bloqueia menus/rotas/ações com base em:
  - `empresa_features.plano_mvp`
  - `empresa_features.nfe_emissao_enabled`

## 7) Como trabalhar “estado da arte”

Checklist mental para qualquer feature:

- **DB first (migrations)**: criar/alterar tabelas/RPCs/policies com `SECURITY DEFINER` + `search_path` + `REVOKE/GRANT`.
- **UI/Service**: chamar RPCs via `callRpc()` (mensagens de erro consistentes).
- **Idempotência**: evitar duplicidade por chave de origem (quando fizer sentido).
- **Observabilidade**:
  - usar `audit_logs` (triggers) para mudanças críticas
  - logs aplicacionais claros (evitar spam, mas com contexto)
- **Qualidade**: rodar gates e só considerar “done” com Actions verdes.

## 8) Checklist do Go-Live

Checklist oficial: `docs/go-live-checklist.md`

## 9) Backup/Restore (GL-02)

Rotina e instruções: `docs/backup-restore.md`
