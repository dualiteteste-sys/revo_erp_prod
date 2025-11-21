/*
  # [SECURE_BOOTSTRAP_NO_TRIGGER] Bootstrap de empresa no primeiro acesso, sem trigger em auth.users

  Impacto-segurança:
  - Evita trigger em auth.users (não somos owners).
  - Usa SECURITY DEFINER + search_path fixo (pg_catalog, public).
  - Função interna (system_*) NÃO é exposta a authenticated.
  - RPC segura (secure_bootstrap_*) usa auth.uid() e pode ser chamada pelo cliente autenticado.

  Reversibilidade:
  - DROP FUNCTION public.secure_bootstrap_empresa_for_current_user(text, text);
  - DROP FUNCTION public.system_bootstrap_empresa_for_user(uuid, text, text);
*/

-- 1) Função interna de sistema (NÃO expor a authenticated)
create or replace function public.system_bootstrap_empresa_for_user(
  p_user_id uuid,
  p_razao_social text default 'Empresa sem Nome',
  p_fantasia    text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner_role_id uuid;
  v_empresa_id    uuid;
  v_has_membership boolean;
begin
  if p_user_id is null then
    raise exception '[AUTOCREATE] p_user_id obrigatório';
  end if;

  select r.id into v_owner_role_id
  from public.roles r
  where r.slug = 'OWNER'
  limit 1;

  if v_owner_role_id is null then
    raise exception '[AUTOCREATE] role OWNER não encontrada em public.roles';
  end if;

  -- Já possui associação?
  select exists(select 1 from public.empresa_usuarios eu where eu.user_id = p_user_id)
  into v_has_membership;

  if v_has_membership then
    -- Garante active_empresa se ainda não houver
    if not exists (select 1 from public.user_active_empresa uae where uae.user_id = p_user_id) then
      select eu.empresa_id into v_empresa_id
      from public.empresa_usuarios eu
      where eu.user_id = p_user_id
      order by eu.created_at desc nulls last
      limit 1;

      if v_empresa_id is not null then
        update public.user_active_empresa
           set empresa_id = v_empresa_id
         where user_id = p_user_id;
        if not found then
          insert into public.user_active_empresa(user_id, empresa_id)
          values (p_user_id, v_empresa_id);
        end if;
      end if;
    end if;
    return;
  end if;

  -- Cria empresa padrão
  insert into public.empresas (razao_social, fantasia)
  values (
    coalesce(nullif(p_razao_social, ''), 'Empresa sem Nome'),
    nullif(p_fantasia, '')
  )
  returning id into v_empresa_id;

  -- Vincula como OWNER (idempotente)
  if not exists (
    select 1 from public.empresa_usuarios eu
    where eu.empresa_id = v_empresa_id and eu.user_id = p_user_id
  ) then
    insert into public.empresa_usuarios (empresa_id, user_id, role_id)
    values (v_empresa_id, p_user_id, v_owner_role_id);
  else
    update public.empresa_usuarios
       set role_id = v_owner_role_id
     where empresa_id = v_empresa_id and user_id = p_user_id;
  end if;

  -- Define empresa ativa (idempotente)
  update public.user_active_empresa
     set empresa_id = v_empresa_id
   where user_id = p_user_id;
  if not found then
    insert into public.user_active_empresa (user_id, empresa_id)
    values (p_user_id, v_empresa_id);
  end if;

  perform pg_notify('app_log', '[CREATE_*] system_bootstrap_empresa_for_user: ' || p_user_id::text);
exception
  when others then
    perform pg_notify('app_log', '[CREATE_*][ERR] system_bootstrap_empresa_for_user: ' || coalesce(p_user_id::text,'NULL') || ' - ' || sqlerrm);
    raise;
end;
$$;

revoke all on function public.system_bootstrap_empresa_for_user(uuid, text, text) from public;
-- opcional: permitir apenas service_role
grant execute on function public.system_bootstrap_empresa_for_user(uuid, text, text) to service_role;

-- 2) RPC segura para o frontend: resolve user_id via auth.uid() (sem aceitar parâmetro sensível)
create or replace function public.secure_bootstrap_empresa_for_current_user(
  p_razao_social text default 'Empresa sem Nome',
  p_fantasia     text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid;
begin
  -- lê do JWT (Supabase)
  select coalesce(
           auth.uid(),
           nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
         )
    into v_uid;

  if v_uid is null then
    raise exception '[SECURE_BOOTSTRAP] Usuário não autenticado.';
  end if;

  perform public.system_bootstrap_empresa_for_user(v_uid, p_razao_social, p_fantasia);
end;
$$;

revoke all on function public.secure_bootstrap_empresa_for_current_user(text, text) from public;
grant execute on function public.secure_bootstrap_empresa_for_current_user(text, text) to authenticated, service_role;
