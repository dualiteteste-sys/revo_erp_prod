# CHECKLIST — Estado da Arte (Revo ERP)

Este documento é o “roteiro mestre” para elevar o ERP ao **Estado da Arte** e atingir **nota mínima 9/10** nos quesitos técnicos e de produto.

Como usar:
- Marque itens concluídos com `- [x]` e pendentes com `- [ ]`.
- Execute **na ordem** (P0 → P1 → P2). Só avance quando os critérios de aceite do bloco estiverem verdes.
- Regra de ouro: **qualquer alteração no Supabase vira migration**.

Definições:
- **Console limpo**: sem erros no Console e sem respostas de Network com `4xx/5xx` em fluxos esperados.
- **Checks verdes**: pipeline + migrations verify + e2e gate verdes em `dev` e, quando autorizado, em `prod`.
- **Causa raiz** > “patch”: sempre corrigir origem (estado, contrato, RLS, idempotência).

---

## P0 — Estabilizar 403 intermitente (Multi-tenant / Empresa ativa)

Objetivo: **zerar 403 intermitente** em Scale/OWNER e evitar que isso apareça em planos/roles inferiores.

### 0.1 Diagnóstico rápido (reprodutibilidade)
- [ ] Capturar 10 ocorrências reais de `403` em produção/dev com: rota, RPC/tabela, `request_id`, usuário, empresa_id, status/erro completo.
- [ ] Confirmar se o 403 é Postgres `42501` (“Acesso negado/empresa inválida/plano indisponível”) vs 403 de Edge Function (billing/portal/invite/etc.).
- [x] Criar uma página interna “Diagnóstico → 403” (ou estender a atual) para listar últimos erros 403 agrupados por `fn`/rota.
- [x] Exportar amostra (snapshot + 10 eventos) com botão “Copiar amostra (10)” para colar direto no suporte/dev.

### 0.2 Frontend: tornar “empresa ativa” determinística (não oscilar)
- [x] Ajustar React Query keys em `useEmpresas/useActiveEmpresaId` para incluir `userId` (evitar cache cruzado).
- [x] Implementar retry/backoff para `user_active_empresa` e `empresa_usuarios` (somente para falhas transitórias: timeout/failed to fetch/502/503).
- [x] Não converter erro transitório em `null/[]` silenciosamente; manter último valor válido do cache.
- [x] Implementar **AuthGate**: não renderizar módulos `app/*` enquanto `activeEmpresaId` não estiver resolvido (mostrar tela bonita “Carregando ambiente…”).
- [x] Implementar “recovery automático” quando uma RPC falhar por `42501`/sem empresa ativa: refetch → set_active (se único vínculo) → retry 1x.
- [x] Padronizar o tratamento de “empresa ativa ausente”: modal “Selecione sua empresa” (nunca um 403 genérico).
- [x] E2E regressão: “empresa ativa ausente” não quebra login e auto-seleciona quando há vínculo único.

### 0.3 Supabase: garantir preferências de empresa (para multi-empresa)
- [x] Trigger/rotina para garantir que `user_active_empresa` exista quando o usuário tiver 1 empresa (auto-set) e quando virar multi-empresa (preservar escolha).
- [x] Restringir `DELETE` de `user_active_empresa` quando o usuário for membro de >1 empresa (ou forçar troca via RPC).
- [x] Criar/ajustar RPC “context snapshot” (whoami + empresa ativa + role + plano) para debug rápido.

### 0.4 Observabilidade do 403
- [x] Logar automaticamente (em tabela) todo `HTTP_403` com `fn`, `request_id`, `empresa_id`, `user_id`, `route`, `role`, `plan`.
- [x] Dashboard interno “Top 403 por módulo” com filtros e status “investigando/corrigido”.
- [ ] Alertar automaticamente quando houver 403 do tipo `missing_active_empresa` (GitHub Issue/OPS ALERT).

**Aceite P0**
- [ ] Rodar `yarn test:e2e:gate:all` com **console-sweep verde**.
- [ ] 0 ocorrências de 403 intermitente em 48h (dev) para fluxos principais (auth, dashboard, vendas, suprimentos, financeiro, indústria).

---

## P1 — Segurança / Multi-tenant (RLS + RPC) (meta 9/10)

### 1.1 RLS/Isolamento por empresa (inventário)
- [x] Criar inventário RLS (RPC + UI) listando tabelas públicas, flags de RLS/policies e metadados para triagem rápida.
- [ ] Executar o inventário: garantir `empresa_id` e policy com `current_empresa_id()` quando aplicável.
- [ ] Identificar tabelas acessadas diretamente pelo client e migrar para RPC sempre que houver risco de bypass.
- [ ] Validar que `SECURITY DEFINER` nunca retorna dados de outra empresa (sempre filtrar por `current_empresa_id()`).

### 1.2 RBAC consistente
- [ ] Garantir que OWNER/ADMIN tenham permissão total por seed incremental (sem depender de ambientes antigos).
- [ ] Mapear permissões por módulo e padronizar `require_permission_for_current_user(module, action)` nos RPCs críticos.
- [ ] Padronizar mensagens de permissão (PT-BR) + código consistente (`42501`) e tradução UX (“Acesso negado / fale com admin”).

### 1.3 Plano (feature gating) consistente
- [ ] Garantir que `plano_mvp_allows()` reflita `empresa_entitlements` sempre (sem fallback “ambos” mascarando inconsistência em prod).
- [ ] Criar testes (DB asserts) garantindo que tabelas `industria_*` e `servicos/os_*` respeitam gating quando plano não permite.

**Aceite P1**
- [ ] Auditoria manual: tentar acessar dados de outra empresa (multi-tenant) e falhar corretamente.
- [ ] E2E de “Plan gating” verde (todos os planos).

---

## P2 — Confiabilidade / Resiliência (meta 9/10)

### 2.1 Idempotência e consistência transacional
- [ ] Para operações críticas (financeiro, emissão, estoque, pedidos, produção), aplicar chaves de idempotência e/ou `unique` + `on conflict` + logs.
- [ ] Garantir que RPCs críticas sejam atômicas (transação) e não deixem “meio gravado”.
- [ ] Padronizar locks (evitar `pg_advisory_xact_lock(bigint,bigint)` incompatível) e documentar o padrão suportado.

### 2.2 Resiliência de rede
- [ ] Padronizar retry/backoff (somente para transitórios) e evitar double-submit (botões com lock).
- [ ] Garantir “offline-safe” nos fluxos críticos (pelo menos UX: “tentando reconectar”, “tentar novamente”).

### 2.3 Migrações seguras
- [ ] Criar checklist de migration: reversibilidade, `grant/revoke`, `pgrst reload`, seed incremental, compatibilidade.
- [ ] Garantir `verify:migrations` sempre verde (local + CI).
- [ ] Backup de dados (registros) durável e barato: dump diário → Cloudflare R2 + restore drill semanal + backup local (script).
- [ ] Backups manuais (UI interna): “Dev → Backups” com disparo de backup/restore via workflows (com confirmações de segurança).
  - [x] Implementação no código (UI + Edge Function + workflows + migration catálogo `ops_db_backups`).
  - [ ] Deploy/migrations aplicadas (dev/prod) + validação de ponta a ponta (disparo, catálogo, restore em `dev/verify`).

---

## P3 — Performance / Eficiência (meta 9/10)

### 3.1 Padrões de paginação/filtros
- [ ] Padronizar paginação (limit/offset ou cursor) em todas as listas grandes.
- [ ] Evitar overfetch (select *); buscar apenas colunas necessárias.
- [ ] Garantir índices para filtros e ordenações frequentes (migrations).

### 3.2 Redução de N+1 e chamadas excessivas
- [ ] Auditar telas críticas (dashboard, listas grandes) e reduzir RPCs/queries por tela.
- [ ] Cache control: `staleTime`, `keepPreviousData`, invalidações coerentes por `empresaId`.

---

## P4 — Manutenibilidade (meta 9/10)

### 4.1 Arquitetura e padrões
- [ ] Consolidar bootstrap/empresa ativa em um único “source of truth” (remover duplicidades e caminhos alternativos).
- [ ] Padronizar camadas: `pages → components → hooks → services → lib`.
- [ ] Reduzir arquivos “gigantes” e duplicações; extrair utilitários comuns.

### 4.2 TypeScript (zero-any em áreas críticas)
- [ ] Remover `any` em fluxos core (auth, billing, imports, financeiro, indústria).
- [ ] Padronizar DTOs/Types por RPC (input/output) e validar com testes.

---

## P5 — Observabilidade (meta 9/10)

### 5.1 Eventos e rastreabilidade
- [ ] Padronizar `x-revo-request-id` e propagar para logs/RPC metrics/erro report.
- [ ] Criar taxonomia de eventos (auth, rpc, finance, estoque, billing, industria).
- [ ] Painel interno: erros por severidade, por módulo, por empresa, por usuário.

### 5.2 Error reporting (beta)
- [ ] Garantir que o “feedback para dev” só apareça para erros inesperados (5xx/uncaught) e não validações de uso.
- [ ] Garantir que o envio funciona em dev/prod (CORS, secrets) e que armazena em `error_reports`.

---

## P6 — Testabilidade / Qualidade (meta 9/10)

### 6.1 Cobertura de gates
- [ ] Garantir `release:check` verde (unit + e2e + migrations).
- [ ] Ampliar E2E para fluxos mais críticos do beta (assinar, ativar empresa, criar pedido, receber XML, gerar financeiro, indústria).
- [ ] Adicionar testes de regressão específicos para: empresa ativa + 403 + plan gating.

### 6.2 “Console limpo” como contrato
- [ ] Expandir `e2e/console-sweep.spec.ts` para cobrir rotas principais e casos de erro esperados (sem stack trace).

---

## P7 — Usabilidade / UX (meta 9/10)

### 7.1 Fluxos “sem fricção”
- [ ] Revisar fluxos com cliques redundantes (ex.: importação XML → finalizar) e reduzir etapas.
- [ ] Padronizar feedback: loading, sucesso, erro (toast palatável), e recovery.

### 7.2 UI consistente e moderna
- [ ] Padronizar modais (min-width 40vw, responsivo) e overlays (toasts sempre acima do vidro fosco).
- [ ] Padronizar componentes (selects, datepicker, money input, tables com resize/sort).

---

## P8 — Compliance / Privacidade (LGPD) (meta 9/10)

- [ ] Revisar sanitização: nunca logar senhas/tokens/PII indevida (auditar logs e `sanitizeLog`).
- [ ] Implementar exportação/remoção de dados (quando aplicável) com trilha de auditoria.
- [ ] Documentar retenção de logs e acessos internos (padrão para clientes).

---

## P9 — FinOps / Custo (meta 9/10)

- [ ] Auditar RPCs mais pesadas (tempo, volume) e otimizar (índices, agregações, caching).
- [ ] Definir limites e arquivamento (logs antigos, eventos, snapshots).
- [ ] Estabelecer budgets (bundle/perf) e alertas.

---

## P10 — Responsividade (meta 9/10)

- [ ] Matriz de breakpoints (mobile/tablet/desktop) para telas principais.
- [ ] E2E visual (ou screenshots) para componentes críticos (tabelas, modais, filtros, calendário).
- [ ] Ajustar overflow/colunas truncadas e padrões de densidade por viewport.

---

## “Done” (Estado da Arte 9/10)

- [ ] 0 instabilidades de empresa ativa / 403 intermitente em produção por 7 dias (monitorado).
- [ ] `release:check` verde e executado regularmente.
- [ ] Painel interno de erros/403 com triagem e SLA (beta).
- [ ] Documentação mínima: arquitetura, multi-tenant, migrations, padrões de UI e testes.
