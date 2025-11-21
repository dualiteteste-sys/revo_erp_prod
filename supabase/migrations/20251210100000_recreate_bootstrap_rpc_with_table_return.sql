-- [MIGRATION] Recria a RPC bootstrap_empresa_for_current_user com retorno table(...)
-- Motivo: Postgres não permite alterar o return type via CREATE OR REPLACE; precisa DROP + CREATE.

begin;

-- 0) Dropar a versão antiga (mesma assinatura de parâmetros)
drop function if exists public.bootstrap_empresa_for_current_user(text, text);

-- 1) Criar a versão final (compatível com schema: nome_razao_social/nome_fantasia)
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

  -- 2) Tem vínculo existente? (qualquer um determinístico)
  select eu.empresa_id
    into v_empresa_id
  from public.empresa_usuarios eu
  where eu.user_id = v_uid
  limit 1;

  if v_empresa_id is not null then
    insert into public.user_active_empresa (user_id, empresa_id)
    values (v_uid, v_empresa_id)
    on conflict (user_id) do update set empresa_id = excluded.empresa_id;

    return query select v_empresa_id, 'activated_existing'::text;
    return;
  end if;

  -- 3) Cria empresa mínima (nome_razao_social / nome_fantasia)
  insert into public.empresas (id, nome_razao_social, nome_fantasia, created_at, updated_at)
  values (
    gen_random_uuid(),
    coalesce(nullif(trim(p_nome), ''), 'Minha Empresa'),
    nullif(trim(p_fantasia), ''),
    timezone('utc', now()),
    timezone('utc', now())
  )
  returning id into v_empresa_id;

  -- 4) Vincula usuário (sem assumir colunas extras)
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

-- 2) Permissões (limpa PUBLIC e concede para authenticated)
revoke execute on function public.bootstrap_empresa_for_current_user(text, text) from public;
grant  execute on function public.bootstrap_empresa_for_current_user(text, text) to authenticated;

commit;
