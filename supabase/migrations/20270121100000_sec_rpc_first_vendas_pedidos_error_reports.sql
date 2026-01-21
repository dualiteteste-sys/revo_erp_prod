/*
  SEC-RPC-FIRST-05: remover PostgREST direto (client-side) em tabelas sensíveis

  - Vendas (PDV/Comissões/Relatórios): substituir `.from('vendas_pedidos'/'vendas_devolucoes')` por RPCs.
  - Ops (Erros no Sistema): substituir `.from('error_reports')` por RPCs e revogar grants diretos.

  Objetivo:
  - reduzir superfície de PostgREST no frontend (inventário + allowlist)
  - manter multi-tenant via `current_empresa_id()` + RBAC
*/

begin;

-- -----------------------------------------------------------------------------
-- VENDAS: listagens específicas (PDV / Comissões / Totais)
-- -----------------------------------------------------------------------------

drop function if exists public.vendas_pdv_pedidos_list(integer);
create function public.vendas_pdv_pedidos_list(
  p_limit integer default 200
)
returns table (
  id uuid,
  numero integer,
  status text,
  total_geral numeric,
  data_emissao date,
  updated_at timestamptz,
  pdv_estornado_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_limit int := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  perform public.require_permission_for_current_user('vendas','view');

  return query
  select
    p.id,
    p.numero,
    p.status::text,
    p.total_geral,
    p.data_emissao,
    p.updated_at,
    p.pdv_estornado_at
  from public.vendas_pedidos p
  where p.empresa_id = v_empresa
    and p.canal = 'pdv'
  order by p.updated_at desc nulls last, p.numero desc
  limit v_limit;
end;
$$;

revoke all on function public.vendas_pdv_pedidos_list(integer) from public, anon;
grant execute on function public.vendas_pdv_pedidos_list(integer) to authenticated, service_role;

drop function if exists public.vendas_comissoes_pedidos_list(integer);
create function public.vendas_comissoes_pedidos_list(
  p_limit integer default 500
)
returns table (
  id uuid,
  numero integer,
  vendedor_id uuid,
  comissao_percent numeric,
  total_geral numeric,
  data_emissao date,
  status text
)
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_limit int := least(greatest(coalesce(p_limit, 500), 1), 2000);
begin
  perform public.require_permission_for_current_user('vendas','view');

  return query
  select
    p.id,
    p.numero,
    p.vendedor_id,
    p.comissao_percent,
    p.total_geral,
    p.data_emissao,
    p.status::text
  from public.vendas_pedidos p
  where p.empresa_id = v_empresa
    and p.vendedor_id is not null
  order by p.data_emissao desc nulls last, p.numero desc
  limit v_limit;
end;
$$;

revoke all on function public.vendas_comissoes_pedidos_list(integer) from public, anon;
grant execute on function public.vendas_comissoes_pedidos_list(integer) to authenticated, service_role;

drop function if exists public.vendas_relatorios_totais_pdv_devolucoes();
create function public.vendas_relatorios_totais_pdv_devolucoes()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_pdv_total numeric := 0;
  v_devolucoes_total numeric := 0;
begin
  perform public.require_permission_for_current_user('vendas','view');

  select coalesce(sum(p.total_geral), 0) into v_pdv_total
  from public.vendas_pedidos p
  where p.empresa_id = v_empresa
    and p.canal = 'pdv';

  select coalesce(sum(d.valor_total), 0) into v_devolucoes_total
  from public.vendas_devolucoes d
  where d.empresa_id = v_empresa;

  return jsonb_build_object(
    'pdv_total', v_pdv_total,
    'devolucoes_total', v_devolucoes_total
  );
end;
$$;

revoke all on function public.vendas_relatorios_totais_pdv_devolucoes() from public, anon;
grant execute on function public.vendas_relatorios_totais_pdv_devolucoes() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- OPS: Error Reports (listagem + update status) — RPC-first
-- -----------------------------------------------------------------------------

drop function if exists public.ops_error_reports_list(text, text[], timestamptz, timestamptz, boolean, integer);
create function public.ops_error_reports_list(
  p_q text default null,
  p_statuses text[] default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_only_mine boolean default false,
  p_limit integer default 200
)
returns setof public.error_reports
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_uid uuid := public.current_user_id();
  v_limit int := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  -- Ferramenta interna: exige permissão de ops:view
  perform public.require_permission_for_current_user('ops','view');

  return query
  select r.*
  from public.error_reports r
  where r.empresa_id = v_empresa
    and (p_from is null or r.created_at >= p_from)
    and (p_to is null or r.created_at <= p_to)
    and (p_statuses is null or array_length(p_statuses, 1) is null or r.status = any (p_statuses))
    and (
      p_only_mine is false
      or v_uid is null
      or r.created_by = v_uid
    )
    and (
      p_q is null
      or btrim(p_q) = ''
      or r.user_message ilike '%'||p_q||'%'
      or coalesce(r.user_email,'') ilike '%'||p_q||'%'
      or coalesce(r.sentry_event_id,'') ilike '%'||p_q||'%'
      or coalesce(r.github_issue_url,'') ilike '%'||p_q||'%'
    )
  order by r.created_at desc
  limit v_limit;
end;
$$;

revoke all on function public.ops_error_reports_list(text, text[], timestamptz, timestamptz, boolean, integer) from public, anon;
grant execute on function public.ops_error_reports_list(text, text[], timestamptz, timestamptz, boolean, integer) to authenticated, service_role;

drop function if exists public.ops_error_reports_set_status(uuid, text);
create function public.ops_error_reports_set_status(
  p_id uuid,
  p_status text
)
returns public.error_reports
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = on
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_row public.error_reports;
begin
  perform public.require_permission_for_current_user('ops','manage');

  update public.error_reports
  set status = p_status
  where id = p_id
    and empresa_id = v_empresa
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Registro não encontrado.';
  end if;

  return v_row;
end;
$$;

revoke all on function public.ops_error_reports_set_status(uuid, text) from public, anon;
grant execute on function public.ops_error_reports_set_status(uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Hardening: revogar acesso PostgREST direto onde já migramos para RPC-first
-- -----------------------------------------------------------------------------

revoke all on table public.error_reports from public, anon, authenticated;
grant select, insert, update, delete on table public.error_reports to service_role;

-- vendas_pedidos: o app agora usa RPCs para os pontos que ainda acessavam via PostgREST.
revoke all on table public.vendas_pedidos from public, anon, authenticated;
grant select, insert, update, delete on table public.vendas_pedidos to service_role;

select pg_notify('pgrst', 'reload schema');
commit;
