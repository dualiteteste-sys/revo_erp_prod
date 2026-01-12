/*
  Indústria/Recebimentos: lookup robusto de Material do Cliente + normalização de EAN

  Objetivos:
  - Permitir que o frontend encontre de forma eficiente o Material do Cliente correto
    (cliente_id + produto_id + codigo_cliente) sem precisar listar/paginar e filtrar no JS.
  - Evitar criar/usar codigo_cliente inválido quando o XML traz EAN textual como "SEM GTIN".
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) RPC: lookup de Material do Cliente (id)
-- -----------------------------------------------------------------------------

drop function if exists public.industria_materiais_cliente_find_id(uuid, uuid, text);
create or replace function public.industria_materiais_cliente_find_id(
  p_cliente_id uuid,
  p_produto_id uuid,
  p_codigo_cliente text default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_codigo text := nullif(btrim(p_codigo_cliente), '');
  v_id uuid;
begin
  perform public.assert_empresa_role_at_least('member');

  if v_empresa_id is null then
    raise exception '[IND][MATERIAL_CLIENTE] Nenhuma empresa ativa encontrada.' using errcode='42501';
  end if;
  if p_cliente_id is null then
    raise exception '[IND][MATERIAL_CLIENTE] p_cliente_id é obrigatório.' using errcode='P0001';
  end if;
  if p_produto_id is null then
    raise exception '[IND][MATERIAL_CLIENTE] p_produto_id é obrigatório.' using errcode='P0001';
  end if;

  if v_codigo is not null then
    if upper(v_codigo) in ('SEM GTIN', 'SEMGTIN', 'SEM GTIN ') then
      v_codigo := null;
    end if;
  end if;

  if v_codigo is not null then
    select mc.id
      into v_id
      from public.industria_materiais_cliente mc
     where mc.empresa_id = v_empresa_id
       and mc.cliente_id = p_cliente_id
       and mc.produto_id = p_produto_id
       and mc.codigo_cliente is not distinct from v_codigo
     limit 1;
  end if;

  if v_id is null then
    select mc.id
      into v_id
      from public.industria_materiais_cliente mc
     where mc.empresa_id = v_empresa_id
       and mc.cliente_id = p_cliente_id
       and mc.produto_id = p_produto_id
     order by
       (mc.codigo_cliente is not null) desc,
       mc.updated_at desc nulls last,
       mc.created_at desc nulls last
     limit 1;
  end if;

  return v_id;
end;
$$;

revoke all on function public.industria_materiais_cliente_find_id(uuid, uuid, text) from public, anon;
grant execute on function public.industria_materiais_cliente_find_id(uuid, uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) Recebimento: evitar EAN inválido ("SEM GTIN") virar codigo_cliente
-- -----------------------------------------------------------------------------

create or replace function public.recebimento_sync_materiais_cliente(
  p_recebimento_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_import_id uuid;
  v_cliente_id uuid;
  v_chave text;
  v_numero text;
  v_serie text;
  v_upserted int := 0;
  v_linked int := 0;
begin
  if to_regclass('public.industria_materiais_cliente') is null then
    return jsonb_build_object('status','skipped','reason','industria_materiais_cliente_missing');
  end if;

  select
    r.fiscal_nfe_import_id,
    r.cliente_id,
    n.chave_acesso,
    n.numero,
    n.serie
  into
    v_import_id,
    v_cliente_id,
    v_chave,
    v_numero,
    v_serie
  from public.recebimentos r
  join public.fiscal_nfe_imports n on n.id = r.fiscal_nfe_import_id
  where r.id = p_recebimento_id
    and r.empresa_id = v_emp
  limit 1;

  if v_import_id is null then
    raise exception 'Recebimento não encontrado.';
  end if;

  if v_cliente_id is null then
    return jsonb_build_object('status','skipped','reason','cliente_not_set');
  end if;

  with src as (
    select distinct
      v_emp::uuid as empresa_id,
      v_cliente_id::uuid as cliente_id,
      ri.produto_id,
      left(
        coalesce(
          nullif(btrim(fi.cprod),''),
          nullif(
            case
              when fi.ean is null then null
              when nullif(btrim(fi.ean),'') is null then null
              when upper(btrim(fi.ean)) in ('SEM GTIN','SEMGTIN','NAO INFORMADO','N/A') then null
              when regexp_replace(fi.ean, '[^0-9]', '', 'g') = '' then null
              else btrim(fi.ean)
            end,
            ''
          ),
          'IMPORT-'||left(v_import_id::text,8)||'-'||coalesce(fi.n_item::text,'0')
        ),
        120
      ) as codigo_cliente,
      nullif(fi.xprod,'') as nome_cliente,
      nullif(fi.ucom,'') as unidade,
      left(
        'Classificado como Material do Cliente a partir da NF-e '||
        coalesce(nullif(v_numero,''),'?')||'/'||coalesce(nullif(v_serie,''),'?')||
        ' chave='||coalesce(nullif(v_chave,''),'?'),
        250
      ) as observacoes
    from public.recebimento_itens ri
    join public.fiscal_nfe_import_items fi
      on fi.id = ri.fiscal_nfe_item_id
     and fi.empresa_id = v_emp
    where ri.recebimento_id = p_recebimento_id
      and ri.empresa_id = v_emp
      and ri.produto_id is not null
  ),
  prev as (
    select
      s.*,
      mc.ativo as prev_ativo
    from src s
    left join public.industria_materiais_cliente mc
      on mc.empresa_id = s.empresa_id
     and mc.cliente_id = s.cliente_id
     and mc.produto_id = s.produto_id
     and mc.codigo_cliente is not distinct from s.codigo_cliente
  ),
  upserted as (
    insert into public.industria_materiais_cliente (
      empresa_id,
      cliente_id,
      produto_id,
      codigo_cliente,
      nome_cliente,
      unidade,
      ativo,
      observacoes
    )
    select
      empresa_id,
      cliente_id,
      produto_id,
      codigo_cliente,
      nome_cliente,
      unidade,
      true,
      observacoes
    from prev
    on conflict (empresa_id, cliente_id, produto_id, codigo_cliente)
    do update set
      nome_cliente = coalesce(excluded.nome_cliente, public.industria_materiais_cliente.nome_cliente),
      unidade      = coalesce(excluded.unidade, public.industria_materiais_cliente.unidade),
      ativo        = true,
      updated_at   = now()
    returning
      id as material_cliente_id,
      empresa_id,
      cliente_id,
      produto_id,
      codigo_cliente,
      (xmax = 0) as inserted
  ),
  links as (
    insert into public.recebimento_materiais_cliente_links (
      empresa_id,
      recebimento_id,
      material_cliente_id,
      inserted,
      prev_ativo
    )
    select
      u.empresa_id,
      p_recebimento_id,
      u.material_cliente_id,
      u.inserted,
      p.prev_ativo
    from upserted u
    left join prev p
      on p.empresa_id = u.empresa_id
     and p.cliente_id = u.cliente_id
     and p.produto_id = u.produto_id
     and p.codigo_cliente is not distinct from u.codigo_cliente
    where to_regclass('public.recebimento_materiais_cliente_links') is not null
    on conflict (empresa_id, recebimento_id, material_cliente_id) do nothing
    returning 1
  )
  select
    (select count(*) from upserted),
    (select count(*) from links)
  into v_upserted, v_linked;

  return jsonb_build_object(
    'status','ok',
    'cliente_id',v_cliente_id,
    'upserted',coalesce(v_upserted,0),
    'linked',coalesce(v_linked,0)
  );
end;
$$;

revoke all on function public.recebimento_sync_materiais_cliente(uuid) from public;
grant execute on function public.recebimento_sync_materiais_cliente(uuid) to authenticated, service_role;

commit;
