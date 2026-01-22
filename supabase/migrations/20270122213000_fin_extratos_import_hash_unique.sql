-- Fix 42P10 on financeiro_extratos_bancarios_importar:
-- ON CONFLICT (empresa_id, conta_corrente_id, hash_importacao) WHERE ... requires a matching UNIQUE index.

begin;

-- 1) Remove duplicates that would block creating the UNIQUE index (keep oldest row per key).
with ranked as (
  select
    id,
    row_number() over (
      partition by empresa_id, conta_corrente_id, hash_importacao
      order by created_at asc, id asc
    ) as rn
  from public.financeiro_extratos_bancarios
  where hash_importacao is not null
    and btrim(hash_importacao) <> ''
)
delete from public.financeiro_extratos_bancarios e
using ranked r
where e.id = r.id
  and r.rn > 1;

-- 2) Create partial UNIQUE index to support the conflict target.
create unique index if not exists financeiro_extratos_bancarios_import_hash_uniq
  on public.financeiro_extratos_bancarios (empresa_id, conta_corrente_id, hash_importacao)
  where hash_importacao is not null and btrim(hash_importacao) <> '';

commit;

notify pgrst, 'reload schema';

