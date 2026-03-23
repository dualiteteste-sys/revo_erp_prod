-- Fix: OS edit form doesn't show client name or technician name
-- Root cause: get_os_by_id_for_current_user returns public.ordem_servicos which
-- has no cliente_nome column (it's computed via JOIN in the listing RPC).
-- Solution: new RPC get_os_detail_for_current_user returns JSONB with all OS
-- columns plus cliente_nome and tecnico_nome via JOINs.
--
-- Also: add os_observacoes_padrao to empresas for default observations text.

-- 1) New RPC: get_os_detail_for_current_user — returns OS + cliente_nome + tecnico_nome
create or replace function public.get_os_detail_for_current_user(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
stable
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_result jsonb;
begin
  perform public.require_permission_for_current_user('os','view');

  if v_empresa_id is null then
    raise exception '[RPC][GET_OS] Nenhuma empresa ativa encontrada' using errcode = '42501';
  end if;

  select to_jsonb(os.*) || jsonb_build_object(
    'cliente_nome', p.nome,
    'tecnico_nome', coalesce(nullif((u.raw_user_meta_data->>'name')::text, ''), u.email::text)
  )
  into v_result
  from public.ordem_servicos os
  left join public.pessoas p on p.id = os.cliente_id and p.empresa_id = os.empresa_id
  left join auth.users u on u.id = os.tecnico_user_id
  where os.id = p_id
    and os.empresa_id = v_empresa_id
  limit 1;

  if v_result is null then
    raise exception '[RPC][GET_OS] OS não encontrada na empresa atual' using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_os_detail_for_current_user(uuid) from public, anon;
grant execute on function public.get_os_detail_for_current_user(uuid) to authenticated, service_role;

-- 2) Add os_observacoes_padrao to empresas
alter table public.empresas
  add column if not exists os_observacoes_padrao text;

-- 3) RPC: get default observations for current empresa
create or replace function public.os_observacoes_padrao_get()
returns text
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select e.os_observacoes_padrao
  from public.empresas e
  where e.id = public.current_empresa_id();
$$;

revoke all on function public.os_observacoes_padrao_get() from public, anon;
grant execute on function public.os_observacoes_padrao_get() to authenticated, service_role;

-- 4) RPC: set default observations for current empresa
create or replace function public.os_observacoes_padrao_set(p_text text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  perform public.require_permission_for_current_user('os','update');

  if v_empresa_id is null then
    raise exception '[RPC][OS][OBS_PADRAO] Nenhuma empresa ativa encontrada' using errcode = '42501';
  end if;

  update public.empresas
  set os_observacoes_padrao = nullif(trim(p_text), ''),
      updated_at = now()
  where id = v_empresa_id;
end;
$$;

revoke all on function public.os_observacoes_padrao_set(text) from public, anon;
grant execute on function public.os_observacoes_padrao_set(text) to authenticated, service_role;
