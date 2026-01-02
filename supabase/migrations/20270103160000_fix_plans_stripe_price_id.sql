/*
  Fix: Stripe webhook não encontra o plano por price_id

  Problema:
  - `public.plans.stripe_price_id` estava armazenando rótulos internos (ex.: MAX_MENSAL)
    em vez dos Price IDs reais do Stripe (ex.: price_...).
  - O webhook `stripe-webhook` consulta por `stripe_price_id = <price.id>` e não encontra o plano.

  O que faz:
  - Atualiza `public.plans.stripe_price_id` SOMENTE quando o valor atual for exatamente um dos rótulos abaixo.
  - Não altera registros que já estejam com `stripe_price_id` começando com `price_` (idempotente).

  Impacto:
  - Corrige a gravação de assinaturas no modo teste (Stripe).

  Reversibilidade:
  - Reversível via novo UPDATE (mapeamento inverso) se precisar voltar aos rótulos internos.
*/

BEGIN;

UPDATE public.plans
SET stripe_price_id = CASE stripe_price_id
  WHEN 'ESSENCIAL_MENSAL'  THEN 'price_1SlDST5Ay7EJ5Bv6cGFUT9iJ'
  WHEN 'ESSENCIAL_ANUAL'   THEN 'price_1SlDiX5Ay7EJ5Bv6O0398kE8'
  WHEN 'PRO_MENSAL'        THEN 'price_1SlDp95Ay7EJ5Bv6buH0z0ca'
  WHEN 'PRO_ANUAL'         THEN 'price_1SlDsp5Ay7EJ5Bv6gZFH4SLE'
  WHEN 'MAX_MENSAL'        THEN 'price_1SlDxn5Ay7EJ5Bv6AeAs03UF'
  WHEN 'MAX_ANUAL'         THEN 'price_1SlE1v5Ay7EJ5Bv6BUUJfcBd'
  WHEN 'INDUSTRIA_MENSAL'  THEN 'price_1SlEVq5Ay7EJ5Bv6hxPvyZi0'
  WHEN 'INDUSTRIA_ANUAL'   THEN 'price_1SlEYc5Ay7EJ5Bv6mYzFp0Fh'
  WHEN 'SCALE_MENSAL'      THEN 'price_1SlEux5Ay7EJ5Bv69CGu3fra'
  WHEN 'SCALE_ANUAL'       THEN 'price_1SlEvT5Ay7EJ5Bv6gnYH2sb1'
  ELSE stripe_price_id
END
WHERE stripe_price_id IN (
  'ESSENCIAL_MENSAL',
  'ESSENCIAL_ANUAL',
  'PRO_MENSAL',
  'PRO_ANUAL',
  'MAX_MENSAL',
  'MAX_ANUAL',
  'INDUSTRIA_MENSAL',
  'INDUSTRIA_ANUAL',
  'SCALE_MENSAL',
  'SCALE_ANUAL'
)
AND stripe_price_id NOT LIKE 'price_%';

-- Verificação (somente leitura)
SELECT slug, stripe_price_id, active
FROM public.plans
ORDER BY slug;

COMMIT;

