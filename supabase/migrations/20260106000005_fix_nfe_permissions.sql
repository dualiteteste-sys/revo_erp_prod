/*
  # Fix NFe Import Permissions
  
  ## Description
  Adds missing GRANT statements for the Fiscal NFe Import tables.
  These tables were created in a previous migration but lacked the necessary grants for authenticated users.
*/

-- 1. Fiscal NFe Imports
grant all on table public.fiscal_nfe_imports to authenticated, service_role;

-- 2. Fiscal NFe Import Items
grant all on table public.fiscal_nfe_import_items to authenticated, service_role;

-- Ensure RLS is enabled (just in case)
alter table public.fiscal_nfe_imports enable row level security;
alter table public.fiscal_nfe_import_items enable row level security;
