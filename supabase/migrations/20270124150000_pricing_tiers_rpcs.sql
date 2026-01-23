-- RPCs para gerenciar faixas (tiered pricing) por tabela/produto.

begin;

create or replace function public.tabelas_preco_faixas_list_for_current_user(
  p_produto_id uuid,
  p_tabela_preco_id uuid
)
returns table(
  id uuid,
  min_qtd numeric,
  max_qtd numeric,
  preco_unitario numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  if p_produto_id is null then
    raise exception 'p_produto_id é obrigatório.';
  end if;
  if p_tabela_preco_id is null then
    raise exception 'p_tabela_preco_id é obrigatório.';
  end if;

  return query
  select f.id, f.min_qtd, f.max_qtd, f.preco_unitario, f.created_at, f.updated_at
  from public.tabelas_preco_faixas f
  where f.empresa_id = v_empresa
    and f.produto_id = p_produto_id
    and f.tabela_preco_id = p_tabela_preco_id
  order by f.min_qtd asc;
end;
$$;

create or replace function public.tabelas_preco_faixas_upsert_for_current_user(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_tp uuid := (p_payload->>'tabela_preco_id')::uuid;
  v_prod uuid := (p_payload->>'produto_id')::uuid;
  v_min numeric := (p_payload->>'min_qtd')::numeric;
  v_max numeric := nullif(p_payload->>'max_qtd','')::numeric;
  v_preco numeric := (p_payload->>'preco_unitario')::numeric;
begin
  if v_tp is null or v_prod is null then
    raise exception 'tabela_preco_id e produto_id são obrigatórios.';
  end if;
  if v_min is null or v_min <= 0 then
    raise exception 'min_qtd deve ser > 0.';
  end if;
  if v_max is not null and v_max < v_min then
    raise exception 'max_qtd deve ser >= min_qtd.';
  end if;
  if v_preco is null or v_preco < 0 then
    raise exception 'preco_unitario deve ser >= 0.';
  end if;

  if not exists (select 1 from public.tabelas_preco t where t.id=v_tp and t.empresa_id=v_empresa) then
    raise exception 'Tabela de preço não encontrada.';
  end if;
  if not exists (select 1 from public.produtos p where p.id=v_prod and p.empresa_id=v_empresa) then
    raise exception 'Produto não encontrado.';
  end if;

  if v_id is not null then
    update public.tabelas_preco_faixas f
    set
      min_qtd = v_min,
      max_qtd = v_max,
      preco_unitario = v_preco,
      updated_at = now()
    where f.id = v_id
      and f.empresa_id = v_empresa
    returning f.id into v_id;
  else
    insert into public.tabelas_preco_faixas (
      empresa_id,
      tabela_preco_id,
      produto_id,
      min_qtd,
      max_qtd,
      preco_unitario
    ) values (
      v_empresa,
      v_tp,
      v_prod,
      v_min,
      v_max,
      v_preco
    )
    on conflict (empresa_id, tabela_preco_id, produto_id, min_qtd)
    do update set
      max_qtd = excluded.max_qtd,
      preco_unitario = excluded.preco_unitario,
      updated_at = now()
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.tabelas_preco_faixas_delete_for_current_user(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  if p_id is null then
    raise exception 'p_id é obrigatório.';
  end if;

  delete from public.tabelas_preco_faixas f
  where f.id = p_id
    and f.empresa_id = v_empresa;
end;
$$;

commit;

