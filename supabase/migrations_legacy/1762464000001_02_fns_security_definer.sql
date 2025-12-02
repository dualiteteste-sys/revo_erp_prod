-- =============================================================================
-- Migration: Alinhar Funções Críticas com SECURITY DEFINER
-- Descrição: Altera funções de contexto e de listagem de logs para usar
--            SECURITY DEFINER e um search_path fixo, garantindo consistência
--            e segurança na execução, independentemente do chamador.
-- Impacto:
--   - Segurança: Médio. Padroniza a execução das funções.
--   - Reversibilidade: Sim, revertendo para SECURITY INVOKER se necessário.
-- =============================================================================

-- current_user_id()
create or replace function public.current_user_id()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_sub_text     text;
  v_claims_text  text;
  v_sub_uuid     uuid;
begin
  begin
    v_sub_text := nullif(current_setting('request.jwt.claim.sub', true), '');
  exception when others then
    v_sub_text := null;
  end;

  if v_sub_text is not null then
    begin
      v_sub_uuid := v_sub_text::uuid;
      return v_sub_uuid;
    exception when others then
      v_sub_uuid := null;
    end;
  end if;

  begin
    v_claims_text := nullif(current_setting('request.jwt.claims', true), '');
  exception when others then
    v_claims_text := null;
  end;

  if v_claims_text is not null then
    begin
      return ((v_claims_text::json ->> 'sub')::uuid);
    exception when others then
      return null;
    end;
  end if;

  return null;
end
$$;

revoke all on function public.current_user_id() from public;
grant execute on function public.current_user_id() to authenticated, service_role;

-- current_empresa_id()
create or replace function public.current_empresa_id()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := public.current_user_id();
  v_emp uuid;
begin
  if v_uid is null then
    return null;
  end if;

  select uae.empresa_id
    into v_emp
  from public.user_active_empresa uae
  where uae.user_id = v_uid
  order by uae.updated_at desc nulls last, uae.empresa_id
  limit 1;

  return v_emp;
end
$$;

revoke all on function public.current_empresa_id() from public;
grant execute on function public.current_empresa_id() to authenticated, service_role;

-- audit.list_events_for_current_user (mantém assinatura/retorno SETOF)
create or replace function audit.list_events_for_current_user(
  p_from  timestamptz default (now() - interval '30 days'),
  p_to    timestamptz default now(),
  p_source text[] default null,
  p_table  text[] default null,
  p_op     text[] default null,
  p_q      text   default null,
  p_after  timestamptz default null,
  p_limit  int default 50
)
returns setof audit.events
language sql
security definer
set search_path = pg_catalog, public
as $$
  select *
  from audit.events
  where occurred_at >= p_from and occurred_at <= p_to
    and (p_after is null or occurred_at < p_after)
    and (p_source is null or source = any(p_source))
    and (p_table  is null or table_name = any(p_table))
    and (p_op     is null or op = any(p_op))
    and (
      p_q is null or (
        coalesce(pk::text,'')||
        coalesce(row_old::text,'')||
        coalesce(row_new::text,'')||
        coalesce(diff::text,'')||
        coalesce(meta::text,'')
      ) ilike '%'||p_q||'%'
    )
  order by occurred_at desc
  limit greatest(coalesce(p_limit,50),1)
$$;

revoke all on function audit.list_events_for_current_user(timestamptz,timestamptz,text[],text[],text[],text,timestamptz,int) from public;
grant execute on function audit.list_events_for_current_user(timestamptz,timestamptz,text[],text[],text[],text,timestamptz,int) to authenticated, service_role;

-- public.list_events_for_current_user wrapper (mesma assinatura/retorno SETOF)
create or replace function public.list_events_for_current_user(
  p_from  timestamptz default (now() - interval '30 days'),
  p_to    timestamptz default now(),
  p_source text[] default null,
  p_table  text[] default null,
  p_op     text[] default null,
  p_q      text   default null,
  p_after  timestamptz default null,
  p_limit  int default 50
)
returns setof audit.events
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select *
  from audit.list_events_for_current_user(p_from, p_to, p_source, p_table, p_op, p_q, p_after, p_limit)
$$;

revoke all on function public.list_events_for_current_user(timestamptz,timestamptz,text[],text[],text[],text,timestamptz,int) from public;
grant execute on function public.list_events_for_current_user(timestamptz,timestamptz,text[],text[],text[],text,timestamptz,int) to authenticated, service_role;
