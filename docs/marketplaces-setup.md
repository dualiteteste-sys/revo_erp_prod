# Marketplaces (Mercado Livre + Shopee) — setup de OAuth

Este documento explica como configurar os segredos e o redirect de OAuth para conectar os canais no Revo.

## 1) Onde fica a tela no Revo

`Configurações → E-Commerce → Integrações (Marketplaces)`

## 2) Edge Function usada

Função: `supabase/functions/marketplaces-oauth`

Endpoints:
- **Start (app)**: `POST /functions/v1/marketplaces-oauth?provider=<meli|shopee>`
- **Callback (canal)**: `GET  /functions/v1/marketplaces-oauth?provider=<meli|shopee>&code=...&state=...`

## 3) Secrets obrigatórios no Supabase (PROD e DEV)

Configure via CLI (ou dashboard de Functions/Secrets):

### Mercado Livre
- `MELI_CLIENT_ID`
- `MELI_CLIENT_SECRET`

### Geral (recomendado)
- `SITE_URL` (ex.: `https://app.seudominio.com`)

Observações:
- `SITE_URL` é usado para validar redirects e montar fallback de retorno.
- Tokens de OAuth são salvos no banco em `public.ecommerce_connection_secrets` e só o `service_role` acessa.

## 4) Redirect URI no Mercado Livre

No app do Mercado Livre, configure o Redirect URI exatamente como:

`https://<SEU-PROJETO>.supabase.co/functions/v1/marketplaces-oauth?provider=meli`

Exemplo:
`https://ovzdjeczmtqnuytqdtsc.supabase.co/functions/v1/marketplaces-oauth?provider=meli`

## 5) Como testar

1) Abra a tela de Integrações
2) Clique em **Conectar** no Mercado Livre
3) No assistente, clique **Autorizar no canal**
4) Após voltar, clique **Testar conexão**

Se estiver OK, o diagnóstico mostrará:
- status `connected`
- token `OK` (não expirado)

## 6) Shopee (status atual)

O fluxo de Shopee (`SHO-01`) está com **casca pronta** (state + endpoint), mas o **token exchange** ainda está como `NOT_IMPLEMENTED_YET` até definirmos credenciais/fluxo do parceiro.

