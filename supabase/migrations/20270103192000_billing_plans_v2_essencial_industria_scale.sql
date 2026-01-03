/*
  Billing: catálogo de planos v2 (Essencial/Pro/Max/Indústria/Scale)

  Contexto:
  - O produto deixou de usar START/ULTRA e adicionou ESSENCIAL/INDUSTRIA/SCALE.
  - O checkout e o webhook do Stripe mapeiam pelo `public.plans.stripe_price_id = price_...`.
  - O schema antigo restringia `slug` a ('START','PRO','MAX','ULTRA'), impedindo os novos planos.

  O que esta migration faz:
  1) Expande o CHECK constraint de `public.plans.slug` para aceitar os slugs novos (mantendo legados).
  2) Upsert dos 5 planos atuais com os Price IDs reais (modo teste) informados.
  3) Garante START/ULTRA como inativos.

  Notas:
  - `amount_cents` aqui é usado para exibição (landing/página de planos). A cobrança real vem do Stripe.
  - Os valores anuais seguem a regra “pague 10 meses” (economiza 2 meses).
*/

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Permitir novos slugs no catálogo
-- ---------------------------------------------------------------------------
ALTER TABLE public.plans
  DROP CONSTRAINT IF EXISTS plans_slug_check;

ALTER TABLE public.plans
  ADD CONSTRAINT plans_slug_check
  CHECK (slug IN ('ESSENCIAL','PRO','MAX','INDUSTRIA','SCALE','START','ULTRA'));

-- ---------------------------------------------------------------------------
-- 2) Upsert catálogo (slug + billing_cycle)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'plans_slug_billing_cycle_key'
  ) THEN
    INSERT INTO public.plans (slug, name, billing_cycle, currency, amount_cents, stripe_price_id, active)
    VALUES
      -- Mensal (valores de exibição)
      ('ESSENCIAL','Essencial','monthly','BRL', 14900,'price_1SlDST5Ay7EJ5Bv6cGFUT9iJ', true),
      ('PRO'      ,'Pro'      ,'monthly','BRL', 24900,'price_1SlDp95Ay7EJ5Bv6buH0z0ca', true),
      ('MAX'      ,'Max'      ,'monthly','BRL', 39000,'price_1SlDxn5Ay7EJ5Bv6AeAs03UF', true),
      ('INDUSTRIA','Indústria','monthly','BRL', 59000,'price_1SlEVq5Ay7EJ5Bv6hxPvyZi0', true),
      ('SCALE'    ,'Scale'    ,'monthly','BRL', 99000,'price_1SlEux5Ay7EJ5Bv69CGu3fra', true),

      -- Anual (pague 10 meses)
      ('ESSENCIAL','Essencial','yearly','BRL', 149000,'price_1SlDiX5Ay7EJ5Bv6O0398kE8', true),
      ('PRO'      ,'Pro'      ,'yearly','BRL', 249000,'price_1SlDsp5Ay7EJ5Bv6gZFH4SLE', true),
      ('MAX'      ,'Max'      ,'yearly','BRL', 390000,'price_1SlE1v5Ay7EJ5Bv6BUUJfcBd', true),
      ('INDUSTRIA','Indústria','yearly','BRL', 590000,'price_1SlEYc5Ay7EJ5Bv6mYzFp0Fh', true),
      ('SCALE'    ,'Scale'    ,'yearly','BRL', 990000,'price_1SlEvT5Ay7EJ5Bv6gnYH2sb1', true)
    ON CONFLICT (slug, billing_cycle) DO UPDATE
      SET
        name = EXCLUDED.name,
        currency = EXCLUDED.currency,
        amount_cents = EXCLUDED.amount_cents,
        stripe_price_id = EXCLUDED.stripe_price_id,
        active = EXCLUDED.active;
  ELSE
    -- Fallback compat: upsert pelo stripe_price_id (schema antigo)
    INSERT INTO public.plans (slug, name, billing_cycle, currency, amount_cents, stripe_price_id, active)
    VALUES
      ('ESSENCIAL','Essencial','monthly','BRL', 14900,'price_1SlDST5Ay7EJ5Bv6cGFUT9iJ', true),
      ('PRO'      ,'Pro'      ,'monthly','BRL', 24900,'price_1SlDp95Ay7EJ5Bv6buH0z0ca', true),
      ('MAX'      ,'Max'      ,'monthly','BRL', 39000,'price_1SlDxn5Ay7EJ5Bv6AeAs03UF', true),
      ('INDUSTRIA','Indústria','monthly','BRL', 59000,'price_1SlEVq5Ay7EJ5Bv6hxPvyZi0', true),
      ('SCALE'    ,'Scale'    ,'monthly','BRL', 99000,'price_1SlEux5Ay7EJ5Bv69CGu3fra', true),

      ('ESSENCIAL','Essencial','yearly','BRL', 149000,'price_1SlDiX5Ay7EJ5Bv6O0398kE8', true),
      ('PRO'      ,'Pro'      ,'yearly','BRL', 249000,'price_1SlDsp5Ay7EJ5Bv6gZFH4SLE', true),
      ('MAX'      ,'Max'      ,'yearly','BRL', 390000,'price_1SlE1v5Ay7EJ5Bv6BUUJfcBd', true),
      ('INDUSTRIA','Indústria','yearly','BRL', 590000,'price_1SlEYc5Ay7EJ5Bv6mYzFp0Fh', true),
      ('SCALE'    ,'Scale'    ,'yearly','BRL', 990000,'price_1SlEvT5Ay7EJ5Bv6gnYH2sb1', true)
    ON CONFLICT (stripe_price_id) DO UPDATE
      SET
        slug = EXCLUDED.slug,
        name = EXCLUDED.name,
        billing_cycle = EXCLUDED.billing_cycle,
        currency = EXCLUDED.currency,
        amount_cents = EXCLUDED.amount_cents,
        active = EXCLUDED.active;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Legados: manter inativos
-- ---------------------------------------------------------------------------
UPDATE public.plans
SET active = false
WHERE slug IN ('START','ULTRA');

SELECT pg_notify('pgrst','reload schema');

-- Verificação (somente leitura)
SELECT slug, billing_cycle, stripe_price_id, active
FROM public.plans
ORDER BY slug, billing_cycle;

COMMIT;

