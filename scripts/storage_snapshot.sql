-- Snapshot determinístico do schema `storage` (para comparar DEV/VERIFY/PROD).
-- Inclui:
-- - presença do schema/tabelas
-- - buckets (id + public)
-- - policies em storage.objects (RLS)
--
-- Saída: linhas de texto ordenadas, adequadas para `diff`.

-- Se o Storage não estiver habilitado no projeto, registramos isso explicitamente.
select 'STORAGE|SCHEMA_MISSING'
where to_regclass('storage.buckets') is null
  and to_regclass('storage.objects') is null;

-- Buckets (config é "data", então precisamos snapshotar também)
select format('BUCKET|%s|public=%s', b.id, b.public)
from storage.buckets b
order by 1;

-- Policies (normaliza espaços para diff estável)
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
where schemaname = 'storage'
  and tablename = 'objects'
order by 1;

