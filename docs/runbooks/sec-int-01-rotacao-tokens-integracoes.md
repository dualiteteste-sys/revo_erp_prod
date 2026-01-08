# SEC-INT-01 — Rotação de tokens (Focus NF-e + Marketplaces)

Objetivo: reduzir incidentes por **token expirado**, **segredo vazado** ou **endpoint errado**, com um procedimento simples, repetível e auditável.

## 1) Quando rotacionar

Rotacione quando:
- alguém teve acesso indevido ao repositório/ambiente (suspeita de vazamento)
- o provedor avisou que o token vai expirar / foi revogado
- houve troca de ambiente (DEV ↔ PROD) e os endpoints/segredos ficaram desalinhados
- periodicamente (ex.: a cada 90 dias) como higiene operacional

## 2) Princípios (para não quebrar PROD)

- **1 mudança por vez** (token, endpoint ou secret).
- **sempre testar em DEV primeiro** (quando aplicável).
- **logar o evento** (issue/PR) com: data, quem fez, ambiente, o que foi rotacionado, como validou.
- **não apagar o antigo antes de validar o novo** (quando o provedor permitir overlap).

## 3) Marketplaces (Mercado Livre / Shopee)

### 3.1 Rotação (OAuth / tokens)

1) No app: `Configurações → E-commerce → Marketplaces`
2) Clique em **Desconectar** (se houver) e depois **Autorizar no canal**.
3) Volte para a tela e clique em **Testar conexão**.

### 3.2 Como validar

1) `Suporte → Diagnóstico`:
   - Mercado Livre e Shopee devem aparecer como **Ok: conectado**
   - Se aparecer “**Expira em breve**”, planeje reautorizar antes do prazo
2) `Configurações → E-commerce → Marketplaces`:
   - Token deve estar **OK** (não expirado)
   - `Último sync` deve atualizar após um import manual (se habilitado)

### 3.3 O que o sistema checa

O RPC `public.ecommerce_connection_diagnostics(provider)` retorna:
- `token_expired`: expirou
- `token_expires_soon`: expira em <= 7 dias
- `token_expires_in_days`: dias restantes (estimativa)

## 4) Focus NF-e (Webhook secret)

### 4.1 Onde ficam os segredos

- GitHub → `Settings → Secrets and variables → Actions`
  - `FOCUSNFE_WEBHOOK_SECRET_HML` (homologação)
  - `FOCUSNFE_WEBHOOK_SECRET_PROD` (produção)

### 4.2 Rotação segura (passo a passo)

1) Gere um novo segredo no painel da Focus (Webhooks → NF-e).
2) Atualize **primeiro em homologação** (se estiver usando).
3) Faça um `curl` no endpoint do webhook para confirmar `200`.
4) Só então atualize **produção**.

### 4.3 Como validar

- Verificar no `Dev → Saúde` se não existem webhooks de NF-e em falha.

## 5) Checklist rápido (2 minutos)

- [ ] Segredo atualizado no lugar certo (DEV ou PROD)
- [ ] Só existe 1 endpoint ativo no provedor (quando aplicável)
- [ ] `Suporte → Diagnóstico` sem avisos de token expirado
- [ ] Import/Emissão “de prova” concluído com sucesso
- [ ] PR/issue registrada com o que foi feito e como validou
