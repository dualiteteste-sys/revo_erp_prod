# Checklist de Ordem (execução) — “Estado da Arte” completo

Este documento define a **melhor ordem** para evoluir o REVO ERP até o **Estado da Arte completo** (UI/UX, segurança, performance, confiabilidade, observabilidade e testabilidade), sem retrabalho.

Fonte de verdade dos itens e status: `docs/checklist-estado-da-arte-completo.md`.

## Regra do jogo (sempre)
- Trabalhar em `dev` → abrir PR `dev → main` → **merge só com checks verdes**.
- “Feito” = evidência + validação + **checks verdes** (RGs + E2E + migrations).
- Cada etapa abaixo deve resultar em **menos suporte** e **menos risco**.

---

## 0) Template do “Estado da Arte” (para qualquer módulo)

Antes de marcar qualquer módulo como “Estado da Arte”, ele precisa cumprir:

- **UX**
  - [ ] Fluxo principal (happy path) completo sem travar.
  - [ ] Estados vazios com CTA (sem dead-end).
  - [ ] Erro com “o que fazer agora” + retry (sem `alert()`).
  - [ ] Teclado/foco/ESC funcionando em modais e ações críticas.
- **UI / Design**
  - [ ] Layout consistente (PageShell: header/filtros/tabela/ações).
  - [ ] Form/Modal bonito e consistente (spacing, blur, tipografia).
  - [ ] Sem “aperto”: responsivo e confortável em telas comuns.
- **Dados**
  - [ ] Validações fortes e saneamento (BR quando aplicável).
  - [ ] Auditoria mínima (quem/quando/o que) em ações críticas.
  - [ ] Idempotência (clique duplo não duplica).
- **Segurança**
  - [ ] RBAC + enforcement em 3 camadas (menu/rota/DB).
  - [ ] RLS/empresa_id sempre (sem bypass via console).
- **Performance**
  - [ ] Lista grande não trava (paginação/virtualização quando necessário).
  - [ ] Budgets (bundle/lighthouse) não regressam no CI.
- **Observabilidade**
  - [ ] Logs úteis com correlation id e sem PII (LGPD).
  - [ ] Tela “Saúde” mostra falhas/reprocessos quando aplicável.
- **Testes**
  - [ ] Pelo menos smoke (unit/e2e) cobrindo o fluxo principal.

---

## 1) Ordem recomendada (waves)

### Wave 1 — “Fundação que destrava tudo” (reduz retrabalho)
Por quê: garante consistência visual/UX e evita regressões enquanto evoluímos módulos.

- [ ] PLAT-UX/DS/A11Y: padronizar formularios/modais e navegação por teclado (todos os módulos passam no mesmo padrão visual e de interação).
- [ ] QA-CHAOS-01: chaos-lite (timeout/rate-limit/retry/DLQ) para evitar bugs “fantasmas” no mundo real.
- [ ] RES-09: multitenancy-friendly scaling (limites/filas/locks por empresa) para impedir que 1 empresa derrube todas.

**Validar**
- Fluxos críticos continuam verdes no E2E gate.
- Navegação por teclado em modais principais.
- Simular falhas (offline/timeout/429) e ver fallback + retry.

### Wave 2 — “Cadastros core impecáveis”
Por quê: cadastros ruins viram suporte infinito em vendas, estoque, indústria e fiscal.

- [ ] CAD-STA-02: normalização tributária básica + consistência de unidade/SKU.
- [ ] CAD-STA-03: dedupe e saneamento (CPF/CNPJ/email/telefone) com alertas.

**Validar**
- Importar (CSV/XLSX) (preview + validação) e confirmar rollback em erro.
- Evitar duplicidade com sugestões claras.

### Wave 3 — “Suprimentos premium (menos divergência, mais previsibilidade)”
Por quê: estoque divergente e custo incorreto são a principal causa de dor operacional.

- [ ] SUP-STA-04: landed cost (rateio frete/impostos) e impacto em custo médio/relatórios.
- [ ] SUP-STA-06: WMS light (barcode/QR na conferência/separação) + checklists.
- [ ] SUPP-STA-02: coleta de diagnóstico anexável ao suporte (reduz tickets).

**Validar**
- Kardex e custo batem após rateio.
- Conferência com leitura funciona e bloqueia erros comuns.

### Wave 4 — “Vendas e PDV de operação grande”
Por quê: depois do core “redondo”, expandimos escala e governança.

- [ ] VEN-STA-04: multi-caixa + perfis por caixa + fechamento.
- [ ] FIN-STA-03: cobranças e automações (remessa/retorno quando aplicável).

**Validar**
- Fechamento por caixa fecha o dia sem divergência (auditável).

### Wave 5 — “Indústria fase 2 (rastreabilidade + dashboards)”
Por quê: vira diferencial competitivo quando o básico já está sólido.

- [ ] IND-STA-02: apontamentos com lote/qualidade e custos (fase 2).
- [ ] IND-STA-03: dashboards industriais (OEE-lite, filas, WIP, atrasos) com drill-down.

**Validar**
- Drill-down do dashboard chega até a OP/etapa/apontamento sem inconsistência.

### Wave 6 — “RH & Qualidade para operação real”
Por quê: complementa o pacote “indústria/serviços” e reduz risco operacional.

- [ ] RH-STA-01: trilhas/compliance de treinamentos (vencimentos, evidência).
- [ ] RH-STA-02: matriz de competências utilizável (gap → plano de ação → histórico).

### Wave 7 — “Admin / Multiunidade e Auditoria administrativa”
Por quê: habilita operações com filiais e governança (Scale).

- [ ] ADM-STA-03: multiunidade/filiais (escopo + permissões).
- [ ] ADM-STA-04: auditoria de mudanças administrativas.

### Wave 8 — “Dev/Operação e Integrações (evolução sem quebrar)”
Por quê: garante que evoluir integrações não vai quebrar clientes.

- [ ] DEV-STA-03: diagnóstico de schema/RPC (drift, migrations pendentes, cache).
- [ ] INT-STA-03: versionamento de adaptadores (migração de payloads sem downtime).
- [ ] SUPP-STA-03: central de notificações (incidentes, integrações, fiscal) com histórico.

### Wave 9 — “Fiscal (NF-e) — fechar com decisão de provedor”
Por quê: depende do provedor (Focus NF-e), mas precisa ficar “sem suporte”.

- [ ] NFE-STA-01: catálogo de rejeições + “o que fazer” + reprocessos guiados.
- [ ] NFE-STA-02: contingência e retomada segura (quando aplicável).
- [ ] NFE-STA-03: relatórios fiscais mínimos + export.

### Wave 10 — “Billing avançado (P1)”
Por quê: depois do core pronto, reduz churn e aumenta self-serve.

- [ ] BILL-STA-03: proration/upgrade/downgrade com comunicação clara + histórico.
- [ ] BILL-STA-04: self-serve de faturas/recibos/dados fiscais (quando aplicável).

---

## 2) Como executar (ritmo recomendado)

Para manter qualidade e velocidade:
- Execute em “lotes” de 3 itens por vez (P0/P1), sempre com:
  - PR pequeno
  - validação explícita (passo a passo)
  - varredura de console
  - checks verdes

---

## 3) Próximos 3 itens (sugestão)

Considerando o `docs/checklist-estado-da-arte-completo.md` atual, os primeiros 3 itens mais lógicos agora são:
- [ ] QA-CHAOS-01
- [ ] RES-09
- [ ] CAD-STA-02
