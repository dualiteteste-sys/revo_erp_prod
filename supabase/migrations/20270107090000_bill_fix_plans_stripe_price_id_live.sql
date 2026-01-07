/*
  Motivo:
  - Ao trocar do Stripe TEST para LIVE, os Price IDs mudam (price_... diferentes).
  - Nosso webhook/billing procura o plano por `public.plans.stripe_price_id` e precisa bater com o price.id do Stripe LIVE.

  Impacto:
  - Atualiza SOMENTE os 10 registros dos planos principais (ESSENCIAL/PRO/MAX/INDUSTRIA/SCALE, mensal/anual)
    para usar os Price IDs LIVE fornecidos.
  - Não cria colunas, não cria/deleta linhas, não altera schema.

  Reversibilidade:
  - Reversível via outra migration trocando os IDs de volta (ex.: para os IDs de teste), ou restaurando snapshot.
*/

BEGIN;

UPDATE public.plans
SET stripe_price_id = CASE
  WHEN slug = 'ESSENCIAL' AND billing_cycle = 'monthly' THEN 'price_1Sn4WB5Ay7EJ5Bv6nDmjKvPw'
  WHEN slug = 'ESSENCIAL' AND billing_cycle = 'yearly'  THEN 'price_1Sn4bW5Ay7EJ5Bv6uxIt8aHj'
  WHEN slug = 'PRO'       AND billing_cycle = 'monthly' THEN 'price_1Sn4da5Ay7EJ5Bv6uztzrzED'
  WHEN slug = 'PRO'       AND billing_cycle = 'yearly'  THEN 'price_1Sn4ek5Ay7EJ5Bv6ddDaTh1i'
  WHEN slug = 'MAX'       AND billing_cycle = 'monthly' THEN 'price_1Sn4iN5Ay7EJ5Bv6THrMBvCh'
  WHEN slug = 'MAX'       AND billing_cycle = 'yearly'  THEN 'price_1Sn4jL5Ay7EJ5Bv6hBac5oEC'
  WHEN slug = 'INDUSTRIA' AND billing_cycle = 'monthly' THEN 'price_1Sn4tQ5Ay7EJ5Bv6552ZR66x'
  WHEN slug = 'INDUSTRIA' AND billing_cycle = 'yearly'  THEN 'price_1Sn4uh5Ay7EJ5Bv6VbhpD7pu'
  WHEN slug = 'SCALE'     AND billing_cycle = 'monthly' THEN 'price_1Sn4vY5Ay7EJ5Bv6CEgLq3Ds'
  WHEN slug = 'SCALE'     AND billing_cycle = 'yearly'  THEN 'price_1Sn4wY5Ay7EJ5Bv6ryXw73vz'
  ELSE stripe_price_id
END
WHERE slug IN ('ESSENCIAL', 'PRO', 'MAX', 'INDUSTRIA', 'SCALE')
  AND billing_cycle IN ('monthly', 'yearly')
  AND stripe_price_id NOT IN (
    'price_1Sn4WB5Ay7EJ5Bv6nDmjKvPw',
    'price_1Sn4bW5Ay7EJ5Bv6uxIt8aHj',
    'price_1Sn4da5Ay7EJ5Bv6uztzrzED',
    'price_1Sn4ek5Ay7EJ5Bv6ddDaTh1i',
    'price_1Sn4iN5Ay7EJ5Bv6THrMBvCh',
    'price_1Sn4jL5Ay7EJ5Bv6hBac5oEC',
    'price_1Sn4tQ5Ay7EJ5Bv6552ZR66x',
    'price_1Sn4uh5Ay7EJ5Bv6VbhpD7pu',
    'price_1Sn4vY5Ay7EJ5Bv6CEgLq3Ds',
    'price_1Sn4wY5Ay7EJ5Bv6ryXw73vz'
  );

COMMIT;

-- Verificação (somente leitura)
SELECT slug, billing_cycle, stripe_price_id, active
FROM public.plans
ORDER BY slug, billing_cycle;

