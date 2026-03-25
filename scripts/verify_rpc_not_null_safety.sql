-- verify_rpc_not_null_safety.sql
-- Guard CI: detecta RPCs que atribuem (:=) casts de p_payload para numeric/int/boolean
-- sem COALESCE e sem check IS NULL — causa NOT NULL violation (23502) em runtime.
--
-- Escopo: atribuições (:=) no corpo da função.
--   - Se a variável é checada com IS NULL depois (campo obrigatório), é considerada segura.
--   - UPDATE SET e INSERT VALUES diretos NÃO são checados (padrão diferente).
--
-- Incidente: 25/03/2026, vendas_upsert_pedido, comissao_percent → 23502
--
-- Escape hatch: `-- notnull-safe` na linha da atribuição
--
-- Padrão seguro (campo opcional):
--   v_comissao numeric := coalesce((p_payload->>'comissao_percent')::numeric, 0);
--
-- Padrão seguro (campo obrigatório):
--   v_valor numeric := (p_payload->>'valor')::numeric;
--   IF v_valor IS NULL THEN RAISE EXCEPTION 'valor é obrigatório'; END IF;

do $$
declare
  v_bad text;
begin
  with payload_fns as (
    select
      p.proname,
      pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and exists (
        select 1
        from unnest(p.proargtypes) as t(oid)
        join pg_type typ on typ.oid = t.oid
        where typ.typname = 'jsonb'
      )
      and pg_get_functiondef(p.oid) ilike '%p_payload%'
  ),
  candidate_lines as (
    select
      proname,
      def,
      trim(line) as line,
      -- Extrair nome da variável (v_xxx)
      (regexp_match(line, E'(v_\\w+)'))[1] as varname
    from payload_fns,
    lateral unnest(string_to_array(def, E'\n')) as line
    where
      -- Atribuição com cast sem COALESCE
      line ~ E':='
      and line ~* E'p_payload.*::\\s*(numeric|int|integer|bigint|smallint|boolean|real|double\\s+precision)'
      and line !~* E'coalesce'
      -- Ignorar comentários e escape hatch
      and line !~* E'^\\s*--'
      and line !~* E'notnull-safe'
  ),
  actually_vulnerable as (
    select proname, line
    from candidate_lines
    where
      -- Sem check IS NULL no corpo da função = vulnerável
      varname is null
      or def !~* (varname || E'\\s+is\\s+null')
  )
  select string_agg(
    format('  %s → %s', proname, line),
    E'\n' order by proname
  )
  into v_bad
  from actually_vulnerable;

  if v_bad is not null then
    raise exception using
      message = format(
        E'RPC NOT NULL safety: atribuições com p_payload cast sem COALESCE nem IS NULL check (risco de 23502).\n\n%s',
        v_bad
      ),
      hint = E'Fix: COALESCE((p_payload->>''field'')::numeric, 0)\nOu: IF v_xxx IS NULL THEN RAISE EXCEPTION ... END IF;\nOu: adicione "-- notnull-safe" se validado de outra forma.';
  end if;

  raise notice 'verify_rpc_not_null_safety: OK';
end $$;
