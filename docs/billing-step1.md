# Documentação: Refatoração do Billing (Etapa 1)

Este documento descreve as alterações implementadas para robustecer o sistema de billing, centralizando a lógica de atualização de assinaturas e melhorando a segurança das funções de banco de dados.

## 1. Arquivo de Migração (`..._billing_upsert_subscription.sql`)

A nova migração SQL introduz várias melhorias e salvaguardas no banco de dados:

- **Criação de ENUMs:** Garante a existência dos tipos `billing_cycle` (`monthly`, `yearly`) e `sub_status` (contendo todos os status possíveis de uma assinatura Stripe). Isso padroniza os dados e previne a inserção de valores inválidos.

- **Função `plan_from_price`:** Cria uma função SQL `STABLE` que atua como um catálogo, mapeando um `stripe_price_id` para o `slug` e `billing_cycle` correspondentes na tabela `public.plans`. Isso evita a necessidade de hardcodear essa lógica no código das Edge Functions.

- **RPC `upsert_subscription`:** Esta é a mudança central. A função:
    - É `SECURITY DEFINER`, permitindo que seja executada com os privilégios do seu criador (neste caso, um superusuário), o que é necessário para escrever na tabela `subscriptions`, que tem RLS restritiva.
    - **Centraliza toda a lógica de escrita** na tabela `public.subscriptions`. Nenhuma outra parte do sistema deve escrever diretamente nesta tabela.
    - Realiza uma **validação cruzada** usando `plan_from_price` para garantir que os dados recebidos do webhook (slug, ciclo) sejam consistentes com o que está cadastrado no catálogo de planos (`public.plans`).
    - Utiliza `INSERT ... ON CONFLICT (empresa_id) DO UPDATE` para criar ou atualizar a assinatura de uma empresa de forma atômica.
    - **Fixa o `search_path`:** A cláusula `SET search_path = public, pg_temp` previne ataques de sequestro de `search_path`, uma vulnerabilidade comum em funções `SECURITY DEFINER`.

- **Ajustes de Segurança:**
    - Garante que o RLS na tabela `subscriptions` está ativo.
    - Cria (se não existir) uma política de `SELECT` que permite que usuários autenticados leiam apenas os dados da assinatura da sua própria empresa.
    - Revoga explicitamente as permissões de `INSERT`, `UPDATE`, `DELETE` para os roles `anon` e `authenticated`, reforçando que a escrita só pode ocorrer via `service_role` (através da RPC).

## 2. Atualização da Edge Function (`stripe-webhook`)

A função de webhook do Stripe foi refatorada para usar a nova RPC, eliminando a escrita direta no banco de dados.

- **Lógica Centralizada:** Ao invés de construir e executar uma query `upsert` manualmente, a função agora apenas coleta os dados do evento do Stripe e os passa como parâmetros para a RPC `upsert_subscription`.
- **Fonte Única da Verdade:** A função consulta a tabela `public.plans` para obter o `plan_slug` e `billing_cycle` a partir do `stripe_price_id` recebido. Esses dados são então passados para a RPC, que os re-valida, garantindo consistência.
- **Segurança:** A função agora depende da lógica segura e centralizada da RPC para realizar a escrita, tornando o webhook mais simples e menos propenso a erros de manipulação de dados.

## 3. Como Testar com a Stripe CLI

Para verificar se a integração está funcionando corretamente, use a Stripe CLI para simular eventos de webhook.

1.  **Inicie o listener:**
    ```bash
    stripe listen --forward-to http://localhost:54321/functions/v1/stripe-webhook
    ```
    Copie o `webhook signing secret` (ex: `whsec_...`) e adicione-o ao seu arquivo `.env.local` como `STRIPE_WEBHOOK_SECRET`.

2.  **Inicie o Supabase localmente:**
    ```bash
    supabase start
    ```

3.  **Dispare os eventos:** Execute os seguintes comandos em um terminal separado.

    - **Criação de assinatura (início de trial):**
      ```bash
      stripe trigger customer.subscription.created
      ```
      *Verifique:* Uma nova linha deve aparecer em `public.subscriptions` com `status = 'trialing'`.

    - **Atualização de assinatura (ex: cancelamento no fim do período):**
      ```bash
      stripe trigger customer.subscription.updated
      ```
      *Verifique:* O campo `cancel_at_period_end` deve ser atualizado na linha correspondente.

    - **Exclusão de assinatura:**
      ```bash
      stripe trigger customer.subscription.deleted
      ```
      *Verifique:* O `status` da assinatura deve ser atualizado para `canceled`.

    - **Checkout completo (simula um novo cliente):**
      ```bash
      # Nota: Este trigger pode precisar de mais parâmetros para funcionar corretamente,
      # mas o evento customer.subscription.created é o mais importante para testar a lógica.
      stripe trigger checkout.session.completed
      ```

Após cada trigger, inspecione a tabela `public.subscriptions` no seu Supabase Studio local para confirmar que os dados foram criados/atualizados corretamente pela RPC.
