# Roadmap — Contratos (Serviços) “Estado da Arte”

Objetivo: evoluir o módulo atual (`/app/servicos/contratos`) do MVP para um motor de contratos SaaS-ready, com faturamento automático, UX assistida e trilha auditável.

## MVP2 (primeira entrega com valor real)

- Base do modelo (regras + agenda/schedule): https://github.com/dualiteteste-sys/revo_erp_prod/issues/300
- RPC gerar agenda (idempotente): https://github.com/dualiteteste-sys/revo_erp_prod/issues/301
- RPC gerar Contas a Receber a partir do schedule: https://github.com/dualiteteste-sys/revo_erp_prod/issues/302
- Job diário (automação): https://github.com/dualiteteste-sys/revo_erp_prod/issues/303
- UI “Faturamento” com preview: https://github.com/dualiteteste-sys/revo_erp_prod/issues/304
- Backfill do MVP (valor_mensal → regra): https://github.com/dualiteteste-sys/revo_erp_prod/issues/305
- Observabilidade + reprocessamento: https://github.com/dualiteteste-sys/revo_erp_prod/issues/306
- Testes (unit + e2e): https://github.com/dualiteteste-sys/revo_erp_prod/issues/307

## V1 (documento vivo + templates + assinatura)

- Versionamento imutável + trilha: https://github.com/dualiteteste-sys/revo_erp_prod/issues/308
- Templates como dados + variáveis: https://github.com/dualiteteste-sys/revo_erp_prod/issues/309
- Editor moderno + preview PDF: https://github.com/dualiteteste-sys/revo_erp_prod/issues/310
- Assinatura eletrônica + OTP fallback: https://github.com/dualiteteste-sys/revo_erp_prod/issues/311
- Renovação/aditivo/cancelamento: https://github.com/dualiteteste-sys/revo_erp_prod/issues/312
- Relatórios (forecast/MRR/ARR): https://github.com/dualiteteste-sys/revo_erp_prod/issues/313
- RBAC + gates por plano: https://github.com/dualiteteste-sys/revo_erp_prod/issues/314

## V1.5 (SaaS avançado e governança)

- Templates por tenant + governança: https://github.com/dualiteteste-sys/revo_erp_prod/issues/315
- Notificações/lembretes configuráveis: https://github.com/dualiteteste-sys/revo_erp_prod/issues/316
- Export/compartilhar (PDF/anexos/link): https://github.com/dualiteteste-sys/revo_erp_prod/issues/317

