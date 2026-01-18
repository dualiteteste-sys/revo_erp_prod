-- Verificação (Estado da Arte): domínio Financeiro RPC-first
-- Objetivo:
-- 1) Garantir que tabelas financeiras não tenham grants diretos para `authenticated`/`anon`.
-- 2) Evitar regressões onde o frontend volta a depender de `supabase.from('financeiro_*')`.

do $$
declare
  v_bad text;
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
    );

  if v_bad is not null then
    raise exception using
      message = 'RPC-first (financeiro) falhou: grants diretos ainda existem para authenticated/anon.',
      detail = v_bad;
  end if;
end $$;

