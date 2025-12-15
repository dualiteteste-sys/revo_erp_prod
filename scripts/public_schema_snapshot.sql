-- Snapshot determinístico do schema `public` (para comparar DEV/VERIFY/PROD).
-- Evita pg_dump (que falha quando a versão do servidor é maior que a do cliente).
--
-- Saída: linhas de texto ordenadas, adequadas para `diff`.

-- Extensões (apenas nome; versões podem variar entre projetos)
select format('EXTENSION|%s', e.extname)
from pg_extension e
order by 1;

-- Tipos ENUM
select format('ENUM|%s|%s', t.typname, e.enumlabel)
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
order by 1;

-- Tabelas e colunas
-- Observação: não inclui posição (attnum) nem default, pois isso varia bastante entre bases antigas,
-- mas não costuma causar erros de runtime (o foco é garantir presença/forma da coluna).
select format(
  'COLUMN|%s|%s|%s|%s',
  n.nspname,
  c.relname,
  a.attname,
  pg_catalog.format_type(a.atttypid, a.atttypmod)
)
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
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
  regexp_replace(pg_get_constraintdef(con.oid, true), E'\\s+', ' ', 'g')
)
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
order by 1;

-- Índices (opcional): não comparar por padrão para evitar ruído em bases antigas.
-- Se quiser reativar, descomente este bloco.
-- select format('INDEX|%s|%s|%s', schemaname, tablename, regexp_replace(indexdef, E'\\s+', ' ', 'g'))
-- from pg_indexes
-- where schemaname = 'public'
-- order by 1;

-- Policies de RLS
select format(
  'POLICY|%s|%s|%s|cmd=%s|roles=%s|using=%s|check=%s',
  schemaname,
  tablename,
  policyname,
  cmd,
  coalesce(array_to_string(roles, ','), ''),
  coalesce(regexp_replace(qual, E'\\s+', ' ', 'g'), ''),
  coalesce(regexp_replace(with_check, E'\\s+', ' ', 'g'), '')
)
from pg_policies
where schemaname = 'public'
order by 1;

-- Triggers (exceto internos)
select format(
  'TRIGGER|%s|%s|%s',
  n.nspname,
  c.relname,
  regexp_replace(pg_get_triggerdef(t.oid, true), E'\\s+', ' ', 'g')
)
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
order by 1;

-- Views e materialized views (apenas presença; definição pode variar por versão do Postgres)
select format(
  'VIEW|%s|%s|%s',
  n.nspname,
  c.relname,
  c.relkind
)
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('v','m')
order by 1;

-- Funções no schema public (apenas assinatura; definição varia por versão/formatador)
select format('FUNCTION|%s', p.oid::regprocedure)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.oid::regprocedure::text;
