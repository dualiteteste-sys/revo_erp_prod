/*
  Compat: função legacy com return type diferente

  Alguns ambientes antigos (principalmente DEV) podem ter uma versão legacy de:
    public.set_active_empresa_for_current_user(uuid)
  com return type diferente do esperado.

  Como Postgres não permite alterar return type via CREATE OR REPLACE,
  dropar a função antes garante que as migrations seguintes possam recriá-la.
*/

BEGIN;

drop function if exists public.set_active_empresa_for_current_user(uuid);

COMMIT;

