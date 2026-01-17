# Runbook — Stripe Dedupe (Revo ERP)

Objetivo: remover duplicidades de `Customer` no Stripe com **segurança**, sem quebrar acesso do tenant (403) e com plano de rollback via **backup/restore**.

## Pré-requisitos
- Acesso `ops:manage` no ERP.
- Backup por tenant funcionando (R2 + GitHub dispatch).
- Tenant alvo selecionado (empresa ativa correta no ERP).

## Fluxo recomendado (estado da arte)
1) **Preparar (prod)**
   - No ERP: `Desenvolvedor → Backup por Empresa`
   - Gere um backup com label: `antes-limpeza-stripe`.
   - Confirme que o backup apareceu no catálogo (tabela `ops_tenant_backups`).

2) **Restore drill (verify)**
   - No ERP: `Desenvolvedor → Backup por Empresa` → `Restore drill (verify)` usando o backup recém criado.
   - Aguarde o workflow terminar verde.
   - No ambiente `verify`: valide o “check mínimo pós-restore”:
     - Login owner funciona.
     - Empresa ativa abre sem 403.
     - Assinatura sincroniza automaticamente (sem clicar em “Sincronizar”).

3) **Diagnosticar duplicidade**
   - No ERP: `Desenvolvedor → Stripe: Dedupe`
   - Clique `Buscar no Stripe` (use email/CNPJ para refinar).
   - No painel de **Duplicidades detectadas**, filtre por:
     - `email` (mesmo email em vários customers),
     - `cnpj` (mesmo CNPJ em vários customers),
     - `empresa_id` (mesmo tenant em vários customers).
   - Identifique o **customer recomendado** (badge “Recomendado”).

4) **Vincular o customer correto**
   - Clique `Vincular ao tenant` no customer correto (idealmente o recomendado).
   - Isso define `empresas.stripe_customer_id` e tenta sincronizar assinatura (best-effort).

5) **Arquivar duplicados (com segurança)**
   - Só arquive customers que **não** são o recomendado **e** não têm assinatura.
   - Clique `Arquivar` nos duplicados elegíveis.
   - Nunca delete um customer com assinatura ativa/trialing/past_due/unpaid/incomplete.

6) **Re-sync e validação final**
   - No ERP: `Configurações → Minha Assinatura`
   - Validar:
     - Plano/assinatura carregam automaticamente.
     - Acesso aos módulos do plano não cai (sem 403 intermitente).
   - Se algo ficar inconsistente:
     - Refaça o vínculo com o customer recomendado.
     - Rode sync novamente (best-effort).

## Rollback (se algo der errado)
- Use o backup `antes-limpeza-stripe` para restaurar o tenant em `verify` e reproduzir o problema com segurança.
- Em último caso, restaure `prod` somente com confirmação explícita e janela controlada.

