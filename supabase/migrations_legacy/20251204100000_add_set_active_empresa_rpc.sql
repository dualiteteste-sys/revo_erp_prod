/*
# [RPC] Set Active Company for User
Creates a secure RPC to set the active company for the current user, ensuring the user is a member of that company.

## Query Description:
This operation adds a new function `set_active_empresa_for_current_user` that allows the frontend to persist the user's active company choice in the database. It is a safe, non-destructive operation that enhances the multi-tenancy mechanism by ensuring all subsequent server-side operations for the user are correctly scoped to the selected company. This change does not affect existing data.

## Metadata:
- Schema-Category: "Structural"
- Impact-Level: "Low"
- Requires-Backup: false
- Reversible: true

## Structure Details:
- Creates function: `public.set_active_empresa_for_current_user(p_empresa_id uuid)`
- Affects tables:
  - `public.empresa_usuarios` (potential INSERT)
  - `public.user_active_empresa` (UPSERT)

## Security Implications:
- RLS Status: Unchanged.
- Policy Changes: No.
- Auth Requirements: `authenticated` role. The function is `SECURITY DEFINER` and uses `current_user_id()` to securely operate on behalf of the logged-in user, which is a key part of the multi-tenancy security model.

## Performance Impact:
- Indexes: None.
- Triggers: None.
- Estimated Impact: Negligible. The function performs simple checks and an upsert on a small table.
*/

-- Drop function for rollback
drop function if exists public.set_active_empresa_for_current_user(uuid);

-- [RPC] Define a empresa ativa para o usuário atual e garante vínculo
create or replace function public.set_active_empresa_for_current_user(p_empresa_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_user_id uuid := public.current_user_id();
  v_exists  boolean;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '28000';
  end if;

  -- 1) Empresa existe?
  if not exists (select 1 from public.empresas e where e.id = p_empresa_id) then
    raise exception 'Empresa inexistente.' using errcode = '23503';
  end if;

  -- 2) Garante vínculo empresa_usuarios (se ainda não existir)
  select exists(
    select 1 from public.empresa_usuarios eu
    where eu.user_id = v_user_id and eu.empresa_id = p_empresa_id
  ) into v_exists;

  if not v_exists then
    insert into public.empresa_usuarios (user_id, empresa_id)
    values (v_user_id, p_empresa_id);
  end if;

  -- 3) Upsert da preferência user_active_empresa
  insert into public.user_active_empresa (user_id, empresa_id)
  values (v_user_id, p_empresa_id)
  on conflict (user_id) do update
    set empresa_id = excluded.empresa_id;

  return p_empresa_id;
end;
$$;

-- Grant access to the function
grant execute on function public.set_active_empresa_for_current_user(uuid) to authenticated;
