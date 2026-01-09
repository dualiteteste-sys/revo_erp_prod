# Checklist “Estado da Arte” — Sanitização de Gaps (REVO ERP)

Objetivo: ter uma lista que você consegue seguir periodicamente para reduzir bugs, drift e fricção de operação sem perder velocidade.

---

## 0) Pré-requisitos (1 vez por ambiente)

- `main` é a única fonte de deploy em PROD (sem hotfix manual sem virar migration).
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

---

## 5) Deploy e gates (sempre antes de merge/release)

- Local (quando possível):
  - `yarn test --run`
  - `yarn build`
- Gate completo (quando for release):
  - `yarn release:check`
  - (inclui `verify:migrations` e E2E gates)

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

