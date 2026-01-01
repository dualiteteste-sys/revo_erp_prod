/*
  MELI-02 (base): seleção de conta ativa

  Objetivo:
  - Suportar múltiplas contas/lojas por provider no futuro.
  - Definir uma conta "ativa" na conexão (ecommerces.active_account_id) para sync/import.
*/

BEGIN;

alter table public.ecommerces
  add column if not exists active_account_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ecommerces_active_account_fkey'
  ) then
    alter table public.ecommerces
      add constraint ecommerces_active_account_fkey
      foreign key (active_account_id) references public.ecommerce_accounts(id) on delete set null;
  end if;
end $$;

select pg_notify('pgrst','reload schema');

COMMIT;

