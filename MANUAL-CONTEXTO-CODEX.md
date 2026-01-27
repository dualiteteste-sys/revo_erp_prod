# Manual de Contexto (Codex) — REVO ERP

Objetivo: quando uma nova janela de contexto for aberta, este documento deve ser lido primeiro para manter qualidade, consistência e velocidade.

## 1) Como iniciamos uma nova janela de contexto

**Prompt padrão (copiar e colar):**

1) Leia `CHECKLIST-ESTADO-DA-ARTE.md` e `CHECKLIST-ESTADO-DA-ARTE-9-10.md`.
2) Resuma em 6 bullets: (a) como fazemos deploy, (b) regras de migrations, (c) padrão de testes, (d) padrão de logs/console, (e) padrão de UX “estado da arte”, (f) o que você vai evitar.
3) Antes de codar, liste os arquivos que você pretende tocar e os testes que vai rodar.

## 2) O que está sendo construído (o que eu entendo do desenvolvimento)

- ERP SaaS multi-tenant (empresa/usuário/roles), com operação real (Vendas, Financeiro, Suprimentos, Serviços e Indústria).
- Back-end principal é Supabase (Postgres + RPC + RLS + Edge Functions) e o front é React/Vite/TS.
- “Estado da Arte” aqui significa: UX simples/rápida, fluxo resiliente com plano B, observabilidade forte, testes automatizados e zero drift entre ambientes.

## 3) Regras de ouro (não negociar)

### 3.1 Ambientes e deploy

- `main` é a fonte do deploy em PROD.
- Qualquer ajuste que envolva banco/Supabase deve virar migration em `supabase/migrations/*` (nada de ajuste manual “só em prod”).
- O ciclo padrão é: **commit → push em `dev` → Actions verdes → merge para `main` → Actions verdes**.

### 3.2 Console limpo (E2E)

- E2E falha se existir `console.error` ou `pageerror` (ver `e2e/fixtures.ts`).
- Em UI, erros devem virar **toast** + (quando aplicável) log via `logger`/Sentry, evitando `console.error`.

### 3.3 Supabase = migration (sempre)

- Qualquer alteração que “encoste” no Supabase (schema, RPC, RLS/policies, triggers, tipos/enums, grants, dados-base do produto) **vira migration** em `supabase/migrations/*`, mesmo que seja mínima.
- Nada de ajuste manual via dashboard/SQL editor sem converter em migration no mesmo PR (evita drift).

### 3.4 Guias rápidos e Roadmap sempre atualizados (RG-02)

- Ajuda contextual (Guia rápido por página): `src/components/support/helpCatalog.ts`
- Roadmap/Onboarding por módulo: `src/components/roadmap/roadmaps.ts`
- Regra: se um PR muda fluxo/UX ou onboarding, ele deve atualizar guia/roadmap e ter E2E/Smoke cobrindo o fluxo.

### 3.5 GitHub Actions é o “juiz final”

- “Done” só existe quando o CI passou (sem exceções).
- O CI é responsável por:
  - validar testes (unit + E2E)
  - validar migrations em banco limpo (clean slate)
  - impedir drift entre VERIFY e PROD (comparação strict de schema)
  - impedir chamadas para RPC/Edge Functions inexistentes (coverage)

## 4) Padrões de qualidade (“Estado da Arte”)

### 4.1 UX e fluxos resilientes

- Fluxos críticos precisam de plano B (ex.: convite/cadastro manual).
- Sempre que possível: preview, validação clara, mensagens úteis e ação de recuperação (retry).
- Evitar estados “quebra fluxo” (ex.: erro que obriga voltar e editar depois).

### 4.1.1 UI “bonita por padrão” (efeitos sutis, mas premium)

Princípio: a experiência do usuário é definida pela soma **UI + performance + confiabilidade**. A UI deve ser consistente e visualmente premium, sem exagero e sem comprometer velocidade.

- **Micro-interações** (sutil, rápido, não cansativo)
  - Hover/active states consistentes (botões, cards, rows de tabela).
  - Transições curtas (150–250ms) e com `motion-reduce` respeitado.
  - Feedback instantâneo: skeleton/loader discreto, toasts claros e não intrusivos.
- **Profundidade e hierarquia**
  - Uso moderado de sombras, blur e gradientes suaves (ex.: header/cards) para guiar o olhar.
  - Espaçamento generoso, tipografia legível e contraste correto.
  - Estados vazios (empty states) elegantes e úteis (CTA claro).
- **Consistência visual**
  - Tokens de cor/spacing centralizados (`src/styles/tokens.css`) e uso consistente.
  - Componentes comuns (Modal/Drawer/Table/Input) devem ser a fonte do estilo (evitar “um módulo por estética”).
- **Acessibilidade e qualidade**
  - Suporte a teclado/focus states (sem “sumir” com outline).
  - Evitar animações invasivas; sempre garantir leitura e estabilidade do layout.
- **Regra de ouro**
  - Se um efeito visual não melhora clareza/feedback, ele é ruído (não entra).

### 4.1.2 Como não sofrer em detalhes de UI (processo)

- **Definição visual antes do código:** sempre registrar 1 print/rascunho + critérios objetivos (5–10 bullets) do que será entregue. Ex.: “Cabeçalho: mês/ano centralizado; setas; clique em mês/ano abre overlay; overlay cobre todo o calendário; sem scrollbars; animação slide direita→esquerda + scale-up; saída inversa”.
- **Componente único como “source of truth”:** UI crítica deve ser centralizada em componentes padrão (ex.: `DatePicker`/`Calendar`) — evitar implementações locais divergentes.
- **Playground DEV para iterar isolado:** usar a rota `/app/desenvolvedor/ui-playground` para validar rapidamente estilos, responsividade e micro-interações sem depender de telas complexas.
- **Efeitos sutis por padrão:** transições 150–220ms, `ease-out`, hover azul claro, foco com ring; evitar layout quebrando (overflow), sobreposições incoerentes e scrollbars inesperadas.
- **Critério de pronto:** console limpo + `yarn test --run`; quando for componente global (muitos módulos), rodar também `yarn test:e2e:gate:all` antes de push para PROD.

### 4.1.3 Padrão obrigatório para campos de data

- **Calendário padrão do sistema:** cabeçalho com `<` `Mês Ano` `>`; clique em `Mês Ano` abre overlay de anos/meses (anos em cima, meses em baixo), com animação e fechamento inversos; sem barras de rolagem.
- **Expansão do popover:** o popover do DatePicker só aumenta quando a view de anos/meses está aberta, e volta ao tamanho normal ao fechar.
- **Uso obrigatório em todo o sistema:** qualquer campo de data deve usar o padrão do sistema (não usar `input type="date"` nativo nem “um datepicker por módulo”).

### 4.1.6 “Qualidade de Frontend” como regra (não-negociável)

Objetivo: manter consistência visual e velocidade de entrega sem “matar” a qualidade do front.

- **Source of truth**: antes de criar “mais um modal/form”, procure e reutilize padrões existentes (ex.: `Modal`, `Section`, `Input`, `Select`, `Toggle/Switch`, `GlassCard`, `ResizableSortableTh`).
- **Padrão preferido**: quando o formulário tem poucos campos e o usuário pode cadastrar muitos itens, preferir **cadastro em lista/inline** + **Adicionar em massa** em vez de modal de 3 campos.
- **Espaçamento e bordas**: priorizar “respiro” (padding generoso) e cantos consistentes; evitar layouts “apertados” ou sem hierarquia visual.
- **Consistência**: não introduzir novo estilo local sem necessidade; se a UI exige um ajuste global, faça-o no componente base (design system) e reaplique em todos os módulos.
- **Critério de pronto (front)**:
  - “Console limpo” e “Network limpo” (sem 4xx/5xx) no fluxo principal.
  - UX sem fricção: foco/teclado funcionando, salvar sem recarregar, feedback claro (loading/toast).
  - Tests: pelo menos 1 smoke E2E para a rota nova + `yarn test --run`.
- **Regra anti-regressão**: qualquer novo módulo deve parecer “nativo” do REVO (mesma densidade visual, mesmos componentes, mesmos padrões de tabela/form).

### 4.1.4 “Estado da Arte” sempre primeiro (regra de comunicação)

Quando o usuário trouxer uma demanda, **sempre** responder primeiro com a proposta “Estado da Arte” (padrão de mercado + melhor UX/arquitetura), e só depois apresentar:

- **MVP mínimo aceitável** (se fizer sentido), com trade-offs claros.
- **Etapas de entrega** (quando grande), com critérios objetivos de validação.
- **Impacto em banco/Supabase** (migrations necessárias) e **plano de testes** (unit + E2E, console/network limpos).

### 4.1.5 Onde colocar: Cadastros vs Configurações (regra de IA)

Regra: tudo que é **dado mestre** (master data) que será **selecionado em múltiplos fluxos** deve ficar em **Cadastros**.

- **Cadastros**: listas e entidades reutilizáveis no operacional (ex.: centros de custo, unidades de medida, meios/formas de pagamento/recebimento, serviços, produtos, clientes/fornecedores).
- **Configurações**: parâmetros do sistema/empresa, permissões, integrações, preferências e políticas (ex.: usuários/roles, integração Stripe/ZapSign, regras fiscais, parâmetros globais).
- Se houver dúvida: preferir **Cadastros**; só ir para Configurações quando o usuário “não escolhe” aquilo no dia a dia, apenas define uma vez.

### 4.2 React Hooks (evitar bugs “fantasmas”)

- Tratar warnings de `react-hooks/exhaustive-deps` como prioridade em fluxos críticos.
- Se precisar suprimir dependência: justificar com callback memoizado/ref estável (não “silenciar” por silenciar).

### 4.3 Banco (RPC/migrations)

- RPC precisa ser compatível com PostgREST (evitar overload ambíguo, tipos corretos, retorno consistente).
- Após migrations, schema cache do PostgREST deve ser recarregado (automatizado nos workflows/migrations do repo).

### 4.4 Padrões que devemos reforçar (pontos fracos identificados)

- **Lint como gate (não só aviso)**
  - Política: PR não deve aumentar warnings de lint (objetivo: reduzir continuamente).
  - Direção: adicionar um gate no CI para falhar se `yarn lint` exceder um teto (começar alto e baixar gradualmente).
- **TypeScript forte nos fluxos críticos**
  - Política: reduzir `any`/contratos frouxos em `src/services`, `src/lib`, `src/hooks`.
  - Direção: reativar `@typescript-eslint/no-explicit-any` por diretório crítico e aceitar exceções apenas quando houver justificativa técnica (ex.: tipos gerados incompletos).
- **Proibir `console.*` no código de app**
  - Política: nenhum `console.log/warn/error` em `src/**` (exceto `src/test/**` e mocks).
  - Direção: usar `logger` (com sanitização) e feedback via toast; E2E exige console limpo.
- **Proibir `select('*')` em services**
  - Política: serviços devem declarar colunas (ou preferir RPCs com contrato), para reduzir payload e risco de regressão por “coluna nova”.
  - Direção: quando usar `.from().select()`, listar colunas explicitamente e paginar/filtrar sempre.
- **Sem fallback hardcoded de Supabase em PROD**
  - Política: build em produção deve falhar se `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` não existirem.
  - Direção: remover fallbacks hardcoded e documentar `.env.example` mínimo.

## 5) GitHub Actions (enforcement detalhado)

O projeto usa Actions como enforcement **de qualidade** e **anti-drift**. Não é “só rodar testes”.

### 5.1 Workflows críticos

- `release-gate-dev.yml` (branch `dev`)
  - build + bundle budget (`yarn verify:bundle`)
  - unit tests (`yarn test --run`)
  - E2E gate (`yarn test:e2e:gate:all`)
  - migrations + RG-03 (`yarn verify:migrations:rg03`)
- `supabase-migrations-main.yml` (branch `main`) — “CI/CD Pipeline”
  - aplica migrations em banco limpo (VERIFY)
  - roda RG-03 (`scripts/rg03_db_asserts.sql`)
  - valida coverage: app ↔ RPC (`scripts/check_rpc_coverage.py`) e app ↔ Edge Functions (`scripts/check_edge_functions_coverage.py`)
  - roda release gate (unit + E2E) (`yarn release:check:ci`)
  - deploy PROD:
    - aplica migrations em PROD (`supabase db push --include-all`)
    - recarrega schema cache do PostgREST (`notify pgrst, 'reload schema'`)
    - compara schema esperado (VERIFY) vs PROD (strict)
    - deploy de Edge Functions (se secrets existirem)
- `verify-prod-schema-strict.yml` (scheduled)
  - auditoria diária: schema esperado (VERIFY) vs PROD (strict), falha em drift.

### 5.2 O que fazer quando falhar (padrão de investigação)

- Falhou “RPC coverage”:
  - o app está chamando `callRpc('fn')`/`supabase.rpc('fn')` e a função não existe em `supabase/migrations/*`.
  - corrigir criando migration com `create or replace function ...` e grants/`security definer` quando aplicável.
- Falhou “Edge Function coverage”:
  - o app invoca `.functions.invoke('x')` e não existe pasta `supabase/functions/x`.
  - corrigir criando a function (ou removendo chamada).
- Falhou “Verify Migrations / RG-03”:
  - drift ou regressão de grants/overload/tabelas/colunas; corrigir via migration (nunca manual).
- Falhou “E2E gate”:
  - olhar primeiro se é **console limpo** (fixtures falham em `console.error/pageerror`).
  - depois, é fluxo/seletores/rota: atualizar teste e/ou corrigir UI (sem `console.error`).
- Falhou “bundle budget”:
  - corrigir split/lazy import e remover imports estáticos pesados.

### 5.3 Outros workflows importantes (e cuidados)

- Deploy de Edge Functions:
  - DEV: `.github/workflows/supabase-functions-dev.yml`
  - PROD: `.github/workflows/supabase-functions-main.yml`
- Migrations dedicadas:
  - DEV: `.github/workflows/supabase-migrations-dev.yml` e `.github/workflows/apply-migrations-dev.yml`
  - PROD: `.github/workflows/supabase-migrations-main.yml` (inclui deploy)
- Segurança/operacional:
  - Backups: `.github/workflows/db-backup.yml`
  - Retenção LGPD: `.github/workflows/lgpd-retention-prod.yml`
  - Alerts: `.github/workflows/ops-health-alert-prod.yml`
- Workflows destrutivos (NUNCA rodar sem comando explícito do dono do projeto):
  - `.github/workflows/wipe-prod-data.yml`
  - `.github/workflows/wipe-prod-auth-users.yml`
  - `.github/workflows/reset-prod.yml`

## 6) Como validar antes de subir

### 6.1 Local (quando possível)

- `yarn test --run`
- `yarn test:e2e e2e/<arquivo>.spec.ts` (ou gates, se for release)

### 6.2 Gates (release)

- `yarn release:check` (unit + e2e gate + verify migrations)

## 7) Como o enforcement funciona (3 camadas)

### 7.1 Banco (RLS + RBAC + idempotência)

- Multi-tenant no banco é baseado em `public.current_empresa_id()` e policies por `empresa_id`.
- Para tabelas acessadas direto pelo app via PostgREST, há RLS “FORCE” + RBAC em policies (ex.: `supabase/migrations/20270102190000_sec_mt_rbac_3layer_enforcement.sql`).
- Operações críticas usam locks e idempotência (ex.: conciliação, vendas/OS, etc.) para prevenir duplicidade.

### 7.2 App (guards + contratos + UX resiliente)

- Permissões são checadas no front (`RequirePermission`, `useHasPermission`) mas o enforcement real é no banco (RLS/RPC).
- RPCs devem preferir `callRpc()` para ter retry, métricas e erros padronizados (`src/lib/api.ts`).
- UI não deve depender de “console”; usar toast + logger.

### 7.3 CI/CD (gates + anti-drift)

- Dev: gates completos em `dev`.
- Prod: clean-slate verify + strict schema compare antes/depois do deploy.

## 8) Política de push/merge

- A menos que o usuário peça explicitamente, **não fazer push/merge**.
- Quando pedir, acompanhar Actions e só parar quando estiver tudo verde (ou corrigir até ficar).

## 9) Checklist rápido por PR (resumo)

- [ ] Mudou UI/fluxo? Atualizou `helpCatalog.ts` (Guia rápido).
- [ ] Mudou onboarding/pré-requisito? Atualizou `roadmaps.ts`.
- [ ] Rodou/ajustou E2E para manter console limpo.
- [ ] Se envolveu Supabase: migration criada e verificada.
