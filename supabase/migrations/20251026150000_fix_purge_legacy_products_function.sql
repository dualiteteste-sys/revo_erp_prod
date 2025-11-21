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
  -- Autorização: requer membresia na empresa
  if not public.is_user_member_of(p_empresa_id) then
    raise exception '[AUTH] usuário não é membro da empresa alvo' using errcode = '42501';
  end if;

  -- Quantidade que será/seria afetada
  select count(*)::bigint into v_cnt
  from public.products p
  where p.empresa_id = p_empresa_id;

  -- Dry-run: só reporta
  if p_dry_run then
    return query
      select p_empresa_id, v_cnt, 0::bigint, true;
    return; -- <- em vez de EXIT
  end if;

  -- Arquiva primeiro (idempotente por PK no archive)
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

  -- Purge dos legados (somente da empresa alvo)
  delete from public.products p
  where p.empresa_id = p_empresa_id;

  return query
    select p_empresa_id,
           v_cnt as to_archive_count,
           v_cnt as purged_count,
           false as dry_run;
end;
$$;
