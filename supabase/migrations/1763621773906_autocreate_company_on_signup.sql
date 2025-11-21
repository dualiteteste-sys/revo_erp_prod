/*
  # [AUTOCREATE_COMPANY_TRG] Criação automática de empresa no signup

  ## Impacto / Segurança
  - Usa NEW.id do trigger (não depende de JWT).
  - SECURITY DEFINER + search_path fixo (pg_catalog, public).
  - REVOKE/GRANT restritos (NÃO expor a authenticated).
  - Logs via pg_notify.

  ## Compatibilidade
  - Só afeta novos usuários (ou usuários sem membership).
  - Não altera dados existentes.

  ## Reversibilidade
  - DROP TRIGGER on_auth_user_created ON auth.users;
  - DROP FUNCTION public.handle_new_user();
  - DROP FUNCTION public.system_bootstrap_empresa_for_user(uuid, text, text);

  ## Performance
  - Trigger AFTER INSERT em auth.users (baixa frequência).
*/

-- 1) Função de sistema: cria/ativa empresa para um user explícito (sem JWT)
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

  -- Já possui alguma associação?
  select exists(
    select 1 from public.empresa_usuarios eu where eu.user_id = p_user_id
  ) into v_has_membership;

  if v_has_membership then
    -- Garante active_empresa se ainda não houver
    if not exists (select 1 from public.user_active_empresa uae where uae.user_id = p_user_id) then
      select eu.empresa_id
        into v_empresa_id
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

    return; -- Nada a criar
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

-- Privilégios: NÃO expor a authenticated
revoke all on function public.system_bootstrap_empresa_for_user(uuid, text, text) from public;
-- Opcional: permitir apenas service_role (para manutenção/admin). Se preferir, omita totalmente.
grant execute on function public.system_bootstrap_empresa_for_user(uuid, text, text) to service_role;

-- 2) Função TRIGGER: usa NEW.id e chama a função acima
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.system_bootstrap_empresa_for_user(NEW.id, 'Empresa sem Nome', null);
  return NEW;
end;
$$;

-- Privilégios: não é necessário expor a ninguém; o trigger executa internamente
revoke all on function public.handle_new_user() from public;

-- 3) Trigger idempotente em auth.users
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();

comment on trigger on_auth_user_created on auth.users
  is 'Ao criar usuário no Supabase Auth, cria empresa padrão e define OWNER + user_active_empresa.';
