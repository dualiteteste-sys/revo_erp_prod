-- Verificação (Estado da Arte): domínio Financeiro RPC-first
-- Objetivo:
-- 1) Garantir que tabelas financeiras não tenham grants diretos para `authenticated`/`anon`.
-- 2) Evitar regressões onde o frontend volta a depender de `supabase.from('financeiro_*')`.

do $$
declare
  v_bad text;
  v_bad_rpcs text;
begin
  select string_agg(format('%I.%I (%s)', table_schema, table_name, privilege_type), E'\n' order by table_name, privilege_type)
  into v_bad
	  from information_schema.role_table_grants
	  where table_schema = 'public'
	    and grantee in ('authenticated', 'anon')
	    and (
	      table_name like 'financeiro_%'
	      or table_name like 'finance_%'
	      or table_name like 'finops_%'
	      -- Financeiro (piloto) também inclui tabelas históricas fora do prefixo.
	      or table_name in ('contas_a_receber')
	    );

  if v_bad is not null then
    raise exception using
      message = 'RPC-first (financeiro) falhou: grants diretos ainda existem para authenticated/anon.',
      detail = v_bad;
  end if;

  -- -----------------------------------------------------------------------------
  -- Hardening: funções SECURITY DEFINER expostas ao app devem:
  -- - Filtrar por tenant (current_empresa_id)
  -- - Validar permissão (require_permission_for_current_user / has_permission_for_current_user)
  -- - Fixar search_path (pg_catalog, public)
  --
  -- Isso reduz risco de vazamento e regressões que viram 403/400 intermitentes.
  -- -----------------------------------------------------------------------------
  with exposed as (
    select
      p.oid,
      p.proname,
      pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname like 'financeiro_%'
      and exists (
        select 1
        from information_schema.role_routine_grants g
        where g.routine_schema = 'public'
          and g.routine_name = p.proname
          and g.grantee = 'authenticated'
          and g.privilege_type = 'EXECUTE'
      )
  ),
  bad as (
    select
      proname,
      case
        when def not ilike '%current_empresa_id%' then 'missing current_empresa_id'
        when def not ilike '%require_permission_for_current_user%' and def not ilike '%has_permission_for_current_user%' and def not ilike '%has_permission(%' then 'missing permission guard'
        when def not ilike '%set search_path%pg_catalog%public%' then 'missing fixed search_path'
        else null
      end as reason
    from exposed
  )
  select string_agg(format('%s (%s)', proname, reason), E'\n' order by proname)
  into v_bad_rpcs
  from bad
  where reason is not null;

  if v_bad_rpcs is not null then
    raise exception using
      message = 'RPC-first (financeiro) hardening falhou: SECURITY DEFINER expostas sem tenant/guard/search_path.',
      detail = v_bad_rpcs;
  end if;
end $$;
