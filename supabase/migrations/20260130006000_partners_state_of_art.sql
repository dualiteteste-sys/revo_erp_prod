/*
  Partners (Clientes/Fornecedores) - Estado da Arte (foundation)

  Goals:
  - Ensure people related tables exist (pessoa_enderecos, pessoa_contatos) for the Partner form
  - Ensure "soft delete" works (deleted_at) to avoid FK errors when a partner is referenced elsewhere
  - Provide deterministic RPCs for list/count/details/upsert/delete/search with tenant isolation
  - Keep legacy RPC names working (list_partners/count_partners/create_update_partner/delete_partner/get_partner_details/search_clients_for_current_user)
  - Add v2 RPCs (list_partners_v2/count_partners_v2) with status filter + safe ordering
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Schema alignment for public.pessoas (add missing columns used by UI)
-- -----------------------------------------------------------------------------
alter table public.pessoas add column if not exists celular text;
alter table public.pessoas add column if not exists site text;
alter table public.pessoas add column if not exists limite_credito numeric;
alter table public.pessoas add column if not exists condicao_pagamento text;
alter table public.pessoas add column if not exists informacoes_bancarias text;

-- Optional search vector (not required by UI, but useful for fast search).
-- Some older environments may already have "pessoa_search" as TEXT; in that case,
-- we keep it as-is and avoid creating a GIN index that would fail.
do $$
declare
  v_udt_name text;
begin
  select c.udt_name
    into v_udt_name
    from information_schema.columns c
   where c.table_schema='public' and c.table_name='pessoas' and c.column_name='pessoa_search';

  if v_udt_name is null then
    execute $sql$
      alter table public.pessoas
        add column pessoa_search tsvector
        generated always as (
          to_tsvector(
            'portuguese',
            coalesce(nome,'') || ' ' ||
            coalesce(fantasia,'') || ' ' ||
            coalesce(doc_unico,'') || ' ' ||
            coalesce(email,'') || ' ' ||
            coalesce(telefone,'') || ' ' ||
            coalesce(celular,'') || ' ' ||
            coalesce(codigo_externo,'')
          )
        ) stored
    $sql$;
    v_udt_name := 'tsvector';
  end if;

  if v_udt_name = 'tsvector' then
    execute 'create index if not exists idx_pessoas_pessoa_search on public.pessoas using gin (pessoa_search)';
  end if;
end $$;

-- Unique doc constraint (non-null)
do $$
begin
  if to_regclass('public.ux_pessoas_empresa_id_doc_unico') is null
     and to_regclass('public.idx_pessoas_empresa_id_doc_unico_not_null') is null
  then
    execute 'create unique index ux_pessoas_empresa_id_doc_unico on public.pessoas (empresa_id, doc_unico) where doc_unico is not null';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2) Related tables: enderecos/contatos
-- -----------------------------------------------------------------------------
create table if not exists public.pessoa_enderecos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  tipo_endereco text default 'PRINCIPAL',
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  cep text,
  pais text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pessoa_enderecos_empresa_pessoa on public.pessoa_enderecos (empresa_id, pessoa_id);

drop trigger if exists tg_pessoa_enderecos_updated_at on public.pessoa_enderecos;
create trigger tg_pessoa_enderecos_updated_at
  before update on public.pessoa_enderecos
  for each row execute function public.tg_set_updated_at();

alter table public.pessoa_enderecos enable row level security;

drop policy if exists pessoa_enderecos_sel on public.pessoa_enderecos;
create policy pessoa_enderecos_sel
  on public.pessoa_enderecos
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists pessoa_enderecos_ins on public.pessoa_enderecos;
create policy pessoa_enderecos_ins
  on public.pessoa_enderecos
  for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

drop policy if exists pessoa_enderecos_upd on public.pessoa_enderecos;
create policy pessoa_enderecos_upd
  on public.pessoa_enderecos
  for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists pessoa_enderecos_del on public.pessoa_enderecos;
create policy pessoa_enderecos_del
  on public.pessoa_enderecos
  for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

create table if not exists public.pessoa_contatos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  nome text,
  email text,
  telefone text,
  cargo text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pessoa_contatos_empresa_pessoa on public.pessoa_contatos (empresa_id, pessoa_id);

drop trigger if exists tg_pessoa_contatos_updated_at on public.pessoa_contatos;
create trigger tg_pessoa_contatos_updated_at
  before update on public.pessoa_contatos
  for each row execute function public.tg_set_updated_at();

alter table public.pessoa_contatos enable row level security;

drop policy if exists pessoa_contatos_sel on public.pessoa_contatos;
create policy pessoa_contatos_sel
  on public.pessoa_contatos
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists pessoa_contatos_ins on public.pessoa_contatos;
create policy pessoa_contatos_ins
  on public.pessoa_contatos
  for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

drop policy if exists pessoa_contatos_upd on public.pessoa_contatos;
create policy pessoa_contatos_upd
  on public.pessoa_contatos
  for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists pessoa_contatos_del on public.pessoa_contatos;
create policy pessoa_contatos_del
  on public.pessoa_contatos
  for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

-- Defense in depth: prevent cross-tenant links by trigger
create or replace function public.enforce_same_empresa_pessoa()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_pessoa_empresa uuid;
  v_row_empresa uuid;
begin
  select empresa_id
    into v_pessoa_empresa
    from public.pessoas
   where id = coalesce(new.pessoa_id, old.pessoa_id);

  v_row_empresa := coalesce(new.empresa_id, old.empresa_id);

  if v_pessoa_empresa is null then
    raise exception 'Pessoa inexistente.' using errcode = '23503';
  end if;

  if v_row_empresa is distinct from v_pessoa_empresa then
    raise exception 'empresa_id difere da empresa da pessoa.' using errcode = '23514';
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.enforce_same_empresa_pessoa() from public, anon;
grant execute on function public.enforce_same_empresa_pessoa() to authenticated, service_role;

drop trigger if exists tg_check_empresa_pessoa_enderecos on public.pessoa_enderecos;
create trigger tg_check_empresa_pessoa_enderecos
  before insert or update on public.pessoa_enderecos
  for each row execute function public.enforce_same_empresa_pessoa();

drop trigger if exists tg_check_empresa_pessoa_contatos on public.pessoa_contatos;
create trigger tg_check_empresa_pessoa_contatos
  before insert or update on public.pessoa_contatos
  for each row execute function public.enforce_same_empresa_pessoa();

-- -----------------------------------------------------------------------------
-- 3) RPCs (legacy + v2)
-- -----------------------------------------------------------------------------

-- When return types evolve, CREATE OR REPLACE cannot change them; drop first.
drop function if exists public.list_partners(integer, integer, text, public.pessoa_tipo, text);
drop function if exists public.count_partners(text, public.pessoa_tipo);
drop function if exists public.get_partner_details(uuid);
drop function if exists public.create_update_partner(jsonb);
drop function if exists public.delete_partner(uuid);
drop function if exists public.search_clients_for_current_user(text, int);
drop function if exists public.restore_partner(uuid);
drop function if exists public.list_partners_v2(text, public.pessoa_tipo, text, integer, integer, text, text);
drop function if exists public.count_partners_v2(text, public.pessoa_tipo, text);

-- Helper: normalize search
create or replace function public.partners_search_match(p_row public.pessoas, p_q text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  v_digits text;
begin
  if v_q is null then
    return true;
  end if;

  v_digits := regexp_replace(v_q, '\\D', '', 'g');

  return (
    p_row.nome ilike '%' || v_q || '%'
    or coalesce(p_row.fantasia,'') ilike '%' || v_q || '%'
    or coalesce(p_row.email,'') ilike '%' || v_q || '%'
    or coalesce(p_row.doc_unico,'') ilike '%' || v_digits || '%'
    or coalesce(p_row.telefone,'') ilike '%' || v_digits || '%'
    or coalesce(p_row.celular,'') ilike '%' || v_digits || '%'
  );
end;
$$;

revoke all on function public.partners_search_match(public.pessoas, text) from public, anon;
grant execute on function public.partners_search_match(public.pessoas, text) to authenticated, service_role;

-- Legacy list_partners (kept for backward compatibility)
create or replace function public.list_partners(
  p_limit  integer default 20,
  p_offset integer default 0,
  p_q      text    default null,
  p_tipo   public.pessoa_tipo default null,
  p_order  text    default 'created_at desc'
)
returns table (
  id uuid,
  nome text,
  tipo public.pessoa_tipo,
  doc_unico text,
  email text,
  telefone text,
  deleted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select p.id, p.nome, p.tipo, p.doc_unico, p.email, p.telefone, p.deleted_at, p.created_at, p.updated_at
  from public.pessoas p
  where p.empresa_id = public.current_empresa_id()
    and p.tipo in ('cliente'::public.pessoa_tipo, 'fornecedor'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo)
    and p.deleted_at is null
    and (
      p_tipo is null
      or (
        (p_tipo = 'cliente'::public.pessoa_tipo and p.tipo in ('cliente'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo))
        or (p_tipo = 'fornecedor'::public.pessoa_tipo and p.tipo in ('fornecedor'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo))
        or (p_tipo = 'ambos'::public.pessoa_tipo and p.tipo = 'ambos'::public.pessoa_tipo)
      )
    )
    and public.partners_search_match(p, p_q)
  order by
    case when lower(p_order) = 'nome asc'  then p.nome end asc nulls last,
    case when lower(p_order) = 'nome desc' then p.nome end desc nulls last,
    case when lower(p_order) = 'created_at asc'  then p.created_at end asc nulls last,
    case when lower(p_order) = 'created_at desc' then p.created_at end desc nulls last,
    p.created_at desc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

create or replace function public.count_partners(
  p_q    text default null,
  p_tipo public.pessoa_tipo default null
)
returns bigint
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select count(*)
  from public.pessoas p
  where p.empresa_id = public.current_empresa_id()
    and p.tipo in ('cliente'::public.pessoa_tipo, 'fornecedor'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo)
    and p.deleted_at is null
    and (
      p_tipo is null
      or (
        (p_tipo = 'cliente'::public.pessoa_tipo and p.tipo in ('cliente'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo))
        or (p_tipo = 'fornecedor'::public.pessoa_tipo and p.tipo in ('fornecedor'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo))
        or (p_tipo = 'ambos'::public.pessoa_tipo and p.tipo = 'ambos'::public.pessoa_tipo)
      )
    )
    and public.partners_search_match(p, p_q);
$$;

-- v2: list_partners_v2 / count_partners_v2
create or replace function public.list_partners_v2(
  p_search text default null,
  p_tipo public.pessoa_tipo default null,
  p_status text default 'active', -- active | inactive | all
  p_limit integer default 20,
  p_offset integer default 0,
  p_order_by text default 'nome',
  p_order_dir text default 'asc'
)
returns table (
  id uuid,
  nome text,
  tipo public.pessoa_tipo,
  doc_unico text,
  email text,
  telefone text,
  deleted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_order_by text := lower(coalesce(p_order_by, 'nome'));
  v_order_dir text := lower(coalesce(p_order_dir, 'asc'));
  v_status text := lower(coalesce(p_status, 'active'));
begin
  if v_order_by not in ('nome','created_at','updated_at','doc_unico') then
    v_order_by := 'nome';
  end if;
  if v_order_dir not in ('asc','desc') then
    v_order_dir := 'asc';
  end if;
  if v_status not in ('active','inactive','all') then
    v_status := 'active';
  end if;

  return query
  select p.id, p.nome, p.tipo, p.doc_unico, p.email, p.telefone, p.deleted_at, p.created_at, p.updated_at
  from public.pessoas p
  where p.empresa_id = public.current_empresa_id()
    and p.tipo in ('cliente'::public.pessoa_tipo, 'fornecedor'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo)
    and (
      v_status = 'all'
      or (v_status = 'active' and p.deleted_at is null)
      or (v_status = 'inactive' and p.deleted_at is not null)
    )
    and (
      p_tipo is null
      or (
        (p_tipo = 'cliente'::public.pessoa_tipo and p.tipo in ('cliente'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo))
        or (p_tipo = 'fornecedor'::public.pessoa_tipo and p.tipo in ('fornecedor'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo))
        or (p_tipo = 'ambos'::public.pessoa_tipo and p.tipo = 'ambos'::public.pessoa_tipo)
      )
    )
    and public.partners_search_match(p, p_search)
  order by
    case when v_order_by = 'nome' and v_order_dir = 'asc' then p.nome end asc nulls last,
    case when v_order_by = 'nome' and v_order_dir = 'desc' then p.nome end desc nulls last,
    case when v_order_by = 'created_at' and v_order_dir = 'asc' then p.created_at end asc nulls last,
    case when v_order_by = 'created_at' and v_order_dir = 'desc' then p.created_at end desc nulls last,
    case when v_order_by = 'updated_at' and v_order_dir = 'asc' then p.updated_at end asc nulls last,
    case when v_order_by = 'updated_at' and v_order_dir = 'desc' then p.updated_at end desc nulls last,
    case when v_order_by = 'doc_unico' and v_order_dir = 'asc' then p.doc_unico end asc nulls last,
    case when v_order_by = 'doc_unico' and v_order_dir = 'desc' then p.doc_unico end desc nulls last,
    p.created_at desc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
end;
$$;

create or replace function public.count_partners_v2(
  p_search text default null,
  p_tipo public.pessoa_tipo default null,
  p_status text default 'active'
)
returns bigint
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select count(*)
  from public.pessoas p
  where p.empresa_id = public.current_empresa_id()
    and p.tipo in ('cliente'::public.pessoa_tipo, 'fornecedor'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo)
    and (
      lower(coalesce(p_status,'active')) = 'all'
      or (lower(coalesce(p_status,'active')) = 'active' and p.deleted_at is null)
      or (lower(coalesce(p_status,'active')) = 'inactive' and p.deleted_at is not null)
    )
    and (
      p_tipo is null
      or (
        (p_tipo = 'cliente'::public.pessoa_tipo and p.tipo in ('cliente'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo))
        or (p_tipo = 'fornecedor'::public.pessoa_tipo and p.tipo in ('fornecedor'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo))
        or (p_tipo = 'ambos'::public.pessoa_tipo and p.tipo = 'ambos'::public.pessoa_tipo)
      )
    )
    and public.partners_search_match(p, p_search);
$$;

-- Details
create or replace function public.get_partner_details(p_id uuid)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select to_jsonb(p) || jsonb_build_object(
    'enderecos', coalesce((select jsonb_agg(e order by e.created_at asc) from public.pessoa_enderecos e where e.pessoa_id = p.id), '[]'::jsonb),
    'contatos', coalesce((select jsonb_agg(c order by c.created_at asc) from public.pessoa_contatos c where c.pessoa_id = p.id), '[]'::jsonb)
  )
  from public.pessoas p
  where p.id = p_id
    and p.empresa_id = public.current_empresa_id();
$$;

-- Upsert (transactional)
create or replace function public.create_update_partner(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_pessoa_id uuid;
  v_pessoa jsonb := coalesce(p_payload->'pessoa','{}'::jsonb);
  v_enderecos jsonb := p_payload->'enderecos';
  v_contatos jsonb := p_payload->'contatos';
  v_endereco jsonb;
  v_contato jsonb;
  v_endereco_ids uuid[] := '{}';
  v_contato_ids uuid[] := '{}';
begin
  if v_empresa_id is null then
    raise exception 'Nenhuma empresa ativa.' using errcode = '22000';
  end if;

  v_pessoa_id := nullif(v_pessoa->>'id','')::uuid;

  if v_pessoa_id is null then
    insert into public.pessoas (
      empresa_id, tipo, tipo_pessoa, nome, fantasia, doc_unico, email, telefone, celular, site,
      inscr_estadual, isento_ie, inscr_municipal, observacoes, codigo_externo, contribuinte_icms, contato_tags,
      limite_credito, condicao_pagamento, informacoes_bancarias, deleted_at
    ) values (
      v_empresa_id,
      coalesce(nullif(v_pessoa->>'tipo','')::public.pessoa_tipo, 'cliente'::public.pessoa_tipo),
      coalesce(nullif(v_pessoa->>'tipo_pessoa','')::public.tipo_pessoa_enum, 'juridica'::public.tipo_pessoa_enum),
      nullif(v_pessoa->>'nome',''),
      nullif(v_pessoa->>'fantasia',''),
      nullif(v_pessoa->>'doc_unico',''),
      nullif(v_pessoa->>'email',''),
      nullif(v_pessoa->>'telefone',''),
      nullif(v_pessoa->>'celular',''),
      nullif(v_pessoa->>'site',''),
      nullif(v_pessoa->>'inscr_estadual',''),
      coalesce(nullif(v_pessoa->>'isento_ie','')::boolean, false),
      nullif(v_pessoa->>'inscr_municipal',''),
      nullif(v_pessoa->>'observacoes',''),
      nullif(v_pessoa->>'codigo_externo',''),
      coalesce(nullif(v_pessoa->>'contribuinte_icms','')::public.contribuinte_icms_enum, '9'::public.contribuinte_icms_enum),
      case when jsonb_typeof(v_pessoa->'contato_tags') = 'array'
        then array(select jsonb_array_elements_text(v_pessoa->'contato_tags'))
        else null
      end,
      nullif(v_pessoa->>'limite_credito','')::numeric,
      nullif(v_pessoa->>'condicao_pagamento',''),
      nullif(v_pessoa->>'informacoes_bancarias',''),
      null
    ) returning id into v_pessoa_id;
  else
    update public.pessoas set
      tipo = coalesce(nullif(v_pessoa->>'tipo','')::public.pessoa_tipo, tipo),
      tipo_pessoa = coalesce(nullif(v_pessoa->>'tipo_pessoa','')::public.tipo_pessoa_enum, tipo_pessoa),
      nome = nullif(v_pessoa->>'nome',''),
      fantasia = nullif(v_pessoa->>'fantasia',''),
      doc_unico = nullif(v_pessoa->>'doc_unico',''),
      email = nullif(v_pessoa->>'email',''),
      telefone = nullif(v_pessoa->>'telefone',''),
      celular = nullif(v_pessoa->>'celular',''),
      site = nullif(v_pessoa->>'site',''),
      inscr_estadual = nullif(v_pessoa->>'inscr_estadual',''),
      isento_ie = coalesce(nullif(v_pessoa->>'isento_ie','')::boolean, false),
      inscr_municipal = nullif(v_pessoa->>'inscr_municipal',''),
      observacoes = nullif(v_pessoa->>'observacoes',''),
      codigo_externo = nullif(v_pessoa->>'codigo_externo',''),
      contribuinte_icms = coalesce(nullif(v_pessoa->>'contribuinte_icms','')::public.contribuinte_icms_enum, '9'::public.contribuinte_icms_enum),
      contato_tags = case when jsonb_typeof(v_pessoa->'contato_tags') = 'array'
        then array(select jsonb_array_elements_text(v_pessoa->'contato_tags'))
        else contato_tags
      end,
      limite_credito = nullif(v_pessoa->>'limite_credito','')::numeric,
      condicao_pagamento = nullif(v_pessoa->>'condicao_pagamento',''),
      informacoes_bancarias = nullif(v_pessoa->>'informacoes_bancarias',''),
      deleted_at = null
    where id = v_pessoa_id and empresa_id = v_empresa_id;

    if not found then
      raise exception 'Parceiro nao encontrado ou fora da empresa.' using errcode = '23503';
    end if;
  end if;

  -- Enderecos: replace set semantics only if payload is array
  if jsonb_typeof(v_enderecos) = 'array' then
    for v_endereco in select * from jsonb_array_elements(v_enderecos)
    loop
      if nullif(v_endereco->>'id','') is not null then
        update public.pessoa_enderecos set
          tipo_endereco = coalesce(nullif(v_endereco->>'tipo_endereco',''), tipo_endereco),
          logradouro = nullif(v_endereco->>'logradouro',''),
          numero = nullif(v_endereco->>'numero',''),
          complemento = nullif(v_endereco->>'complemento',''),
          bairro = nullif(v_endereco->>'bairro',''),
          cidade = nullif(v_endereco->>'cidade',''),
          uf = nullif(v_endereco->>'uf',''),
          cep = nullif(v_endereco->>'cep',''),
          pais = nullif(v_endereco->>'pais','')
        where id = (v_endereco->>'id')::uuid and pessoa_id = v_pessoa_id and empresa_id = v_empresa_id;
        v_endereco_ids := array_append(v_endereco_ids, (v_endereco->>'id')::uuid);
      else
        insert into public.pessoa_enderecos (
          empresa_id, pessoa_id, tipo_endereco, logradouro, numero, complemento, bairro, cidade, uf, cep, pais
        ) values (
          v_empresa_id, v_pessoa_id,
          coalesce(nullif(v_endereco->>'tipo_endereco',''), 'PRINCIPAL'),
          nullif(v_endereco->>'logradouro',''),
          nullif(v_endereco->>'numero',''),
          nullif(v_endereco->>'complemento',''),
          nullif(v_endereco->>'bairro',''),
          nullif(v_endereco->>'cidade',''),
          nullif(v_endereco->>'uf',''),
          nullif(v_endereco->>'cep',''),
          nullif(v_endereco->>'pais','')
        );
      end if;
    end loop;

    delete from public.pessoa_enderecos
    where pessoa_id = v_pessoa_id and empresa_id = v_empresa_id
      and (array_length(v_endereco_ids, 1) is null or id <> all(v_endereco_ids));
  end if;

  -- Contatos: replace set semantics only if payload is array
  if jsonb_typeof(v_contatos) = 'array' then
    for v_contato in select * from jsonb_array_elements(v_contatos)
    loop
      if nullif(v_contato->>'id','') is not null then
        update public.pessoa_contatos set
          nome = nullif(v_contato->>'nome',''),
          email = nullif(v_contato->>'email',''),
          telefone = nullif(v_contato->>'telefone',''),
          cargo = nullif(v_contato->>'cargo',''),
          observacoes = nullif(v_contato->>'observacoes','')
        where id = (v_contato->>'id')::uuid and pessoa_id = v_pessoa_id and empresa_id = v_empresa_id;
        v_contato_ids := array_append(v_contato_ids, (v_contato->>'id')::uuid);
      else
        insert into public.pessoa_contatos (
          empresa_id, pessoa_id, nome, email, telefone, cargo, observacoes
        ) values (
          v_empresa_id, v_pessoa_id,
          nullif(v_contato->>'nome',''),
          nullif(v_contato->>'email',''),
          nullif(v_contato->>'telefone',''),
          nullif(v_contato->>'cargo',''),
          nullif(v_contato->>'observacoes','')
        );
      end if;
    end loop;

    delete from public.pessoa_contatos
    where pessoa_id = v_pessoa_id and empresa_id = v_empresa_id
      and (array_length(v_contato_ids, 1) is null or id <> all(v_contato_ids));
  end if;

  return public.get_partner_details(v_pessoa_id);
end;
$$;

-- Soft delete (avoid FK violations)
create or replace function public.delete_partner(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  if v_empresa_id is null then
    raise exception 'Nenhuma empresa ativa.' using errcode = '22000';
  end if;

  update public.pessoas
     set deleted_at = now()
   where id = p_id
     and empresa_id = v_empresa_id
     and deleted_at is null;

  if not found then
    raise exception 'Parceiro nao encontrado, fora da empresa ou ja inativado.' using errcode = '23503';
  end if;
end;
$$;

create or replace function public.restore_partner(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  if v_empresa_id is null then
    raise exception 'Nenhuma empresa ativa.' using errcode = '22000';
  end if;

  update public.pessoas
     set deleted_at = null
   where id = p_id
     and empresa_id = v_empresa_id
     and deleted_at is not null;

  if not found then
    raise exception 'Parceiro nao encontrado, fora da empresa ou ja ativo.' using errcode = '23503';
  end if;
end;
$$;

-- Autocomplete for clients
create or replace function public.search_clients_for_current_user(
  p_search text,
  p_limit int default 20
)
returns table (
  id uuid,
  label text,
  nome text,
  doc_unico text
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_q text := nullif(trim(coalesce(p_search,'')), '');
  v_digits text := regexp_replace(coalesce(p_search,''), '\\D', '', 'g');
begin
  if v_q is null then
    return;
  end if;

  return query
  select
    p.id,
    (p.nome || case when p.doc_unico is not null and p.doc_unico <> '' then ' - ' || p.doc_unico else '' end) as label,
    p.nome,
    p.doc_unico
  from public.pessoas p
  where p.empresa_id = public.current_empresa_id()
    and p.deleted_at is null
    and p.tipo in ('cliente'::public.pessoa_tipo, 'ambos'::public.pessoa_tipo)
    and (
      p.nome ilike '%' || v_q || '%'
      or coalesce(p.fantasia,'') ilike '%' || v_q || '%'
      or coalesce(p.doc_unico,'') ilike '%' || v_digits || '%'
    )
  order by p.nome asc
  limit greatest(p_limit, 0);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Grants
-- -----------------------------------------------------------------------------
revoke all on function public.list_partners(integer, integer, text, public.pessoa_tipo, text) from public, anon;
grant execute on function public.list_partners(integer, integer, text, public.pessoa_tipo, text) to authenticated, service_role;

revoke all on function public.count_partners(text, public.pessoa_tipo) from public, anon;
grant execute on function public.count_partners(text, public.pessoa_tipo) to authenticated, service_role;

revoke all on function public.list_partners_v2(text, public.pessoa_tipo, text, integer, integer, text, text) from public, anon;
grant execute on function public.list_partners_v2(text, public.pessoa_tipo, text, integer, integer, text, text) to authenticated, service_role;

revoke all on function public.count_partners_v2(text, public.pessoa_tipo, text) from public, anon;
grant execute on function public.count_partners_v2(text, public.pessoa_tipo, text) to authenticated, service_role;

revoke all on function public.get_partner_details(uuid) from public, anon;
grant execute on function public.get_partner_details(uuid) to authenticated, service_role;

revoke all on function public.create_update_partner(jsonb) from public, anon;
grant execute on function public.create_update_partner(jsonb) to authenticated, service_role;

revoke all on function public.delete_partner(uuid) from public, anon;
grant execute on function public.delete_partner(uuid) to authenticated, service_role;

revoke all on function public.restore_partner(uuid) from public, anon;
grant execute on function public.restore_partner(uuid) to authenticated, service_role;

revoke all on function public.search_clients_for_current_user(text, int) from public, anon;
grant execute on function public.search_clients_for_current_user(text, int) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

COMMIT;
