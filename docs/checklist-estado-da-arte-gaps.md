# Checklist “Estado da Arte” — Sanitização de Gaps (REVO ERP)

Objetivo: ter uma lista que você consegue seguir periodicamente para reduzir bugs, drift e fricção de operação sem perder velocidade.

---

## 0) Pré-requisitos (1 vez por ambiente)

- `main` é a única fonte de deploy em PROD (sem hotfix manual sem virar migration).
- Regra: qualquer alteração no Supabase (por mínima que seja) vira migration em `supabase/migrations/*` (sem “ajuste manual no dashboard”).
- Redirect URLs no Supabase (Auth → URL Configuration) incluem, no mínimo:
  - `https://erprevo.com/auth/update-password`
  - `https://erprevo.com/auth/force-change-password`
  - (DEV/local conforme necessário)
- Edge Functions deployadas e sincronizadas com o front (`supabase/functions/*`).

---

## 1) Convites (Invite) — “funciona sempre”

### 1.1 Banco (RLS/RPC)

- `accept_invite_for_current_user(p_empresa_id uuid)`:
  - não deve retornar 400 por mismatch de tipo (status enum vs text)
  - deve ser idempotente (`PENDING` → `ACTIVE`, `ACTIVE` permanece `ACTIVE`)
  - deve setar `user_active_empresa` (UX: entra direto na empresa certa)
- Migrations:
  - mudanças em convites/usuários só via `supabase/migrations/*` (nunca legacy)
  - após aplicar em remoto, rodar `notify pgrst, 'reload schema'` (automatizado nas migrations/workflows)

### 1.2 Edge Functions (Invite / Resend / Link)

- `invite-user`:
  - valida permissão (RBAC `usuarios:manage` ou OWNER/ADMIN)
  - cria vínculo `empresa_usuarios` como `PENDING`
  - retorna `ok/action` e deixa claro que link manual é gerado via `resend-invite link_only`
- `resend-invite`:
  - suporta `link_only: true` para gerar link manual (plano B) sem depender de “falhou enviar e-mail”
  - retorna `action_link` quando `link_only`
- Log/observabilidade:
  - logar `x-revo-request-id` (front já injeta)
  - garantir que erros retornem JSON consistente (`{ ok:false, error, detail }`)

### 1.3 Frontend (UX resiliente)

- Ao convidar usuário:
  - sempre mostrar caminho “plano B”: botão “Gerar link (plano B)” e copiar para clipboard
  - não depender de link automático no “invite succeeded”
- Ao aceitar convite na tela de senha:
  - se o RPC falhar, tratar como “senha já pode ter sido salva” e permitir retry sem exigir senha diferente
  - mensagens claras para `otp_expired` e links antigos (“use o mais recente”)
- Na lista de usuários (status `PENDING`):
  - ação “Reenviar convite” (e-mail)
  - ação “Gerar link (copiar)” (plano B)

---

## 2) Cadastro manual (Admin cria + usuário troca senha no 1º login)

### 2.1 Segurança mínima (não negociar)

- Somente `OWNER/ADMIN` ou `usuarios:manage` consegue criar manualmente.
- Fluxo manual não pode “tomar conta” de usuário existente:
  - se o e-mail já existe no Auth, retornar erro e orientar usar convite/reenviar convite.
- Sempre registrar rastreabilidade:
  - `user_metadata.created_by`, `created_via=manual`

### 2.2 UX “muito fácil”

- Admin cria usuário com senha temporária (copiar/colar).
- No primeiro login:
  - bloquear app e forçar `/auth/force-change-password`
  - após trocar senha, confirmar vínculo na empresa (aceitar convite) e liberar app.

---

## 3) Observabilidade e ruído (prioridade alta)

- Zerar `console.log` em produção:
  - trocar por `logger.debug/info` com gate por ambiente (DEV only quando necessário)
- Garantir sanitização de dados sensíveis nos logs (token/email/doc):
  - revisar `src/lib/sanitizeLog.ts` quando novos campos forem adicionados

---

## 4) React Hooks (stale closures = bugs “fantasmas”)

- Prioridade: warnings `react-hooks/exhaustive-deps` nos fluxos críticos (financeiro/estoque/onboarding).
- Regra: quando suprimir dependência, justificar com memo/callback estável ou ref.

## 4.1) Guias rápidos e Roadmap (nunca desatualizar)

Objetivo: toda mudança de fluxo/UX deve refletir no “Guia rápido” (ajuda contextual) e, quando aplicável, no Roadmap/Onboarding.

- Ajuda contextual (por página): `src/components/support/helpCatalog.ts`
  - Se mudar um fluxo ou a ordem ideal de ações em uma rota, atualizar `whatIs/steps/dependsOn/commonMistakes/links`.
  - Se criar módulo/rota nova, criar entrada com `match: '/app/...'` e texto objetivo.
- Roadmap/Onboarding por módulo: `src/components/roadmap/roadmaps.ts`
  - Se mudar o “mínimo necessário” para começar a operar (ex.: conciliação, centro de custo, unidades de medida), atualizar o passo e a função `check`.
  - Se criar novo “gate” (regra/validação), garantir que existe passo no Roadmap explicando e linkando para o módulo correto.
- Regra de ouro: PR que altera UI/fluxo deve trazer **junto**:
  - atualização do guia e/ou roadmap correspondente
  - ao menos um E2E/Smoke cobrindo o fluxo alterado (ou ajuste do existente)
  - “console limpo” (evitar `console.error` em produção; E2E falha com isso)

---

## 5) Deploy e gates (sempre antes de merge/release)

- Local (quando possível):
  - `yarn test --run`
  - `yarn build`
- Gate completo (quando for release):
  - `yarn release:check`
  - (inclui `verify:migrations` e E2E gates)

## 5.1) Política “anti‑surpresa” (testes por risco)

Objetivo: minimizar ao máximo surpresas durante QA e, principalmente, em PROD.

- Regra: **toda mudança deve ter um “sinal de segurança”** (teste automatizado ou gate) proporcional ao risco.
- Console limpo é obrigatório: `e2e/fixtures.ts` falha com `console.error` e `pageerror`.
- Quando mudar fluxo/UX crítico (auth/onboarding/financeiro/estoque/vendas):
  - atualizar/criar ao menos 1 E2E/Smoke cobrindo o “happy path”
  - adicionar 1 cenário de falha comum (retry, permissão, validação) quando fizer sentido
- Quando mudar service/RPC/shape de retorno:
  - adicionar/ajustar teste unitário de normalização/contrato (evitar regressão silenciosa)
- Quando tocar Supabase:
  - migration obrigatória + `verify:migrations`/RG-03 passando no CI
- Checklist de validação manual curta (quando necessário):
  - 3–5 passos “golden path” no ambiente (DEV/preview) apenas para UX (não substitui testes)

---

## 6) Performance (bundle)

- Monitorar:
  - `node scripts/check_bundle_budgets.mjs`
  - chunk principal (gzip) e libs pesadas (ex.: QR reader)
- Ações típicas:
  - code-splitting por rota (lazy import)
  - evitar imports estáticos que impedem split (ex.: “import estático” de página lazy)

---

## 7) Configuração de ambiente (evitar “apontou pro lugar errado”)

- Não depender de fallback hardcoded de `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` em PROD.
- `.env.example` deve listar o mínimo que precisa existir para build/execução.

---

## 8) Manutenibilidade / Padrões de código (reduzir bugs e custo)

- [ ] Não aumentar warnings de lint (meta: reduzir continuamente); CI deve falhar se exceder teto de warnings (teto desce com o tempo).
- [ ] Proibir `console.*` no código de app (`src/**`) — usar `logger` + toast; manter E2E “console limpo”.
- [ ] Reduzir `any` em diretórios críticos (`src/services`, `src/lib`, `src/hooks`) e reforçar tipagem de payload/retornos de RPC.
- [ ] Proibir `select('*')` em services (listar colunas ou preferir RPC com contrato).
- [ ] Evitar componentes “God” e duplicação de lógica: extrair para `services/hooks/lib`.
- [ ] Padronizar inputs e UI base (sem “um módulo por estética”): `Modal/Table/Input/DatePicker/Autocomplete`.

## 9) Segurança (AppSec + Multi-tenant)

- [ ] “Tudo é tenant”: garantir `empresa_id` em todas as tabelas relevantes e em todo fluxo crítico.
- [ ] RLS como base: tabelas multi-tenant com policies corretas e testadas (nenhuma tela deve depender de bypass).
- [ ] Preferir RPCs seguras: evitar acesso direto às tabelas quando houver risco de vazamento ou lógica de permissão.
- [ ] Operações sensíveis (financeiro/vendas/estoque) devem ser idempotentes e protegidas contra double-submit.
- [ ] Sanitização de logs: nunca logar token/OTP/PII sensível; manter sanitização atualizada ao adicionar campos.

## 10) Confiabilidade / Resiliência (menos “meio gravado”)

- [ ] RPCs críticas em transação (atomicidade) e com mensagens de erro úteis e “actionable”.
- [ ] Idempotência em: geração de cobranças/títulos, baixas, estornos, conciliações, importações em lote.
- [ ] “Retry seguro”: front deve permitir retry sem efeitos colaterais (especialmente em rede instável).
- [ ] “Plano B” em fluxos essenciais (convite/cadastro manual, importações, conciliação).

## 11) Performance / Escalabilidade

- [ ] Padrão de paginação consistente em listas grandes (server-side + filtros).
- [ ] Reduzir overfetching e N+1 (principalmente em dashboards e telas de alta navegação).
- [ ] Medir e limitar payload de RPCs (retorno “shape” estável e pequeno).
- [ ] Bundle budgets e code-splitting por rota (`yarn verify:bundle`).

## 12) Observabilidade (debug rápido em produção)

- [ ] Logs estruturados com `x-revo-request-id` em Edge Functions e RPCs (correlação).
- [ ] Eventos de auditoria para ações críticas (quem criou/alterou/estornou/gerou).
- [ ] Padrão de erro de API consistente: `{ ok:false, error, detail, request_id }`.
- [ ] Sentry/monitoramento: rotas críticas com breadcrumbs úteis (sem PII).

## 13) Testabilidade (anti‑surpresa)

- [ ] Unit tests para “contratos” de services (normalização/shape de retorno).
- [ ] E2E gate cobrindo fluxos críticos (auth, vendas, financeiro, estoque, contratos) + console limpo.
- [ ] Visual capture (screenshots) para páginas-chave (regressão visual “barata”).
- [ ] Toda mudança em UI global deve passar `yarn test:e2e:gate:all` antes de merge/release.

## 14) UX / UI (“estado da arte” e consistência)

- [ ] Componentes globais como fonte de verdade: `DatePicker`, `Input`, `Modal`, `Table`, `Autocomplete`.
- [ ] Padrão de calendário do sistema:
  - [ ] Cabeçalho `<` `Mês Ano` `>`; clique em `Mês Ano` abre overlay anos/meses com animação; sem scrollbars.
  - [ ] Popover expande apenas quando a view de anos/meses está aberta.
- [ ] Campos de data padronizados: evitar `input type="date"` nativo; sempre usar o padrão do sistema.
- [ ] Acessibilidade: navegação por teclado, foco visível, labels/aria corretos.
- [ ] Micro-interações sutis (150–220ms, ease-out) e consistentes; evitar “layout jump” e sobreposições incoerentes.

## 15) Compliance / Privacidade (LGPD)

- [ ] Inventário mínimo de dados pessoais (cadastros, colaboradores, usuários) e onde são usados.
- [ ] Exportação/remoção: processos internos para atender solicitações (mesmo que manual inicialmente).
- [ ] Minimização: evitar armazenar dados desnecessários e evitar exposição em logs/respostas.

## 16) FinOps / Eficiência operacional

- [ ] Evitar consultas pesadas em loop e “dashboards com 20 RPCs”.
- [ ] Arquivamento/limpeza: estratégia para logs/eventos e dados antigos (quando volume crescer).
- [ ] Monitorar custos por feature (conciliação, importações, automações).

---

## 17) Rotina semanal (recomendado)

- [ ] Rodar `yarn test --run`
- [ ] Rodar `yarn test:e2e:gate:all` (ou gates por plano, quando aplicável)
- [ ] Rodar `yarn verify:migrations` (garante clean slate e evita drift)
- [ ] Revisar `docs/checklist-estado-da-arte-gaps.md` e registrar novos gaps com dono + prazo
