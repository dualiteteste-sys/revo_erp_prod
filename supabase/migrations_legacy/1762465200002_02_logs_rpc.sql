-- =========================================================================
-- RPC de auditoria: SD + search_path; mantém assinatura e retorno SETOF
-- Paginação por keyset (p_after) com limite mínimo 1 (default 50)
-- =========================================================================

-- Função no schema audit (fonte de dados)
create or replace function audit.list_events_for_current_user(
  p_from   timestamptz default (now() - interval '30 days'),
  p_to     timestamptz default now(),
  p_source text[]      default null,
  p_table  text[]      default null,
  p_op     text[]      default null,
  p_q      text        default null,
  p_after  timestamptz default null,
  p_limit  int         default 50
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

-- Wrapper público (mesma assinatura) — conveniente para PostgREST
create or replace function public.list_events_for_current_user(
  p_from   timestamptz default (now() - interval '30 days'),
  p_to     timestamptz default now(),
  p_source text[]      default null,
  p_table  text[]      default null,
  p_op     text[]      default null,
  p_q      text        default null,
  p_after  timestamptz default null,
  p_limit  int         default 50
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
