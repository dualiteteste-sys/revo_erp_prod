/*
  Stripe: desativar planos legados com rótulo em `stripe_price_id`

  Contexto:
  - Existem planos legados em `public.plans` com `stripe_price_id` como rótulo interno:
    START_MENSAL, START_ANUAL, ULTRA_MENSAL, ULTRA_ANUAL
  - O webhook do Stripe procura por `stripe_price_id = <price_...>` e esses rótulos não casam.
  - Decisão do produto: START/ULTRA não serão usados → devem ficar inativos.

  O que faz:
  - Marca `active = false` apenas para os registros cujo `stripe_price_id` esteja na lista acima.
  - Idempotente: rodar várias vezes não muda o resultado final.
  - Não cria/remove linhas e não altera schema.
*/

BEGIN;

UPDATE public.plans
SET active = false
WHERE stripe_price_id IN ('START_MENSAL', 'START_ANUAL', 'ULTRA_MENSAL', 'ULTRA_ANUAL');

-- Verificação (somente leitura)
SELECT slug, stripe_price_id, active
FROM public.plans
ORDER BY slug;

COMMIT;

