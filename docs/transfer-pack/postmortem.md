# POSTMORTEM (resumo honesto)

## 1) Tenant leak (multi-tenant) — pooled connection state

### Sintoma
- Dados de Empresa B apareciam ao navegar logado na Empresa A (inclusive intermitente).

### Reprodução (típica)
- Troca rápida de empresa (ou múltiplas abas) seguida de chamadas RPC/listagens.

### Causa raiz
- Tenant era mantido em estado “não-local” no Postgres (`set_config(..., false)`), que pode **persistir em conexões reutilizadas** (pool), contaminando requisições seguintes.
- Header `x-empresa-id` era aceito sem validação robusta em alguns caminhos históricos.

### Patch
- Resolver tenant por requisição em `pgrst.db_pre_request`.
- Limpar tenant no início e setar tenant com `set_config(..., true)` (transaction-local).
- Validar membership antes de aceitar header.

### Por que impede regressão
- Mesmo com pool, a configuração é local à transação, então não “vaza” para a próxima requisição.

### Ainda pode falhar (RISCO)
- Se `pgrst.db_pre_request` não estiver aplicado em todos os roles necessários.
- Se existir tabela tenant-specific sem RLS/policies corretas.
- Se frontend chamar endpoints tenant-specific sem `x-empresa-id` (fallback pode pegar empresa preferida errada).

Validação: `docs/multi-tenant/tenant-resolution.md`.

## 2) Flakiness/hang em testes (Vitest)

### Sintoma
- `yarn test --run` parecia “travar” em alguns ambientes.

### Causa raiz (provável)
- Concorrência / ordem não determinística em suites dependentes de estado.

### Patch
- Rodar vitest em sequência (`--sequence.concurrent=false`) para aumentar determinismo em CI/local.

### RISCO
- É uma mitigação, não cura todos os testes mal isolados. Melhorar isolamento por teste é trabalho contínuo.

