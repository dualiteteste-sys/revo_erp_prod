# Roadmap — Caminho do Sucesso (Revo ERP)

Este roadmap define a sequência mais lógica (início → fim) para transformar o Revo ERP no **melhor ERP do mercado**, guiando a execução do checklist **9/10**.

Checklist oficial desta fase: `CHECKLIST-ESTADO-DA-ARTE-9-10.md`

Regras do jogo:
- **Segurança e multi-tenant primeiro** (se isso falhar, todo o resto perde valor).
- **Sempre com migrations** para qualquer alteração Supabase.
- **Console limpo + checks verdes** como contrato antes de avançar de etapa.
- Trabalhar em “fatias verticais” (UI + serviço + RPC + RLS + testes) para cada domínio crítico.

---

## Fase 0 — Governança do processo (1–2 dias)

Objetivo: não perder qualidade/consistência conforme o sistema cresce.

Entregas:
- Padronizar o “Definition of Done” (DoD) por PR:
  - `release:check` verde (ou o gate equivalente no CI quando aplicável).
  - Console limpo / console-sweep verde.
  - `verify:migrations` verde quando houver qualquer mudança Supabase (sempre via migration).
  - Sem “fix no prod”: correção entra por PR e passa pelos gates.
  - Checklist atualizado (marcar `[x]/[ ]`) ao final do bloco.
- Padrão de entrega “5 em 5”:
  - Cada bloco fecha um conjunto coeso (“fatia vertical”) e termina com push em `dev`.
  - `prod` somente com comando explícito do owner.
- Criar disciplina de triagem: P0/P1/P2… sempre em ordem.

Gates de saída:
- CI configurado/disciplinado como bloqueio (sem bypass).
- Equipe alinhada em runbooks (migrations, incident response).

---

## Fase 1 — Segurança e Multi-tenant (P0 + P1) (prioridade máxima)

Objetivo: garantir isolamento entre empresas, RBAC consistente e “empresa ativa” determinística.

Sequência:
1) **Fechar P0.1/P0.2** (contexto + RBAC/ops).
2) **Executar inventário RLS** (dev e prod) e gerar snapshot.
3) **Corrigir RLS crítico (P1.1)**:
   - Começar por tabelas “core” (`empresas`, `empresa_usuarios`, `user_active_empresa`, billing).
4) **RPC-first em domínios sensíveis (P1.2)**:
   - Billing/stripe
   - Financeiro (movimentações, contas, conciliação)
   - Indústria (OP/execução)
5) Revisão de `SECURITY DEFINER`/grants (P1.3).

Gates de saída:
- Auditoria manual cross-tenant: **sempre negado**.
- “Tabela direta no client”: inventariada e aprovada.
- 0 403 intermitentes por 7 dias (monitorado).

---

## Fase 2 — Confiabilidade (P2)

Objetivo: eliminar duplicidades e estados “meio gravados” nos fluxos críticos.

Sequência:
1) Listar operações críticas por domínio e padronizar:
   - Idempotência (keys/unique constraints).
   - Transações (RPC) para multi-tabela.
2) Tratar double-submit (UI lock + dedupe no backend).
3) Padronizar retries apenas transitórios (rede/5xx/429).
4) Expandir E2E para “fluxos de dinheiro” e “fluxos de estoque/produção”.

Gates de saída:
- Nenhuma duplicidade por double-submit em testes.
- E2E cobre os caminhos “happy path” e “erro esperado” sem console vermelho.

---

## Fase 3 — Performance (P3)

Objetivo: garantir escalabilidade e rapidez conforme volume de dados cresce.

Sequência:
1) Padronizar paginação/filtros/ordenação em todas listagens grandes.
2) Remover `select('*')` e reduzir payload (colunas mínimas).
3) Consolidar dashboards em RPCs agregadas (evitar N+1).
4) Índices e otimizações via migrations guiadas por métricas (FinOps).

Gates de saída:
- SLO definido e atingido nas telas críticas (dashboards/listas).
- Custo previsível (menos overfetch, menos chamadas).

---

## Fase 4 — Manutenibilidade (P4)

Objetivo: manter o time rápido e o código legível (sem regressões).

Sequência:
1) Refatorar “arquivos gigantes” em subcomponentes + services + contracts.
2) Reduzir `any` por domínio crítico (budget + bloqueio de novos).
3) Consolidar normalizers/DTOs por RPC e testes unitários.
4) Harmonizar estrutura em camadas e nomes consistentes.

Gates de saída:
- Redução mensurável de `any` em áreas críticas.
- PRs menores e revisáveis; menos regressões.

---

## Fase 5 — Observabilidade e Suporte (P5)

Objetivo: detectar problemas antes do cliente e acelerar correção.

Sequência:
1) `request_id` ponta-a-ponta (client → RPC/Edge → logs).
2) Taxonomia de eventos por domínio.
3) Painel interno “Erros no Sistema” com triagem e SLA beta.

Gates de saída:
- Cada bug tem contexto suficiente para reproduzir.
- Redução de “bugs silenciosos” (monitoramento cobre).

---

## Fase 6 — Qualidade e Testes (P6)

Objetivo: reduzir drasticamente regressões e “surpresas”.

Sequência:
1) Fortalecer `release:check` como gate total.
2) Expandir console-sweep (rotas principais) e casos de erro esperado.
3) DB asserts (verify) para invariantes de RLS e operações críticas.

Gates de saída:
- CI verde de forma consistente (sem “consertar no prod”).

---

## Fase 7 — UX/Responsividade (P7 + P12)

Objetivo: UX impecável e coerente (desktop/tablet/mobile), mantendo a “UI bonita”.

Sequência:
1) Matriz de breakpoints e telas críticas.
2) Consistência de componentes (modais, toasts, datepicker, selects, tabelas).
3) Redução de fricção em fluxos e microinterações (efeitos sutis).

Gates de saída:
- Zero “UI quebrada” em mobile/tablet nos fluxos principais.

---

## Fase 8 — Compliance/LGPD + FinOps + DR (P8 + P9 + P10)

Objetivo: estar pronto para o mercado com baixo risco operacional.

Sequência:
1) Sanitização de logs e política de retenção.
2) Rotinas LGPD (export/remoção) com auditoria.
3) FinOps: top queries/RPC, índices, retenção, budgets.
4) Backups por tenant + restore drill periódico e runbooks de incidentes.

Gates de saída:
- Restore drill automatizado em `verify`.
- Runbooks completos para incidentes críticos.

---

## Como executar no dia a dia (ritual)

1) Escolher **um** item do checklist (P0 → P10).
2) Implementar “fatia vertical” (UI + service + RPC + RLS + testes).
3) Validar console limpo.
4) Rodar gates locais (`yarn test --run`, e quando necessário `yarn test:e2e:gate:all`, `yarn verify:migrations`).
5) Subir para `dev`, esperar checks verdes, só depois avançar.
