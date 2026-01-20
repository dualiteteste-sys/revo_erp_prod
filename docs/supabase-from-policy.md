# Política — uso de `supabase.from()` (RPC-first)

Objetivo: manter o ERP “RPC-first” em domínios sensíveis (multi-tenant), evitando bypass de RLS e instabilidade (403/400 intermitentes), e garantindo rastreabilidade/auditoria.

## Regra

No código do app (`src/**`), **`supabase.from()` é proibido por padrão**.

### Permitido somente quando

1. A tabela é **explicitamente allowlisted** em `scripts/supabase_from_allowlist.json`, e
2. Existe uma **justificativa** clara (por que não é RPC), e
3. A tabela tem **RLS simples e comprovada**, ou é uma tabela **não-tenant / pública** (ex.: landing pública), e
4. O acesso não compromete o isolamento multi-tenant (sem risco de leak), e
5. Existe um **plano de migração** (quando aplicável).

## Enforcement (CI)

- `scripts/check_supabase_from_allowlist.mjs` falha o CI se encontrar `supabase.from()` fora do allowlist.
- O inventário é mantido em `INVENTARIO-SUPABASE-FROM.md` (gerado por `scripts/inventory_supabase_from.mjs`).

## Como migrar para RPC-first

1. Criar/ajustar RPC no Supabase (sempre via migration em `supabase/migrations/*`).
2. Garantir `current_empresa_id()` + `require_permission_for_current_user()` onde aplicável.
3. `SECURITY DEFINER` com `SET search_path = pg_catalog, public`.
4. Remover grants diretos da tabela (se for domínio sensível) e cobrir com asserts de verify.
5. Substituir `supabase.from()` no frontend por `callRpc()` / service.

