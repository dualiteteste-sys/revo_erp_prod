/*
  Media / Products (DEV parity)

  - public.produto_imagens.principal (UI usa para ordenar e marcar principal)
  - RPCs: delete_product_for_current_user, delete_product_image_db, set_principal_product_image
*/

BEGIN;

alter table public.produto_imagens
  add column if not exists principal boolean not null default false;

create index if not exists idx_produto_imagens_produto_principal
  on public.produto_imagens (produto_id, principal desc, "position");

-- Garante uma principal por produto (parcial; idempotente)
do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'ux_produto_imagens_principal_por_produto'
  ) then
    execute 'create unique index ux_produto_imagens_principal_por_produto on public.produto_imagens (produto_id) where principal';
  end if;
end$$;

-- Backfill: se não existir principal, marca a primeira imagem como principal
with first_img as (
  select distinct on (produto_id) id, produto_id
  from public.produto_imagens
  order by produto_id, "position" asc, created_at asc
),
has_principal as (
  select distinct produto_id
  from public.produto_imagens
  where principal = true
)
update public.produto_imagens pi
set principal = true
from first_img f
left join has_principal hp on hp.produto_id = f.produto_id
where pi.id = f.id
  and hp.produto_id is null;

create or replace function public.delete_product_for_current_user(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid;
begin
  select empresa_id into v_empresa_id from public.produtos where id = p_id;
  if not found then
    raise exception 'Produto não encontrado';
  end if;
  if not public.is_user_member_of(v_empresa_id) then
    raise exception 'Acesso negado. Usuário não pertence à empresa do produto.';
  end if;
  delete from public.produtos where id = p_id;
end;
$$;
revoke all on function public.delete_product_for_current_user(uuid) from public;
grant execute on function public.delete_product_for_current_user(uuid) to authenticated;

create or replace function public.delete_product_image_db(p_image_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid;
  v_produto_id uuid;
begin
  select empresa_id, produto_id
    into v_empresa_id, v_produto_id
  from public.produto_imagens
  where id = p_image_id;

  if not found then
    raise exception 'Imagem não encontrada';
  end if;

  if not public.is_user_member_of(v_empresa_id) then
    raise exception 'Acesso negado';
  end if;

  delete from public.produto_imagens
  where id = p_image_id;
end;
$$;
revoke all on function public.delete_product_image_db(uuid) from public;
grant execute on function public.delete_product_image_db(uuid) to authenticated;

create or replace function public.set_principal_product_image(
  p_produto_id uuid,
  p_imagem_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid;
begin
  select empresa_id into v_empresa_id
  from public.produtos
  where id = p_produto_id;

  if v_empresa_id is null then
    raise exception 'Produto com ID % não encontrado.', p_produto_id;
  end if;

  if not public.is_user_member_of(v_empresa_id) then
    raise exception 'O usuário não tem permissão para modificar este produto.';
  end if;

  if not exists (
    select 1
    from public.produto_imagens
    where id = p_imagem_id and produto_id = p_produto_id and empresa_id = v_empresa_id
  ) then
    raise exception 'Imagem com ID % não pertence ao produto %.', p_imagem_id, p_produto_id;
  end if;

  update public.produto_imagens
  set principal = false
  where produto_id = p_produto_id and empresa_id = v_empresa_id;

  update public.produto_imagens
  set principal = true
  where id = p_imagem_id and empresa_id = v_empresa_id;
end;
$$;
revoke all on function public.set_principal_product_image(uuid, uuid) from public;
grant execute on function public.set_principal_product_image(uuid, uuid) to authenticated;

select pg_notify('pgrst','reload schema');

COMMIT;

