/*
  Seed de planos (catálogo) — idempotente

  Objetivo:
  - Garantir que DEV/VERIFY/PROD tenham os mesmos planos para a landing e página de assinatura.
  - Evitar "tela vazia" após reset/novo projeto.

  Observação:
  - `stripe_price_id` ainda é usado como "identificador de preço" no app.
    Enquanto não integrarmos o gateway de cobrança, usamos os IDs internos (ex.: START_MENSAL).
*/

BEGIN;

do $$
begin
  /*
    Este seed começou com conflito por `stripe_price_id` (único). Mais tarde adicionamos
    o índice/constraint único (slug, billing_cycle). Em projetos onde esse índice já existe
    (ex.: DEV remoto desalinhado), o insert pode falhar por duplicidade de (slug, billing_cycle)
    antes de cair no ON CONFLICT.

    Para manter compatibilidade com os dois estados do schema, escolhemos o alvo do upsert
    dinamicamente com base na existência do índice `plans_slug_billing_cycle_key`.
  */
  if exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'plans_slug_billing_cycle_key'
  ) then
    insert into public.plans (slug, name, billing_cycle, currency, amount_cents, stripe_price_id, active)
    values
      ('START','Start','monthly','BRL',  4900,'START_MENSAL', true),
      ('PRO'  ,'Pro'  ,'monthly','BRL', 15900,'PRO_MENSAL'  , true),
      ('MAX'  ,'Max'  ,'monthly','BRL', 34900,'MAX_MENSAL'  , true),
      ('ULTRA','Ultra','monthly','BRL', 78900,'ULTRA_MENSAL', true),

      ('START','Start','yearly','BRL',  3990,'START_ANUAL', true),
      ('PRO'  ,'Pro'  ,'yearly','BRL', 12900,'PRO_ANUAL'  , true),
      ('MAX'  ,'Max'  ,'yearly','BRL', 27500,'MAX_ANUAL'  , true),
      ('ULTRA','Ultra','yearly','BRL', 62900,'ULTRA_ANUAL', true)
    on conflict (slug, billing_cycle) do update
    set
      name = excluded.name,
      currency = excluded.currency,
      amount_cents = excluded.amount_cents,
      stripe_price_id = excluded.stripe_price_id,
      active = excluded.active;
  else
    insert into public.plans (slug, name, billing_cycle, currency, amount_cents, stripe_price_id, active)
    values
      ('START','Start','monthly','BRL',  4900,'START_MENSAL', true),
      ('PRO'  ,'Pro'  ,'monthly','BRL', 15900,'PRO_MENSAL'  , true),
      ('MAX'  ,'Max'  ,'monthly','BRL', 34900,'MAX_MENSAL'  , true),
      ('ULTRA','Ultra','monthly','BRL', 78900,'ULTRA_MENSAL', true),

      ('START','Start','yearly','BRL',  3990,'START_ANUAL', true),
      ('PRO'  ,'Pro'  ,'yearly','BRL', 12900,'PRO_ANUAL'  , true),
      ('MAX'  ,'Max'  ,'yearly','BRL', 27500,'MAX_ANUAL'  , true),
      ('ULTRA','Ultra','yearly','BRL', 62900,'ULTRA_ANUAL', true)
    on conflict (stripe_price_id) do update
    set
      slug = excluded.slug,
      name = excluded.name,
      billing_cycle = excluded.billing_cycle,
      currency = excluded.currency,
      amount_cents = excluded.amount_cents,
      active = excluded.active;
  end if;
end $$;

select pg_notify('pgrst','reload schema');

COMMIT;
