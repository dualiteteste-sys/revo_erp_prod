-- [1] Tabela de arquivo dos produtos legados
create table if not exists public.products_legacy_archive (
  id           uuid            not null,
  empresa_id   uuid            not null,
  name         text            not null,
  sku          text,
  price_cents  integer         not null,
  unit         text            not null,
  active       boolean         not null,
  created_at   timestamptz     not null,
  updated_at   timestamptz     not null,

  -- Metadados de arquivamento
  deleted_at   timestamptz     not null default now(),
  deleted_by   uuid,                 -- auth.uid() que executou
  note         text,

  primary key (id)
);

-- Índices úteis
create index if not exists idx_products_legacy_archive_emp
  on public.products_legacy_archive (empresa_id);
create index if not exists idx_products_legacy_archive_deleted_at
  on public.products_legacy_archive (deleted_at);

-- RLS na tabela de arquivo (somente leitura por membros da empresa)
alter table public.products_legacy_archive enable row level security;

drop policy if exists products_legacy_archive_sel on public.products_legacy_archive;
create policy products_legacy_archive_sel on public.products_legacy_archive
  for select using (public.is_user_member_of(empresa_id));

-- [2] RPC: Dry-run / Purge definitivo dos produtos legados por empresa
create or replace function public.purge_legacy_products(
  p_empresa_id uuid,
  p_dry_run boolean default true,
  p_note text default '[RPC][PURGE_LEGACY] limpeza de produtos legados'
)
returns table(
  empresa_id uuid,
  to_archive_count bigint,
  purged_count bigint,
  dry_run boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_cnt bigint;
begin
  -- Autorização: usuário precisa ser membro da empresa
  if not public.is_user_member_of(p_empresa_id) then
    raise exception '[AUTH] usuário não é membro da empresa alvo' using errcode = '42501';
  end if;

  -- Quantidade que seria/será afetada
  select count(*) into v_cnt
  from public.products p
  where p.empresa_id = p_empresa_id;

  if p_dry_run then
    return query
    select p_empresa_id, v_cnt, 0::bigint, true;
    exit;
  end if;

  -- Arquiva primeiro (idempotente por PK na archive)
  insert into public.products_legacy_archive (
    id, empresa_id, name, sku, price_cents, unit, active, created_at, updated_at,
    deleted_at, deleted_by, note
  )
  select
    p.id, p.empresa_id, p.name, p.sku, p.price_cents, p.unit, p.active, p.created_at, p.updated_at,
    now(), v_uid, p_note
  from public.products p
  where p.empresa_id = p_empresa_id
  on conflict (id) do nothing;

  -- Apaga do legado (somente da empresa alvo)
  delete from public.products p
  where p.empresa_id = p_empresa_id;

  return query
  select p_empresa_id,
         v_cnt as to_archive_count,
         v_cnt as purged_count,
         false as dry_run;
end;
$$;

-- [3] RPC: Restore a partir do arquivo (reversibilidade)
create or replace function public.restore_legacy_products(
  p_empresa_id uuid,
  p_max_rows int default null  -- opcional: limitar restauração
)
returns table(
  empresa_id uuid,
  restored_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_restored bigint;
begin
  if not public.is_user_member_of(p_empresa_id) then
    raise exception '[AUTH] usuário não é membro da empresa alvo' using errcode = '42501';
  end if;

  with src as (
    select *
    from public.products_legacy_archive a
    where a.empresa_id = p_empresa_id
    order by a.deleted_at desc
    limit coalesce(p_max_rows, 2147483647)
  ),
  ins as (
    insert into public.products as t (
      id, empresa_id, name, sku, price_cents, unit, active, created_at, updated_at
    )
    select
      s.id, s.empresa_id, s.name, s.sku, s.price_cents, s.unit, s.active, s.created_at, s.updated_at
    from src s
    on conflict (id) do nothing
    returning 1
  ),
  del as (
    delete from public.products_legacy_archive a
    using src s
    where a.id = s.id
      and a.empresa_id = s.empresa_id
    returning 1
  )
  select count(*)::bigint into v_restored from ins;

  return query
  select p_empresa_id, v_restored;
end;
$$;
