# Documentação do Fluxo de Faturamento (Billing)

Este documento descreve o fluxo de ponta a ponta para assinaturas de planos no REVO ERP, utilizando Stripe e Supabase.

## Visão Geral do Fluxo

O processo de assinatura é projetado para ser seguro e robusto, centralizando a lógica de negócio em Edge Functions e no banco de dados.

1.  **Frontend (Página de Planos)**: O usuário clica em "Assinar" ou "Testar 30 dias grátis".
2.  **Chamada à Edge Function**: O frontend chama a Edge Function `create-checkout-session`, enviando o `empresa_id`, `plan_slug` e `billing_cycle`.
3.  **`create-checkout-session`**:
    *   Valida os dados recebidos.
    *   Verifica se a empresa já possui um `stripe_customer_id`. Se não, cria um novo cliente no Stripe e salva o ID na tabela `empresas`.
    *   Cria uma **Sessão de Checkout** no Stripe, configurando um `trial_period_days: 30`.
    *   Retorna a URL da sessão de checkout para o frontend.
4.  **Redirecionamento para o Stripe**: O frontend redireciona o usuário para a URL de pagamento do Stripe.
5.  **Stripe Webhook**: Após a conclusão (ou falha) do checkout, o Stripe envia eventos para a Edge Function `stripe-webhook`.
6.  **`stripe-webhook`**:
    *   Valida a assinatura do webhook para garantir que a requisição veio do Stripe.
    *   Processa eventos `customer.subscription.*` (created, updated, deleted).
    *   Extrai os dados da assinatura.
    *   Chama a **RPC `upsert_subscription`** no Supabase, passando os dados para que o banco de dados seja atualizado de forma segura. A função **não** escreve diretamente na tabela.
7.  **Página de Sucesso**: O usuário é redirecionado para a página de sucesso, que verifica o status da assinatura e exibe a confirmação.

## Testando o Fluxo

É crucial testar o fluxo sem usar chaves de produção.

### Teste via Stripe CLI

A maneira mais eficaz de testar o webhook é usando a Stripe CLI.

1.  **Instale a Stripe CLI** e faça login com `stripe login`.

2.  **Encaminhe os webhooks para sua função local**:
    ```bash
    supabase functions serve stripe-webhook --no-verify-jwt
    stripe listen --forward-to http://localhost:54321/functions/v1/stripe-webhook
    ```
    Anote o segredo do webhook (`whsec_...`) exibido no terminal e configure-o como `STRIPE_WEBHOOK_SECRET` em seu ambiente local.

3.  **Dispare eventos de assinatura**: Use `stripe trigger` para simular eventos.

    *   **Criar uma nova assinatura (em trial)**:
        ```bash
        stripe trigger customer.subscription.created --override "subscription:metadata.empresa_id=<SEU_EMPRESA_ID>"
        ```
        **Critério de Aceite**: Uma nova linha deve ser criada na tabela `public.subscriptions` com `status: 'trialing'`.

    *   **Atualizar uma assinatura (ex: troca de plano)**:
        Primeiro, obtenha um `price_id` diferente do plano atual.
        ```bash
        stripe trigger customer.subscription.updated --override "subscription:items.data[0].price.id=<NOVO_PRICE_ID>" --override "subscription:metadata.empresa_id=<SEU_EMPRESA_ID>"
        ```
        **Critério de Aceite**: A linha existente em `public.subscriptions` deve ser atualizada com o novo `stripe_price_id`, `plan_slug` e `billing_cycle`.

    *   **Cancelar uma assinatura no final do período**:
        ```bash
        stripe trigger customer.subscription.updated --override "subscription:cancel_at_period_end=true" --override "subscription:metadata.empresa_id=<SEU_EMPRESA_ID>"
        ```
        **Critério de Aceite**: O campo `cancel_at_period_end` na tabela `public.subscriptions` deve ser `true`.

    *   **Deletar (cancelar imediatamente) uma assinatura**:
        ```bash
        stripe trigger customer.subscription.deleted --override "subscription:metadata.empresa_id=<SEU_EMPRESA_ID>"
        ```
        **Critério de Aceite**: O `status` da assinatura em `public.subscriptions` deve ser atualizado para `'canceled'`.

**Importante**: Substitua `<SEU_EMPRESA_ID>` pelo ID de uma empresa de teste no seu banco de dados.
