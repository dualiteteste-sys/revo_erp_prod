# Edge Functions

Este diretório contém todas as Edge Functions do projeto. Cada função é autocontida em sua própria pasta, que inclui o código-fonte (`index.ts`) e um arquivo de configuração de importação (`deno.json`).

## Funções Disponíveis

Abaixo está uma lista de todas as funções e seus respectivos endpoints e responsabilidades.

### 1. `create-checkout-session`

- **Endpoint**: `/create-checkout-session`
- **Método**: `POST`
- **Descrição**: Cria uma sessão de checkout do Stripe para um plano ou add-on. Garante que um `stripe_customer_id` exista para a empresa e redireciona o usuário para a página de pagamento do Stripe.

### 2. `stripe-webhook`

- **Endpoint**: `/stripe-webhook`
- **Método**: `POST`
- **Descrição**: Recebe e processa webhooks do Stripe para eventos de assinatura (`customer.subscription.*`). Utiliza a RPC `upsert_subscription` para manter o banco de dados sincronizado com o status das assinaturas no Stripe.

### 3. `billing-portal`

- **Endpoint**: `/billing-portal`
- **Método**: `POST`
- **Descrição**: Cria e retorna uma URL para o Portal do Cliente do Stripe, permitindo que os usuários gerenciem seus métodos de pagamento e assinaturas.

### 4. `billing-success-session`

- **Endpoint**: `/billing-success-session`
- **Método**: `GET`
- **Descrição**: Chamada pela página de sucesso após um checkout. Verifica o status da sessão de checkout e aguarda a confirmação do webhook para retornar os detalhes da assinatura recém-criada.
