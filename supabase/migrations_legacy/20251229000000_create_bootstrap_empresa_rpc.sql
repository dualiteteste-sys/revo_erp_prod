/*
# [RPC] Criação da função bootstrap_empresa_for_current_user
Esta função é essencial para o fluxo de onboarding. Ela cria uma nova empresa e vincula o usuário autenticado como o proprietário (OWNER) ou administrador (ADMIN), garantindo que o primeiro usuário tenha os privilégios necessários para configurar o sistema.

## Query Description: [Esta operação cria uma nova função no banco de dados. É uma operação segura que não afeta dados existentes. Ela apenas adiciona nova lógica de negócio para ser usada pelo frontend durante o cadastro de novas empresas.]

## Metadata:
- Schema-Category: ["Structural"]
- Impact-Level: ["Low"]
- Requires-Backup: [false]
- Reversible: [true]

## Structure Details:
- Function: public.bootstrap_empresa_for_current_user(p_fantasia text, p_nome text)

## Security Implications:
- RLS Status: [N/A]
- Policy Changes: [No]
- Auth Requirements: [A função exige um usuário autenticado (via `public.current_user_id()`).]

## Performance Impact:
- Indexes: [N/A]
- Triggers: [N/A]
- Estimated Impact: [Nenhum impacto em performance. A função é chamada apenas uma vez por novo usuário/empresa.]
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
  
  -- Se ainda não houver papel, erro
  if v_role_id is null then
    raise exception 'ROLE_NOT_FOUND' using detail = 'Papéis OWNER ou ADMIN não encontrados no banco de dados.';
  end if;

  -- 2) Cria empresa (mínimo viável; ajuste colunas se necessário)
  insert into public.empresas (fantasia, nome_razao_social)
  values (nullif(p_fantasia, ''), nullif(p_nome, ''))
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
