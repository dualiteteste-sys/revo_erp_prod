/*
  # Fix Recebimento Permissions
  
  ## Description
  Adds missing GRANT statements for the Recebimento module tables.
  Without these grants, even with RLS policies, authenticated users cannot access the tables.
*/

-- 1. Recebimentos
grant all on table public.recebimentos to authenticated, service_role;

-- 2. Recebimento Itens
grant all on table public.recebimento_itens to authenticated, service_role;

-- 3. Recebimento Conferencias
grant all on table public.recebimento_conferencias to authenticated, service_role;

-- Ensure RLS is enabled (just in case)
alter table public.recebimentos enable row level security;
alter table public.recebimento_itens enable row level security;
alter table public.recebimento_conferencias enable row level security;
