# SEC-INT-02 — Revogação (disconnect) e limpeza de secrets

Objetivo: quando o usuário clicar em **Desconectar**, o sistema deve realmente parar a integração e remover qualquer segredo/token salvo, evitando que jobs continuem processando com estado inválido.

## 1) Marketplaces (Mercado Livre / Shopee)

### Como desconectar (UI)

1) Acesse `Configurações → E-commerce → Marketplaces`
2) Abra o provedor desejado (Mercado Livre ou Shopee)
3) Clique em **Desconectar**

### O que acontece no backend

- A conexão é marcada como `disconnected`
- Tokens são removidos de `public.ecommerce_connection_secrets`
- Jobs pendentes/processando/erro daquela conexão são removidos (para não processar sem token)
- Um log operacional é gravado em `public.ecommerce_logs` (sem tokens)

### Como validar

1) Volte em `Configurações → E-commerce → Marketplaces` e clique em **Testar conexão**
   - Deve indicar **sem token** (ou conexão incompleta)
2) Vá em `Suporte → Diagnóstico`
   - A integração deve aparecer como **missing/warn**
3) (Opcional) `Dev → Saúde`
   - A fila pendente não deve continuar crescendo para aquele provider

## 2) Focus NF-e

Hoje os segredos (API key + HMAC) ficam em secrets do ambiente (GitHub/Supabase), não em tabelas.

- Para “revogar”, a ação correta é **rotacionar** o segredo no provedor e atualizar o secret do ambiente.
- Valide com uma emissão/webhook de teste.

Ver: `docs/runbooks/sec-int-01-rotacao-tokens-integracoes.md`
