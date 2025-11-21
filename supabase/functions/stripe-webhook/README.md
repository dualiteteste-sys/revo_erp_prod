# Edge Function: stripe-webhook

Esta função processa webhooks do Stripe para sincronizar o status de assinaturas com o banco de dados do Supabase.

## Endpoint

`/functions/v1/stripe-webhook`

## Eventos Suportados

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

## Gerenciamento de Segredos

Esta função não armazena segredos diretamente no código. Todas as chaves e tokens são lidos a partir das variáveis de ambiente configuradas no seu projeto Supabase.

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
