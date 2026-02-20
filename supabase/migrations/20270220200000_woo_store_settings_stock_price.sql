begin;

-- WooCommerce Store Settings (Sprint 3)
-- Persist regras de estoque/preço por canal no runtime store usado pelo worker.
-- Idempotente: safe para re-aplicar.

alter table public.integrations_woocommerce_store
  add column if not exists settings jsonb not null default '{}'::jsonb;

commit;

