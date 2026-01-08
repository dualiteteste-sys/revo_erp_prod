# Runbook: e-mails de Auth (confirmação/convite) não chegam

Este guia é para diagnosticar e corrigir problemas de envio de e-mails do **Supabase Auth**:
- confirmação de conta (signup)
- convite de usuário (invite)
- recuperação de senha (reset)

## 1) Checklist rápido (2 minutos)

1) **Teste com um e-mail “neutro”** (Gmail/Outlook).
   - Se chega lá, mas não chega em e-mail corporativo: é **deliverability** (SPF/DKIM/DMARC/anti-spam).
2) **Confirme se o Supabase realmente “disparou” o e-mail**.
   - No SQL Editor (role `postgres`), rode:
     ```sql
     select email, confirmation_sent_at, email_confirmed_at, created_at
     from auth.users
     where email = 'SEU_EMAIL_AQUI'
     order by created_at desc;
     ```
   - Se `confirmation_sent_at` estiver preenchido, o Supabase tentou enviar.
3) **Confira Auth Logs no Supabase**:
   - Supabase Dashboard → Authentication → Logs
   - Filtre por: `invite`, `signup`, `email`, `smtp`, `rate limit`, `failed`.

## 2) Sintomas e causas mais comuns

### A) “Conta criada, mas e-mail não chega”
**Causas prováveis**
- E-mail caiu em spam/promoções/atualizações.
- Domínio corporativo bloqueia remetente genérico.
- SMTP customizado no Supabase está com credenciais inválidas ou bloqueado.
- Limite de envio / rate limit do Auth (principalmente se SMTP está ativo).

### B) “Convite enviado, mas usuário não recebe”
**Causas prováveis**
- Mesmo cenário do item A (deliverability/SMTP/rate limit).
- Redirect URL do convite não permitido (isso costuma dar erro no envio).

### C) “Usuário tenta criar conta e nunca recebe e-mail”
**Causa adicional (pegadinha comum)**
- O e-mail **já existia**: o Supabase pode retornar “sucesso” sem enviar e-mail (anti-enumeração).
  - Na UI já tratamos e sugerimos login/recuperação.

## 3) Correção definitiva (Estado da Arte): SMTP próprio + DNS

Para produção, o padrão “estado da arte” é **usar SMTP dedicado** (ex.: Amazon SES, Postmark, Mailgun).

### 3.1 Configurar SMTP no Supabase
Supabase Dashboard → Authentication → Settings → SMTP (ou Email)

Preencha (exemplo genérico):
- Host/Port/User/Pass do provedor
- `Sender name` (ex.: `REVO`)
- `Admin email / From` (ex.: `no-reply@erprevo.com`)

### 3.2 Ajustar DNS do domínio (evita spam)
No provedor de DNS do seu domínio:
- **SPF**: autoriza o provedor a enviar e-mail pelo seu domínio
- **DKIM**: assina as mensagens (principal para não cair em spam)
- **DMARC**: política e relatórios

Sem SPF/DKIM/DMARC corretos, e-mails de confirmação/convite têm alta chance de cair em spam ou serem rejeitados.

## 4) Testes recomendados após a correção

1) Signup com Gmail (novo e-mail):
   - deve receber confirmação
   - ao clicar, deve cair em `https://erprevo.com/auth/confirmed`
2) Invite de usuário (Gmail novo):
   - deve receber convite
   - ao clicar, deve cair em `https://erprevo.com/auth/update-password?...`
3) Reset de senha:
   - deve receber reset
   - ao clicar, deve cair em `https://erprevo.com/auth/update-password`

## 5) Plano B (sem depender de e-mail) — apenas para convites

Se o provedor estiver bloqueando e-mails **temporariamente**, o admin consegue copiar um link de convite pela UI (fallback) e enviar via WhatsApp/Slack.

Observação: não existe fallback seguro equivalente para signup sem e-mail (isso quebraria a prova de posse do e-mail).

