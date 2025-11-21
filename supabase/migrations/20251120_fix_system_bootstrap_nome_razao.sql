/*
  # [FIX] system_bootstrap_empresa_for_user — preenche nome_razao_social

  Impacto / Segurança
  - SECURITY DEFINER + search_path fixo (pg_catalog, public).
  - Não expõe a authenticated; chamada segue via RPC segura (secure_bootstrap_*).
  - RLS preservada; função atua como definer.

  Compatibilidade
  - Mantém assinatura e comportamento; apenas inclui coluna obrigatória.
  - Afeta apenas usuários sem membership no primeiro login.

  Reversibilidade
  - CREATE OR REPLACE: basta reverter o arquivo.

  Performance
  - Irrelevante (insert único + upserts).
*/

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
  v_owner_role_id  uuid;
  v_empresa_id     uuid;
  v_has_membership boolean;
  v_razao          text := coalesce(nullif(p_razao_social,''), 'Empresa sem Nome');
  v_fant           text := nullif(p_fantasia,'');
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
    return;
  end if;

  -- Cria empresa padrão (preenche as duas colunas NOT NULL)
  insert into public.empresas (razao_social, nome_razao_social, fantasia)
  values (v_razao,            v_razao,            v_fant)
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

-- Privilégios (mantém a função interna não exposta)
revoke all on function public.system_bootstrap_empresa_for_user(uuid, text, text) from public;
grant execute on function public.system_bootstrap_empresa_for_user(uuid, text, text) to service_role;
