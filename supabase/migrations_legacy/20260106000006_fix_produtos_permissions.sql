/*
  # Fix Produtos Permissions
  
  ## Description
  Adds missing GRANT statements for the Produtos table.
  The user reported 'permission denied for table produtos' (42501).
*/

-- Grant permissions on public.produtos
grant all on table public.produtos to authenticated, service_role;

-- Ensure RLS is enabled (just in case)
alter table public.produtos enable row level security;
