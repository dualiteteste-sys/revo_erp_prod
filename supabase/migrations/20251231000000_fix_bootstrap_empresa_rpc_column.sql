/*
# [RPC] Fix bootstrap_empresa_for_current_user column name
This migration corrects the `bootstrap_empresa_for_current_user` function, which was trying to insert into a non-existent `nome` column in the `empresas` table. It now correctly inserts into the `nome_razao_social` column.

## Query Description: [This operation replaces an existing function. It is safe to run and will not affect existing data. It fixes a critical bug in the user onboarding flow.]

## Metadata:
- Schema-Category: ["Structural"]
- Impact-Level: ["Low"]
- Requires-Backup: [false]
- Reversible: [true]

## Structure Details:
- Function `public.bootstrap_empresa_for_current_user` is modified.

## Security Implications:
- RLS Status: [Not Applicable]
- Policy Changes: [No]
- Auth Requirements: [Function still requires an authenticated user]

## Performance Impact:
- Indexes: [No changes]
- Triggers: [No changes]
- Estimated Impact: [None]
*/

create or replace function public.bootstrap_empresa_for_current_user(
  p_fantasia text,
  p_nome     text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id    uuid := public.current_user_id();
  v_empresa_id uuid;
  v_role_id    uuid;
  v_role_slug  text := 'OWNER';
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  -- 1) Resolve papel (OWNER -> fallback ADMIN)
  select id into v_role_id from public.roles where upper(slug) = 'OWNER';
  if v_role_id is null then
    select id into v_role_id from public.roles where upper(slug) = 'ADMIN';
    v_role_slug := 'ADMIN';
  end if;

  -- 2) Cria empresa (mínimo viável; ajuste colunas se necessário)
  insert into public.empresas (id, fantasia, nome_razao_social)
  values (gen_random_uuid(), nullif(p_fantasia, ''), nullif(p_nome, ''))
  returning id into v_empresa_id;

  -- 3) Vincula usuário (idempotente)
  insert into public.empresa_usuarios (empresa_id, user_id, role_id, status)
  values (v_empresa_id, v_user_id, v_role_id, 'ACTIVE')
  on conflict (empresa_id, user_id) do update
    set role_id = excluded.role_id,
        status  = 'ACTIVE',
        updated_at = now();

  return jsonb_build_object(
    'empresa_id', v_empresa_id,
    'role', v_role_slug
  );
end;
$$;

-- Permissões mínimas para chamada via PostgREST/Supabase
revoke all on function public.bootstrap_empresa_for_current_user(text, text) from public;
grant execute on function public.bootstrap_empresa_for_current_user(text, text) to authenticated, service_role;

-- Atualiza cache do PostgREST
select pg_notify('pgrst','reload schema');
