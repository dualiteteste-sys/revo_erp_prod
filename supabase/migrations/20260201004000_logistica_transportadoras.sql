-- Ported from `supabase/migrations_legacy/20250220120000_logistica_transportadoras.sql` (DEV parity)

/*
  Logística - Módulo Transportadoras (cadastro + RPCs)
*/

drop function if exists public.logistica_transportadoras_list(text, boolean, int, int);
drop function if exists public.logistica_transportadoras_get(uuid);
drop function if exists public.logistica_transportadoras_upsert(jsonb);
drop function if exists public.logistica_transportadoras_delete(uuid);

create table if not exists public.logistica_transportadoras (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  pessoa_id uuid,
  codigo text,
  nome text not null,
  tipo_pessoa text not null default 'nao_definido'
    check (tipo_pessoa in ('pf','pj','nao_definido')),
  documento text,
  ie_rg text,
  isento_ie boolean not null default false,
  telefone text,
  email text,
  contato_principal text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf char(2),
  cep text,
  pais text default 'Brasil',
  modal_principal text not null default 'rodoviario'
    check (modal_principal in ('rodoviario','aereo','maritimo','ferroviario','courier','outro')),
  frete_tipo_padrao text not null default 'nao_definido'
    check (frete_tipo_padrao in ('cif','fob','terceiros','nao_definido')),
  prazo_medio_dias int,
  exige_agendamento boolean not null default false,
  observacoes text,
  ativo boolean not null default true,
  padrao_para_frete boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint logistica_transportadoras_pkey primary key (id),
  constraint logistica_transportadoras_empresa_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint logistica_transportadoras_pessoa_fkey
    foreign key (pessoa_id) references public.pessoas(id),
  constraint logistica_transportadoras_empresa_codigo_uk
    unique (empresa_id, codigo)
);

create index if not exists idx_log_transp_empresa
  on public.logistica_transportadoras (empresa_id);
create index if not exists idx_log_transp_empresa_ativo
  on public.logistica_transportadoras (empresa_id, ativo);
create index if not exists idx_log_transp_empresa_nome
  on public.logistica_transportadoras (empresa_id, nome);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'handle_updated_at_logistica_transportadoras'
      and tgrelid = 'public.logistica_transportadoras'::regclass
  ) then
    create trigger handle_updated_at_logistica_transportadoras
      before update on public.logistica_transportadoras
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

alter table public.logistica_transportadoras enable row level security;

drop policy if exists "log_transp_select" on public.logistica_transportadoras;
drop policy if exists "log_transp_insert" on public.logistica_transportadoras;
drop policy if exists "log_transp_update" on public.logistica_transportadoras;
drop policy if exists "log_transp_delete" on public.logistica_transportadoras;

create policy "log_transp_select"
  on public.logistica_transportadoras
  for select
  using (empresa_id = public.current_empresa_id());
create policy "log_transp_insert"
  on public.logistica_transportadoras
  for insert
  with check (empresa_id = public.current_empresa_id());
create policy "log_transp_update"
  on public.logistica_transportadoras
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());
create policy "log_transp_delete"
  on public.logistica_transportadoras
  for delete
  using (empresa_id = public.current_empresa_id());

create or replace function public.logistica_transportadoras_list(
  p_search text   default null,
  p_ativo  boolean default null,
  p_limit  int    default 50,
  p_offset int    default 0
)
returns table (
  id                   uuid,
  nome                 text,
  codigo               text,
  documento            text,
  cidade               text,
  uf                   text,
  modal_principal      text,
  frete_tipo_padrao    text,
  prazo_medio_dias     int,
  exige_agendamento    boolean,
  ativo                boolean,
  padrao_para_frete    boolean,
  total_count          bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  return query
  select
    t.id,
    t.nome,
    t.codigo,
    t.documento,
    t.cidade,
    t.uf::text,
    t.modal_principal,
    t.frete_tipo_padrao,
    t.prazo_medio_dias,
    t.exige_agendamento,
    t.ativo,
    t.padrao_para_frete,
    count(*) over() as total_count
  from public.logistica_transportadoras t
  where t.empresa_id = v_empresa_id
    and (p_ativo is null or t.ativo = p_ativo)
    and (
      p_search is null
      or t.nome ilike '%' || p_search || '%'
      or coalesce(t.codigo, '')    ilike '%' || p_search || '%'
      or coalesce(t.documento, '') ilike '%' || p_search || '%'
      or coalesce(t.cidade, '')    ilike '%' || p_search || '%'
    )
  order by t.ativo desc, t.nome asc
  limit p_limit offset p_offset;
end;
$$;
revoke all on function public.logistica_transportadoras_list(text, boolean, int, int) from public;
grant execute on function public.logistica_transportadoras_list(text, boolean, int, int) to authenticated, service_role;

create or replace function public.logistica_transportadoras_get(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_data jsonb;
begin
  select to_jsonb(t.*)
  into v_data
  from public.logistica_transportadoras t
  where t.id = p_id and t.empresa_id = v_empresa_id;
  return v_data;
end;
$$;
revoke all on function public.logistica_transportadoras_get(uuid) from public;
grant execute on function public.logistica_transportadoras_get(uuid) to authenticated, service_role;

create or replace function public.logistica_transportadoras_upsert(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_row public.logistica_transportadoras;
begin
  if v_id is null then
    insert into public.logistica_transportadoras (
      empresa_id, pessoa_id, codigo, nome, tipo_pessoa, documento, ie_rg, isento_ie,
      telefone, email, contato_principal, logradouro, numero, complemento, bairro, cidade, uf, cep, pais,
      modal_principal, frete_tipo_padrao, prazo_medio_dias, exige_agendamento, observacoes, ativo, padrao_para_frete
    ) values (
      v_empresa_id,
      nullif(p_payload->>'pessoa_id','')::uuid,
      nullif(p_payload->>'codigo',''),
      p_payload->>'nome',
      coalesce(nullif(p_payload->>'tipo_pessoa',''),'nao_definido'),
      nullif(p_payload->>'documento',''),
      nullif(p_payload->>'ie_rg',''),
      coalesce((p_payload->>'isento_ie')::boolean,false),
      nullif(p_payload->>'telefone',''),
      nullif(p_payload->>'email',''),
      nullif(p_payload->>'contato_principal',''),
      nullif(p_payload->>'logradouro',''),
      nullif(p_payload->>'numero',''),
      nullif(p_payload->>'complemento',''),
      nullif(p_payload->>'bairro',''),
      nullif(p_payload->>'cidade',''),
      nullif(p_payload->>'uf','')::char(2),
      nullif(p_payload->>'cep',''),
      coalesce(nullif(p_payload->>'pais',''),'Brasil'),
      coalesce(nullif(p_payload->>'modal_principal',''),'rodoviario'),
      coalesce(nullif(p_payload->>'frete_tipo_padrao',''),'nao_definido'),
      nullif(p_payload->>'prazo_medio_dias','')::int,
      coalesce((p_payload->>'exige_agendamento')::boolean,false),
      nullif(p_payload->>'observacoes',''),
      coalesce((p_payload->>'ativo')::boolean,true),
      coalesce((p_payload->>'padrao_para_frete')::boolean,false)
    )
    returning * into v_row;
  else
    update public.logistica_transportadoras set
      pessoa_id = nullif(p_payload->>'pessoa_id','')::uuid,
      codigo = nullif(p_payload->>'codigo',''),
      nome = p_payload->>'nome',
      tipo_pessoa = coalesce(nullif(p_payload->>'tipo_pessoa',''),'nao_definido'),
      documento = nullif(p_payload->>'documento',''),
      ie_rg = nullif(p_payload->>'ie_rg',''),
      isento_ie = coalesce((p_payload->>'isento_ie')::boolean,false),
      telefone = nullif(p_payload->>'telefone',''),
      email = nullif(p_payload->>'email',''),
      contato_principal = nullif(p_payload->>'contato_principal',''),
      logradouro = nullif(p_payload->>'logradouro',''),
      numero = nullif(p_payload->>'numero',''),
      complemento = nullif(p_payload->>'complemento',''),
      bairro = nullif(p_payload->>'bairro',''),
      cidade = nullif(p_payload->>'cidade',''),
      uf = nullif(p_payload->>'uf','')::char(2),
      cep = nullif(p_payload->>'cep',''),
      pais = coalesce(nullif(p_payload->>'pais',''),'Brasil'),
      modal_principal = coalesce(nullif(p_payload->>'modal_principal',''),'rodoviario'),
      frete_tipo_padrao = coalesce(nullif(p_payload->>'frete_tipo_padrao',''),'nao_definido'),
      prazo_medio_dias = nullif(p_payload->>'prazo_medio_dias','')::int,
      exige_agendamento = coalesce((p_payload->>'exige_agendamento')::boolean,false),
      observacoes = nullif(p_payload->>'observacoes',''),
      ativo = coalesce((p_payload->>'ativo')::boolean,true),
      padrao_para_frete = coalesce((p_payload->>'padrao_para_frete')::boolean,false),
      updated_at = now()
    where id = v_id and empresa_id = v_empresa_id
    returning * into v_row;
  end if;

  return to_jsonb(v_row);
end;
$$;
revoke all on function public.logistica_transportadoras_upsert(jsonb) from public;
grant execute on function public.logistica_transportadoras_upsert(jsonb) to authenticated, service_role;

create or replace function public.logistica_transportadoras_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  delete from public.logistica_transportadoras
   where id = p_id and empresa_id = v_empresa_id;
end;
$$;
revoke all on function public.logistica_transportadoras_delete(uuid) from public;
grant execute on function public.logistica_transportadoras_delete(uuid) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

