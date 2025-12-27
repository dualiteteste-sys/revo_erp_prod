# Checklist Go‑Live (DEV → PROD)

Legenda:
- `[x]` concluído
- `[ ]` pendente
- `[ ] (parcial)` feito em parte, falta fechar

## 0) Release Gate (qualidade e deploy)
- [x] RG-01 Padronizar “Release Gate” local/CI: `yarn test --run` + E2E suite + `yarn verify:migrations` obrigatórios
- [x] RG-02 Pipeline PROD: “compare expected vs PROD schema” sem divergências (migrations idempotentes)
- [ ] RG-03 Console limpo: capturar/zerar erros (tratamento central + bloquear `alert()`/erros não tratados) *(parcial: ErrorBoundary + Sentry ok, falta hardening de console/unhandled)*
- [ ] RG-04 Checklist E2E por plano (Serviços/Indústria) com “happy path” automatizado *(parcial: suites existem; falta validar cobertura mínima e travas)*

## 1) Configurações Comerciais (Planos/Limites + RBAC)
- [ ] CFG-01 Tela Configurações → Plano/Limites por empresa (módulos habilitados + limites)
- [ ] CFG-02 Enforcement em 3 camadas: Menu + Rotas + RPC/DB (ninguém burla via console)
- [ ] CFG-03 Gestão de permissões por usuário (Super Admin sempre full; perfis Member/Viewer)
- [ ] CFG-04 Feature flags por empresa (incluindo NF‑e) com fallback seguro e auditoria

## 2) NF‑e Ativa (MVP real SP/PR, regime “Ambos”)
- [ ] NFE-01 Modelos/tabelas internas + UI base (rascunho NF‑e, itens, totais, destinatário/emitente)
- [ ] NFE-02 Cadastro fiscal completo: empresa emitente (certificado A1), série/numeração, ambiente, CSC (se aplicável)
- [ ] NFE-03 Cadastro fiscal de cliente/produto (NCM/CFOP/CST/CSOSN, natureza operação, regras por UF/regime)
- [ ] NFE-04 Motor fiscal parametrizável v1 (cálculo + validação + preview do XML antes de emitir)
- [ ] NFE-05 Integração NFE.io (emissão): enviar, consultar status, armazenar XML/DANFE, logs
- [ ] NFE-06 Webhooks + fila/retry idempotente (processar eventos NFE.io; reprocessar com segurança)
- [ ] NFE-07 Operações fiscais essenciais: cancelamento, CCe (se aplicável), inutilização (se necessário), reimpressão DANFE
- [ ] NFE-08 Observabilidade fiscal: auditoria por NF (eventos, falhas, tentativas, payloads saneados)

## 3) Financeiro Essencial (core comum)
- [ ] FIN-01 Contas a Receber ponta‑a‑ponta (criar/baixar/estornar/cancelar) + conciliação mínima
- [ ] FIN-02 Contas a Pagar ponta‑a‑ponta (criar/baixar/estornar/cancelar)
- [ ] FIN-03 Tesouraria/Caixa + movimentações/saldos confiáveis
- [ ] FIN-04 Integração de origens (OS → A Receber; Compras/Recebimentos → A Pagar)
- [ ] FIN-05 Relatórios essenciais (A receber/A pagar/Caixa; faturamento por período)

## 4) Plano A — Serviços (OS) “pronto para vender”
- [ ] OS-01 OS UX “estado da arte” (status/agenda/anexos/histórico/custos) — ajustes finais + permissão UI
- [ ] OS-02 Relatórios de OS (status/cliente/período + faturamento) validados com dados reais
- [ ] OS-03 Amarração OS ↔ financeiro (gerar/abrir/baixar conta) com auditoria

## 5) Plano B — Indústria Essencial “pronto para vender”
- [ ] IND-01 OP/OB wizard consistente e travas de estados (inclui cancelados/readonly correto)
- [ ] IND-02 Execução (operações/apontamentos/entregas) com permissões e sem inconsistências
- [ ] IND-03 Roteiros + BOM (produção/beneficiamento/ambos) + persistência e seleção corretas
- [ ] IND-04 Suprimentos mínimo: recebimentos XML + conferência + vínculos + estoque/saldos/movimentações
- [ ] IND-05 Qualidade mínimo: planos/motivos/lotes/bloqueio com auditoria
- [ ] IND-06 Relatórios essenciais: WIP/filas/eficiência/estoque/qualidade

## 6) Go‑Live Operacional
- [ ] GL-01 Onboarding por empresa (checklist de config fiscal/financeiro/RH)
- [ ] GL-02 Backup/restore + rotinas de suporte (exportações, trilha de auditoria)
- [ ] GL-03 Hardening final (permissões, RLS, RPCs, rate limits, erros amigáveis)

