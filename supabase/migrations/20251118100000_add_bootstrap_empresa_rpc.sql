-- [RPC][AUTH] bootstrap_empresa_for_current_user (compatível com schema atual)
-- Garante empresa ativa para o usuário logado. Idempotente.

create or replace function public.bootstrap_empresa_for_current_user(
  p_nome text default null,
  p_fantasia text default null
)
returns table(empresa_id uuid, status text)
language plpgsql
security definer
set search_path = 'pg_catalog','public'
as $$
declare
  v_uid uuid := public.current_user_id();
  v_empresa_id uuid;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.' using errcode = '28000';
  end if;

  -- 1) Já existe ativa?
  select uae.empresa_id
    into v_empresa_id
  from public.user_active_empresa uae
  where uae.user_id = v_uid;

  if v_empresa_id is not null then
    return query select v_empresa_id, 'already_active'::text;
    return;
  end if;

  -- 2) Tem vínculo existente? (pega qualquer um determinístico)
  select eu.empresa_id
    into v_empresa_id
  from public.empresa_usuarios eu
  where eu.user_id = v_uid
  order by eu.created_at
  limit 1;

  if v_empresa_id is not null then
    insert into public.user_active_empresa (user_id, empresa_id)
    values (v_uid, v_empresa_id)
    on conflict (user_id) do update set empresa_id = excluded.empresa_id;

    return query select v_empresa_id, 'activated_existing'::text;
    return;
  end if;

  -- 3) Cria empresa mínima (schema: razao_social / fantasia)
  insert into public.empresas (id, razao_social, fantasia, created_at, updated_at)
  values (gen_random_uuid(),
          coalesce(nullif(trim(p_nome), ''), 'Minha Empresa'),
          nullif(trim(p_fantasia), ''),
          timezone('utc', now()),
          timezone('utc', now()))
  returning id into v_empresa_id;

  -- 4) Vincula usuário (sem assumir coluna role)
  insert into public.empresa_usuarios (user_id, empresa_id)
  values (v_uid, v_empresa_id)
  on conflict do nothing;

  -- 5) Seta como ativa
  insert into public.user_active_empresa (user_id, empresa_id)
  values (v_uid, v_empresa_id)
  on conflict (user_id) do update set empresa_id = excluded.empresa_id;

  return query select v_empresa_id, 'created_new'::text;
end;
$$;

-- Permissões
revoke execute on function public.bootstrap_empresa_for_current_user(text, text) from public;
grant execute on function public.bootstrap_empresa_for_current_user(text, text) to authenticated;
