-- Fix public.current_user_id() to actually return the authenticated user's ID
-- This replaces the stub that was returning NULL, preventing membership checks

create or replace function public.current_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  return auth.uid();
end;
$$;
