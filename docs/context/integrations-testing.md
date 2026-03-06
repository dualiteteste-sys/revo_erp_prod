# Testes de Integrações Externas — Revo ERP

Como testar cada integração externa em dev/local sem afetar prod e sem depender de ambientes reais.
Leia antes de desenvolver ou depurar qualquer integração.

---

## 1) Princípio geral

**Regra:** toda integração externa deve ter um modo de teste que:
1. Não afete dados reais (clientes, pedidos, NF-e em produção)
2. Seja reproduzível (mesmos dados → mesmo resultado)
3. Seja testável no CI sem credenciais de produção

**Ambiente padrão de teste:** Supabase DEV (REVO-DEV) + credenciais de sandbox de cada provedor.

---

## 2) Stripe (billing e pagamentos)

### Ambiente de teste
- **Modo:** Stripe Test Mode (chave `sk_test_*`)
- **Secret:** `STRIPE_SECRET_KEY_DEV` no GitHub + `.env.local` para desenvolvimento local
- **Dashboard:** https://dashboard.stripe.com/test

### Como testar

```bash
# Criar cliente de teste
curl https://api.stripe.com/v1/customers \
  -u sk_test_SUA_CHAVE: \
  -d email="teste@exemplo.com"

# Cartões de teste (não geram cobrança real)
# Sucesso:          4242 4242 4242 4242
# Recusado:         4000 0000 0000 0002
# 3D Secure:        4000 0025 0000 3155
# Insuficiente:     4000 0000 0000 9995
```

### Webhooks em dev local

```bash
# Instalar Stripe CLI
brew install stripe/stripe-cli/stripe

# Fazer forward dos webhooks para o servidor local
stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook

# Acionar eventos específicos
stripe trigger payment_intent.succeeded
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.deleted
```

### Idempotência dos webhooks Stripe

Todos os webhooks Stripe são processados pela Edge Function `stripe-webhook`.
Idempotência garantida via `stripe_event_id` (ON CONFLICT DO NOTHING).
Testar reprocessamento: enviar o mesmo evento 2x e verificar que não duplica efeitos.

---

## 3) Focus NF-e (emissão de NF-e)

### Ambiente de teste
- **Modo:** Ambiente de Homologação da SEFAZ (não gera documento fiscal real)
- **Config:** `ambiente = 'homologacao'` no cadastro fiscal da empresa
- **Secret:** `FOCUS_NFE_TOKEN_DEV` (token de homologação do Focus NF-e)

### Como testar

1. Configurar empresa no Revo com `ambiente_nfe = 'homologacao'`
2. Emitir NF-e normalmente — vai para SEFAZ Homologação, não produção
3. DANFE gerado tem marca d'água "SEM VALOR FISCAL"
4. Erros de validação são idênticos ao ambiente de produção

### Webhooks de NF-e em dev local

```bash
# Expor o servidor local para o Focus NF-e poder chamar os webhooks
ngrok http 54321

# Configurar no Focus NF-e dashboard a URL de webhook:
# https://<SEU_NGROK>.ngrok.io/functions/v1/fiscal-nfe-webhook
```

### Rejeições para testar

| Código | Descrição | Como provocar |
|---|---|---|
| 539 | CNPJ emitente inválido | Usar CNPJ 00.000.000/0001-00 |
| 562 | Produto sem NCM | Omitir campo NCM no item |
| 999 | Serviço indisponível | Usar modo offline da SEFAZ (consultar calendário) |

### Cancelamento e CCe

- Cancelamento: disponível em até 24h após autorização em homologação
- CCe (Carta de Correção): testar com correção no campo `xCorrecao`

---

## 4) WooCommerce

### Ambiente de teste
- **Modo:** WooCommerce test store (loja separada de staging/dev)
- **Secret:** `WOO_CONSUMER_KEY_DEV` + `WOO_CONSUMER_SECRET_DEV`
- **URL:** configurado por empresa no painel de integrações do Revo

### Como testar

```bash
# Listar pedidos da loja de teste
curl "https://minhaloja-dev.com/wp-json/wc/v3/orders?per_page=5" \
  -u "ck_CONSUMER_KEY:cs_CONSUMER_SECRET"

# Criar pedido de teste
curl -X POST "https://minhaloja-dev.com/wp-json/wc/v3/orders" \
  -H "Content-Type: application/json" \
  -u "ck_KEY:cs_SECRET" \
  -d '{"status": "processing", "line_items": [...]}'
```

### Simulação de webhooks WooCommerce

O WooCommerce envia webhooks para a Edge Function `woocommerce-webhook`.
Para teste local:

```bash
# Com ngrok expondo o servidor local
curl -X POST "https://<SEU_NGROK>.ngrok.io/functions/v1/woocommerce-webhook" \
  -H "Content-Type: application/json" \
  -H "X-WC-Webhook-Topic: order.created" \
  -H "X-WC-Webhook-Signature: <HMAC-SHA256>" \
  -d '{"id": 123, "status": "processing", ...}'
```

### Docs específicos de WooCommerce

Ver: `docs/integrations/woocommerce*.md` para runbooks, error codes e retry policy.

---

## 5) Mercado Livre (ML) e Shopee

### Ambiente de teste
- **Mercado Livre:** Developer Sandbox — https://developers.mercadolivre.com.br/
- **Shopee:** Partner Center Sandbox — https://open.shopee.com/

### Credenciais de sandbox

```
ML:
  APP_ID_DEV: configurado como secret no GitHub
  SECRET_KEY_DEV: configurado como secret no GitHub
  Redirect URI: https://<DEV_URL>/auth/ml/callback

Shopee:
  PARTNER_ID_DEV: configurado como secret no GitHub
  PARTNER_KEY_DEV: configurado como secret no GitHub
```

### Fluxo OAuth em sandbox

```bash
# 1) Gerar URL de autorização (pelo painel de integrações do Revo)
# 2) Autenticar com conta de teste do provedor
# 3) Copiar código de autorização da URL de redirect
# 4) Trocar por access_token via RPC do Revo

callRpc('marketplace_oauth_exchange', {
  provider: 'mercadolivre',
  code: 'CODIGO_DO_REDIRECT'
})
```

### Limitações do sandbox

| Provedor | Limitação | Workaround |
|---|---|---|
| Mercado Livre | Produtos criados em sandbox não são reais | Usar produtos de teste pré-criados |
| Shopee | Webhooks não chegam automaticamente | Usar Shopee Partner Center para reenviar |
| Shopee | Taxa de criação limitada em sandbox | Não fazer mais de 10 requisições/min |

---

## 6) Checklist antes de promover integração para produção

Antes de mergear código de integração em `main`:

- [ ] Testado com credenciais de sandbox (não prod)
- [ ] Webhook de entrada: testado com payload real + signature válida
- [ ] Idempotência verificada: enviar o mesmo evento 2x → efeito único
- [ ] DLQ testada: simular falha → item aparece em Dev → Saúde → reprocesso funciona
- [ ] Rate limit respeitado: não há loop infinito ou ban risk
- [ ] Logs estruturados com `empresa_id` + `provider` + `entity_id` + `run_id`
- [ ] Revogação/disconnect: testar `disconnect` limpa todos os tokens

---

## 7) ngrok para dev local

Para integrações que enviam webhooks para o servidor local:

```bash
# Instalar
brew install ngrok

# Autenticar (1x)
ngrok config add-authtoken SEU_TOKEN

# Expor Edge Functions locais
ngrok http 54321

# A URL gerada (ex: https://abc123.ngrok.io) pode ser usada como webhook URL
# no painel do provedor (Focus NF-e, WooCommerce, etc.)
```

**Atenção:** URLs ngrok gratuitas mudam a cada restart. Para ambiente dev persistente,
configurar `VITE_SITE_URL_DEV` com URL do Netlify DEV (onde as Edge Functions são expostas pelo Supabase DEV).

---

## Última atualização — 2026-03-06

- Documento criado consolidando estratégia de teste de integrações externas.
- Baseado em integrações existentes: Stripe, Focus NF-e, WooCommerce, Mercado Livre, Shopee.
- Estado atual: estratégia documentada, ~80% testável em sandbox sem afetar prod.
