-- Snapshot determinístico do schema `public` (para comparar DEV/VERIFY/PROD).
-- Evita pg_dump (que falha quando a versão do servidor é maior que a do cliente).
--
-- Saída: linhas de texto ordenadas, adequadas para `diff`.

-- Extensões relevantes
select format('EXTENSION|%s|%s', e.extname, e.extversion)
from pg_extension e
order by 1;

-- Tipos ENUM
select format('ENUM|%s|%s', t.typname, e.enumlabel)
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
order by 1;

-- Tabelas e colunas (inclui tabelas partitioned)
select format(
  'COLUMN|%s|%s|%s|%s|%s|default=%s',
  n.nspname,
  c.relname,
  a.attnum,
  a.attname,
  pg_catalog.format_type(a.atttypid, a.atttypmod),
  coalesce(pg_get_expr(ad.adbin, ad.adrelid), 'null')
)
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
where n.nspname = 'public'
  and c.relkind in ('r','p')
  and a.attnum > 0
  and not a.attisdropped
order by 1;

-- Constraints (PK/FK/UNIQUE/CHECK)
select format(
  'CONSTRAINT|%s|%s|%s|%s',
  n.nspname,
  c.relname,
  con.conname,
  replace(pg_get_constraintdef(con.oid, true), E'\n', ' ')
)
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
order by 1;

-- Índices
select format(
  'INDEX|%s|%s|%s',
  schemaname,
  tablename,
  replace(indexdef, E'\n', ' ')
)
from pg_indexes
where schemaname = 'public'
order by 1;

-- Policies de RLS
select format(
  'POLICY|%s|%s|%s|cmd=%s|roles=%s|using=%s|check=%s',
  schemaname,
  tablename,
  policyname,
  cmd,
  coalesce(array_to_string(roles, ','), ''),
  coalesce(replace(qual, E'\n', ' '), ''),
  coalesce(replace(with_check, E'\n', ' '), '')
)
from pg_policies
where schemaname = 'public'
order by 1;

-- Triggers (exceto internos)
select format(
  'TRIGGER|%s|%s|%s',
  n.nspname,
  c.relname,
  replace(pg_get_triggerdef(t.oid, true), E'\n', ' ')
)
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
order by 1;

-- Views e materialized views
select format(
  'VIEW|%s|%s|%s',
  n.nspname,
  c.relname,
  replace(pg_get_viewdef(c.oid, true), E'\n', ' ')
)
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('v','m')
order by 1;

-- Funções no schema public (definição completa)
select format('FUNCTION|%s', p.oid::regprocedure);
select pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.oid::regprocedure::text;

