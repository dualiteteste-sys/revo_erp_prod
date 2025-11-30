-- [RPC] bootstrap_empresa_for_current_user (FIX 2)
-- Corrige o nome da coluna de 'nome_razao_social' para 'razao_social' no INSERT,
-- para alinhar com o schema real da tabela 'empresas' e resolver o erro de coluna inexistente.

/*
          # [Operation Name]
          Fix RPC bootstrap_empresa_for_current_user

          ## Query Description: "This operation replaces a database function to correct a column name mismatch. It changes an INSERT statement from using `nome_razao_social` to `razao_social` in the `empresas` table. This is a non-destructive change that fixes a bug in the company creation process during user onboarding. No data will be lost or altered."
          
          ## Metadata:
          - Schema-Category: "Structural"
          - Impact-Level: "Low"
          - Requires-Backup: false
          - Reversible: true
          
          ## Structure Details:
          - Function `public.bootstrap_empresa_for_current_user` is being replaced.
          
          ## Security Implications:
          - RLS Status: Not applicable to function definition.
          - Policy Changes: No
          - Auth Requirements: Function still requires an authenticated user.
          
          ## Performance Impact:
          - Indexes: None
          - Triggers: None
          - Estimated Impact: "No performance impact is expected."
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

  -- 2) Cria empresa
  -- A coluna 'p_nome' da função corresponde à 'razao_social' na tabela.
  insert into public.empresas (id, nome_fantasia, razao_social)
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

-- Permissões
revoke all on function public.bootstrap_empresa_for_current_user(text, text) from public;
grant execute on function public.bootstrap_empresa_for_current_user(text, text) to authenticated, service_role;

-- Atualiza cache
select pg_notify('pgrst','reload schema');
