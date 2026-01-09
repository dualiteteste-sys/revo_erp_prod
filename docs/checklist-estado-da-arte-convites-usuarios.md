# Convites e novos usuários — checklist “Estado da Arte”

Objetivo: permitir que um **Owner/Admin** adicione pessoas à empresa com **zero fricção**, com UX clara, sem “estados zumbis” (usuário preso em PENDING para sempre) e com **enforcement real** (limite do plano + RLS).

---

## 1) Modelos e estados (fonte da verdade)

**Auth (Supabase Auth)**
- Usuário (email) existe em `auth.users`.
- O “link” do e-mail é um token de curto prazo (OTP/PKCE). Ele pode expirar e **pode ser invalidado** se você gerar outro link do mesmo tipo.

**App (multi-tenant)**
- Vínculo usuário↔empresa: `public.empresa_usuarios`
- Estados recomendados:
  - `PENDING`: convite enviado/aguardando aceite (reserva seat, se aplicável)
  - `ACTIVE`: aceito e operacional (consome seat)
  - `INACTIVE`: usuário desativado (não consome seat)
- Empresa ativa do usuário: `public.user_active_empresa` (1 por usuário)

**Regra de ouro (para não quebrar)**
- **Nunca** marque `empresa_usuarios` como `ACTIVE` antes do usuário concluir o fluxo de “Definir senha”.
- Sempre garanta que após aceitar convite você define/atualiza `user_active_empresa`.

---

## 2) Checklist técnico (backend)

### 2.1 Pré-condições antes de enviar convite
- [ ] Usuário chamador autenticado.
- [ ] Existe **empresa ativa** (ou o UI força seleção) — erro UX se não existir.
- [ ] Chamador tem permissão: `usuarios:manage` (3-layer enforcement).
- [ ] Checar seats: `ACTIVE + PENDING` não podem ultrapassar `empresa_entitlements.max_users`.
- [ ] Se já existe vínculo `ACTIVE`, convite vira **noop** (não reenvia e-mail).

### 2.2 Envio do convite (e-mail)
- [ ] Para **novo usuário**: `admin.inviteUserByEmail(email, { redirectTo })`.
- [ ] Para **usuário já existente**: `signInWithOtp(email, { emailRedirectTo })` (reenvio).
- [ ] Evitar “invalidar link”: não gerar `admin.generateLink()` logo após enviar e-mail (pode causar `otp_expired` no link recém enviado).
- [ ] `redirectTo` deve ser sempre `/auth/update-password?empresa_id=<id>` (ou equivalente) e estar liberado em Auth → Redirect URLs.

### 2.3 Persistência do convite (multi-tenant)
- [ ] Após obter `user_id` (novo/existente), criar/atualizar `empresa_usuarios`:
  - `status = 'PENDING'`
  - `role_id` conforme slug
  - `onConflict (empresa_id,user_id)` idempotente
- [ ] Registrar trilha/auditoria: quem convidou, quando, qual role (ideal: audit table).

### 2.4 Aceite do convite (pós-link)
- [ ] Página `/auth/update-password` deve:
  - estabelecer sessão via `access_token/refresh_token` OU `code` (PKCE) OU `token_hash` (`verifyOtp`)
  - permitir definir senha via `auth.updateUser({ password })`
  - chamar `rpc accept_invite_for_current_user(p_empresa_id)`
  - chamar `secure_bootstrap_empresa_for_current_user` (garantir empresa ativa e consistência)
  - redirecionar para `/app` com feedback “OK”
- [ ] RPC `accept_invite_for_current_user` deve ser idempotente:
  - `PENDING -> ACTIVE`
  - se já `ACTIVE`, não falha
  - sempre atualiza `user_active_empresa`
  - nunca “explode” por ambiguidade de variáveis/colunas (usar `#variable_conflict use_column` quando necessário)

### 2.5 Reenvio e recuperação (estado da arte)
- [ ] Botão “Reenviar convite”:
  - reenvia e-mail com link válido (sem invalidar links recém enviados)
  - aplica rate-limit/backoff no UI e mensagem clara (“aguarde 1–2 min”)
- [ ] Fallback “Copiar link” (opcional):
  - só quando envio de e-mail falhar
  - link deve apontar para o mesmo `redirectTo`
- [ ] Ação “Cancelar convite”:
  - remove vínculo `PENDING` (RPC `delete_pending_invitation`)
  - libera seat imediatamente

---

## 3) Checklist UX (menos suporte)

### 3.1 Tela de usuários (Owner/Admin)
- [ ] Lista com status claro: `Ativo`, `Convite pendente`, `Inativo`.
- [ ] Ações por status:
  - PENDING: `Reenviar`, `Copiar link`, `Cancelar`
  - ACTIVE: `Alterar papel`, `Desativar`
  - INACTIVE: `Reativar`
- [ ] Barra “Usuários do plano”: `usados / limite`, incluindo pendentes (se reservar seat).
- [ ] Mensagens humanas:
  - “Convite enviado. Peça para abrir o e-mail mais recente.”
  - “Link expirou. Clique em ‘Reenviar convite’.”
  - “Limite do plano atingido. Faça upgrade ou remova convites pendentes.”

### 3.2 Tela do convidado (pós-link)
- [ ] “Definir senha” com validação forte (mínimo 8, confirmação).
- [ ] Tratamento de erro “link expirou” com CTA **Reenviar convite** (ideal: abre um formulário para digitar e-mail e acionar reenvio).
- [ ] Não pedir “logout/login de novo” (evitar fricção).
- [ ] Após salvar senha: entrar direto no app e selecionar empresa automaticamente.

---

## 4) Checklist de segurança e multi-tenant
- [ ] RLS em `empresa_usuarios` impede ver/alterar vínculos de outra empresa.
- [ ] Edge functions validam:
  - token do chamador
  - empresa alvo acessível ao chamador (via `current_empresa_id` ou id explícito)
  - permissão (`usuarios:manage`)
- [ ] Assentos/limites validados no banco (trigger) para impedir bypass via console.
- [ ] Logs sem PII (email mascarado quando possível; `request-id`).

---

## 5) Testes mínimos (P0)

### Fluxo 1 — Novo usuário
- [ ] Admin convida `novo@...`
- [ ] Recebe e-mail, abre link, define senha
- [ ] Entra no app já na empresa correta
- [ ] Aparece como `ACTIVE` e contagem de seats atualiza

### Fluxo 2 — Reenvio e link expirado
- [ ] Convidado abre link antigo → mensagem “expirou”
- [ ] Admin clica “Reenviar”
- [ ] Convidado abre link novo, define senha → ok

### Fluxo 3 — Limite do plano
- [ ] Ajustar `max_users = 2`
- [ ] Criar 2 ACTIVE e tentar convidar 3º → bloqueia com mensagem clara

---

## 6) Sugestão “mais simples” (alternativa, se quiser)

Se quiser reduzir complexidade de OTP/link:
- Owner/Admin cria o usuário e define **senha temporária** (ou gera link de “reset password”).
- Usuário entra e é forçado a trocar a senha no primeiro login.

Trade-off: menos dependência de e-mail/OTP, porém requer tratar “senha temporária” com cuidado (segurança/UX).

