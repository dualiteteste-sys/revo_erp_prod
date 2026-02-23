BEGIN;

ALTER FUNCTION public.ops_account_delete_preview_current_empresa()
  VOLATILE;

COMMIT;
