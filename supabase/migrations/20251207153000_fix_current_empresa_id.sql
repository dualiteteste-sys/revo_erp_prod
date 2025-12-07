-- Fix public.current_empresa_id() to actually return the user's active company
-- This replaces the stub that was returning NULL

create or replace function public.current_empresa_id()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
  v_empresa_id uuid;
begin
  -- 1. Get current user ID (using our robust helper or auth.uid)
  v_user_id := auth.uid();
  
  if v_user_id is null then
    return null;
  end if;

  -- 2. Try to find the "last active" company if we track it (optional, for now skip)
  
  -- 3. Fallback: Return the first company the user is a member of
  -- We prioritize 'ACTIVE' status if possible
  select empresa_id into v_empresa_id
  from public.empresa_usuarios
  where user_id = v_user_id
  order by 
    case when status = 'ACTIVE' then 1 else 2 end,
    created_at desc
  limit 1;

  return v_empresa_id;
end;
$$;
