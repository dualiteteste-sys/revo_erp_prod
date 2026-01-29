# CHANGE INVENTORY (auditável)

Este inventário prioriza **multi-tenant**, **RPC-first**, **RLS**, **gates** e “cores” sensíveis (financeiro/billing).  
Se algo não estiver detalhado aqui, é **RISCO** — valide via `git log`/`git blame` e inspeção do arquivo.

## Escopo desta entrega (este patch)

Este patch adiciona/atualiza documentação e “context packs” para reduzir regressões, principalmente de multi-tenant:
- `AGENTS.md` (novo, raiz) — “Constituição”: invariantes, DoD e gatilhos
- `docs/multi-tenant/tenant-resolution.md` (novo) — tenant resolution “canônico”
- `docs/transfer-pack/*` (novo) — pacote de transferência/hardening
- `docs/contexto-projeto-excelencia.md` (update) — passa a apontar para `AGENTS.md`
- `.env.example` (update) — placeholders e nomes de env vars (sem segredos)

Comandos para auditar exatamente o que mudou neste patch:
```bash
git diff --name-status
git diff
```

RISCO:
- Este documento também referencia mudanças “macro” já existentes no repo (migrations/RPCs/gates).  
  Se você precisar de um inventário 100% completo “desde o início do projeto”, gere por range/labels no git (ver seção “Inventário completo via Git” no fim).

## A) Banco/Supabase

### A.1 Migrations (`supabase/migrations/*`)

Fonte da verdade: `supabase/migrations/`.

Comandos para inventário completo:
```bash
ls supabase/migrations | sort
```

Migrations críticas (multi-tenant / tenant resolution):
- `supabase/migrations/20270126210000_fix_tenant_leakage_header.sql` — header-first em `current_empresa_id()` + validação de membership.
- `supabase/migrations/20270126230000_fix_tenant_resolution_definitive.sql` — introduz `pgrst.db_pre_request` (RISCO histórico: set_config não-local).
- `supabase/migrations/20270127120000_fix_tenant_resolution_local_membership.sql` — **fix definitivo**: limpa tenant e usa `set_config(..., true)` + valida membership.
- `supabase/migrations/20270127121500_ops_tenant_diagnostics_more_readable.sql` — melhora legibilidade/diagnóstico (IDs mais palatáveis).

Migrations recentes (exemplo de bugfix):
- `supabase/migrations/20270129210000_fix_fin_alertas_vencimentos_tables.sql` — corrige `financeiro_alertas_vencimentos()` removendo dependência de tabela legada.

RISCO:
- Este arquivo não descreve as ~centenas de migrations individualmente. A auditoria completa exige leitura do arquivo ou revisão do histórico via `git log`.

### A.2 Funções/RPCs (contrato e garantias)

Tenant/auth (núcleo):
- `public._resolve_tenant_for_request()`
  - Contrato: resolve tenant por requisição.
  - Garantias: limpa GUC; set_config LOCAL; valida membership; fallback seguro.
  - Documento: `docs/multi-tenant/tenant-resolution.md`.
- `public.current_empresa_id()`
  - Contrato: retorna empresa ativa.
  - Garantias: header-first + membership; fallback seguro.

### A.3 Policies RLS (tabela + regra + motivo)

Política base (tenant-specific):
- `USING (empresa_id = public.current_empresa_id())`
- `WITH CHECK (empresa_id = public.current_empresa_id())`

Inventário operacional:
- Workflow: `.github/workflows/ops-rls-snapshot.yml`
- Docs: `docs/supabase-prod-alignment.md`

RISCO:
- Se existir tabela tenant-specific sem RLS ou sem policy por `current_empresa_id()`, há risco real de vazamento.

### A.4 Hooks de tenant/pre-request

- PostgREST: `pgrst.db_pre_request = public._resolve_tenant_for_request`
- Documento: `docs/multi-tenant/tenant-resolution.md`

## B) Frontend (src/**)

Padrões:
- Services/Hooks devem aguardar `activeEmpresaId` antes de chamar RPCs tenant-specific.
- Evitar `supabase.from()` fora de allowlist.
- Ao trocar empresa, invalidar caches do tenant anterior.

Bugfix recente:
- `src/components/rh/CargoFormPanel.tsx` — corrigiu erro TDZ (`Cannot access ... before initialization`) via reorder de hooks.

## C) CI/Release

Gates e enforce:
- `docs/release-gate.md`
- `.github/pull_request_template.md`
- Scripts:
  - `scripts/check_supabase_from_allowlist.mjs`
  - `scripts/check_postgrest_from_allowlist.mjs`
  - `scripts/check_no_direct_financeiro_tables.mjs`
  - `scripts/inventory_supabase_from.mjs`
  - `scripts/inventory_postgrest_from.mjs`

Estabilidade de testes:
- `package.json` — `vitest --sequence.concurrent=false` (evita flakiness/hang por concorrência).

## D) Observabilidade/Logs

Pontos relevantes:
- `supabase/functions/error-report/*` (captura e abre issue/email, quando habilitado por env)
- `scripts/rg03_db_asserts.sql` e afins (asserts para invariantes)

## E) Performance/FinOps

Padrões esperados:
- paginação por padrão em listagens,
- evitar overfetching e N+1 de RPC.

RISCO:
- Este inventário não lista cada tela; validar via e2e gates e inspeção de chamadas RPC.

## F) Resiliência

Padrões:
- idempotência em operações críticas (financeiro/vendas/cobrança/estoque),
- proteção contra double submit.

Referências:
- `docs/checklist-estado-da-arte-gaps.md`
- `CHECKLIST-ESTADO-DA-ARTE-9-10.md`

## Inventário completo via Git (recomendado quando “precisa ter certeza”)

### 1) Listar migrations criadas/alteradas em um período

Exemplo (ajuste o range conforme a iniciativa):
```bash
git log --since="2026-01-01" --name-only --pretty="format:" -- supabase/migrations | rg -v '^$' | sort -u
```

### 2) Listar mudanças por domínio (ex.: multi-tenant)
```bash
git log --grep "tenant" --name-only --pretty="format:%h %s"
```

### 3) Mapear acessos diretos (supabase.from / PostgREST)
```bash
node scripts/inventory_supabase_from.mjs
node scripts/inventory_postgrest_from.mjs
```
