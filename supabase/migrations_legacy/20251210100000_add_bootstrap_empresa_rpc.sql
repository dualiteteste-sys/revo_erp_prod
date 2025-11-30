-- [RPC][AUTH] bootstrap_empresa_for_current_user
-- Garante que o usuário logado tenha uma empresa ativa.
-- Se não tiver, cria uma nova, vincula e a torna ativa.
-- É idempotente: se já houver empresa ativa, apenas a retorna.
create or replace function public.bootstrap_empresa_for_current_user(
  p_nome text default null,
  p_fantasia text default null
)
returns table(empresa_id uuid, status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := public.current_user_id();
  v_empresa_id uuid;
  v_new_empresa_id uuid;
  v_user_email text;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  -- 1. Verifica se já existe uma empresa ativa para o usuário
  select uae.empresa_id into v_empresa_id
  from public.user_active_empresa uae
  where uae.user_id = v_uid;

  if v_empresa_id is not null then
    return query select v_empresa_id, 'already_active'::text;
    return;
  end if;

  -- 2. Se não houver ativa, verifica se o usuário já é membro de alguma empresa
  select eu.empresa_id into v_empresa_id
  from public.empresa_usuarios eu
  where eu.user_id = v_uid
  order by eu.created_at asc
  limit 1;

  if v_empresa_id is not null then
    -- Se é membro, define a mais antiga como ativa e retorna
    insert into public.user_active_empresa (user_id, empresa_id)
    values (v_uid, v_empresa_id)
    on conflict (user_id) do update set empresa_id = excluded.empresa_id;

    return query select v_empresa_id, 'activated_existing'::text;
    return;
  end if;

  -- 3. Se não é membro de nenhuma, cria uma nova empresa
  select u.email into v_user_email from auth.users u where u.id = v_uid;

  insert into public.empresas (razao_social, fantasia, email)
  values (
    coalesce(trim(p_nome), 'Minha Empresa'),
    coalesce(trim(p_fantasia), trim(p_nome), 'Minha Empresa'),
    v_user_email
  )
  returning id into v_new_empresa_id;

  -- 4. Vincula o usuário à nova empresa
  insert into public.empresa_usuarios (user_id, empresa_id, role)
  values (v_uid, v_new_empresa_id, 'admin');

  -- 5. Define a nova empresa como ativa
  insert into public.user_active_empresa (user_id, empresa_id)
  values (v_uid, v_new_empresa_id)
  on conflict (user_id) do update set empresa_id = excluded.empresa_id;

  return query select v_new_empresa_id, 'created_new'::text;
end;
$$;

-- Permissões
revoke execute on function public.bootstrap_empresa_for_current_user(text, text) from public;
grant execute on function public.bootstrap_empresa_for_current_user(text, text) to authenticated;
