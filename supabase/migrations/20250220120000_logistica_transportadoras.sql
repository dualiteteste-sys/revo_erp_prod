/*
  # Logística - Módulo Transportadoras (Cadastro Simples)

  ## Query Description
  Cria o módulo de Transportadoras para uso interno do ERP
  (vendas, faturamento, expedição), com:
  - Tabela principal logistica_transportadoras
  - RLS por operação (empresa_id)
  - RPCs de listagem, detalhes, upsert e delete

  ## Impact Summary
  - Segurança:
    - RLS por operação em logistica_transportadoras.
    - RPCs com SECURITY DEFINER e search_path restrito.
    - Uso consistente de public.current_empresa_id().
  - Compatibilidade:
    - create table/index if not exists.
    - drop function if exists antes de recriar RPCs.
  - Reversibilidade:
    - Tabela, índices, policies e funções podem ser dropados em migração futura.
*/

-- =============================================
-- 0. Limpeza de RPCs legadas deste módulo
-- =============================================

drop function if exists public.logistica_transportadoras_list(text, boolean, int, int);
drop function if exists public.logistica_transportadoras_get(uuid);
drop function if exists public.logistica_transportadoras_upsert(jsonb);
drop function if exists public.logistica_transportadoras_delete(uuid);

-- =============================================
-- 1. Tabela principal de Transportadoras
-- =============================================

create table if not exists public.logistica_transportadoras (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  -- opcional: vínculo com cadastro geral de pessoas (clientes/fornecedores)
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

-- =============================================
-- 2. Índices
-- =============================================

create index if not exists idx_log_transp_empresa
  on public.logistica_transportadoras (empresa_id);

create index if not exists idx_log_transp_empresa_ativo
  on public.logistica_transportadoras (empresa_id, ativo);

create index if not exists idx_log_transp_empresa_nome
  on public.logistica_transportadoras (empresa_id, nome);

-- =============================================
-- 3. Trigger updated_at
-- =============================================

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

-- =============================================
-- 4. RLS por operação
-- =============================================

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

-- =============================================
-- 5. RPC - Listagem de Transportadoras
-- =============================================

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
    t.uf,
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
  order by
    t.ativo desc,
    t.nome asc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.logistica_transportadoras_list from public;
grant execute on function public.logistica_transportadoras_list to authenticated, service_role;

-- =============================================
-- 6. RPC - Detalhes de Transportadora
-- =============================================

create or replace function public.logistica_transportadoras_get(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_data       jsonb;
begin
  select
    to_jsonb(t.*)
    || jsonb_build_object(
         'endereco_formatado',
         trim(
           both ' ' from
             coalesce(t.logradouro, '') || ' ' || coalesce(t.numero, '') ||
             ' - ' || coalesce(t.bairro, '') ||
             case
               when t.cidade is not null then ' - ' || t.cidade
               else ''
             end ||
             case
               when t.uf is not null then '/' || t.uf
               else ''
             end
         )
       )
  into v_data
  from public.logistica_transportadoras t
  where t.id = p_id
    and t.empresa_id = v_empresa_id;

  return v_data;
end;
$$;

revoke all on function public.logistica_transportadoras_get from public;
grant execute on function public.logistica_transportadoras_get to authenticated, service_role;

-- =============================================
-- 7. RPC - Upsert de Transportadora
-- =============================================

create or replace function public.logistica_transportadoras_upsert(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_id         uuid;
  v_pessoa_id  uuid;
  v_padrao     boolean;
  v_result     jsonb;
begin
  if p_payload->>'nome' is null or trim(p_payload->>'nome') = '' then
    raise exception 'Nome da transportadora é obrigatório.';
  end if;

  if p_payload->>'pessoa_id' is not null then
    v_pessoa_id := (p_payload->>'pessoa_id')::uuid;

    if not exists (
      select 1
      from public.pessoas p
      where p.id = v_pessoa_id
    ) then
      raise exception 'Pessoa vinculada à transportadora não encontrada.';
    end if;
  end if;

  v_padrao := coalesce((p_payload->>'padrao_para_frete')::boolean, false);

  if p_payload->>'id' is not null then
    update public.logistica_transportadoras t
    set
      pessoa_id          = v_pessoa_id,
      codigo             = p_payload->>'codigo',
      nome               = p_payload->>'nome',
      tipo_pessoa        = coalesce(p_payload->>'tipo_pessoa', tipo_pessoa),
      documento          = p_payload->>'documento',
      ie_rg              = p_payload->>'ie_rg',
      isento_ie          = coalesce((p_payload->>'isento_ie')::boolean, isento_ie),
      telefone           = p_payload->>'telefone',
      email              = p_payload->>'email',
      contato_principal  = p_payload->>'contato_principal',
      logradouro         = p_payload->>'logradouro',
      numero             = p_payload->>'numero',
      complemento        = p_payload->>'complemento',
      bairro             = p_payload->>'bairro',
      cidade             = p_payload->>'cidade',
      uf                 = (p_payload->>'uf')::char(2),
      cep                = p_payload->>'cep',
      pais               = coalesce(p_payload->>'pais', pais),
      modal_principal    = coalesce(p_payload->>'modal_principal', modal_principal),
      frete_tipo_padrao  = coalesce(p_payload->>'frete_tipo_padrao', frete_tipo_padrao),
      prazo_medio_dias   = (p_payload->>'prazo_medio_dias')::int,
      exige_agendamento  = coalesce((p_payload->>'exige_agendamento')::boolean, exige_agendamento),
      observacoes        = p_payload->>'observacoes',
      ativo              = coalesce((p_payload->>'ativo')::boolean, ativo),
      padrao_para_frete  = v_padrao
    where t.id = (p_payload->>'id')::uuid
      and t.empresa_id = v_empresa_id
    returning t.id into v_id;
  else
    insert into public.logistica_transportadoras (
      empresa_id,
      pessoa_id,
      codigo,
      nome,
      tipo_pessoa,
      documento,
      ie_rg,
      isento_ie,
      telefone,
      email,
      contato_principal,
      logradouro,
      numero,
      complemento,
      bairro,
      cidade,
      uf,
      cep,
      pais,
      modal_principal,
      frete_tipo_padrao,
      prazo_medio_dias,
      exige_agendamento,
      observacoes,
      ativo,
      padrao_para_frete
    ) values (
      v_empresa_id,
      v_pessoa_id,
      p_payload->>'codigo',
      p_payload->>'nome',
      coalesce(p_payload->>'tipo_pessoa', 'nao_definido'),
      p_payload->>'documento',
      p_payload->>'ie_rg',
      coalesce((p_payload->>'isento_ie')::boolean, false),
      p_payload->>'telefone',
      p_payload->>'email',
      p_payload->>'contato_principal',
      p_payload->>'logradouro',
      p_payload->>'numero',
      p_payload->>'complemento',
      p_payload->>'bairro',
      p_payload->>'cidade',
      (p_payload->>'uf')::char(2),
      p_payload->>'cep',
      coalesce(p_payload->>'pais', 'Brasil'),
      coalesce(p_payload->>'modal_principal', 'rodoviario'),
      coalesce(p_payload->>'frete_tipo_padrao', 'nao_definido'),
      (p_payload->>'prazo_medio_dias')::int,
      coalesce((p_payload->>'exige_agendamento')::boolean, false),
      p_payload->>'observacoes',
      coalesce((p_payload->>'ativo')::boolean, true),
      v_padrao
    )
    returning id into v_id;
  end if;

  -- Garante que só exista uma transportadora padrão por empresa
  if v_padrao then
    update public.logistica_transportadoras
    set padrao_para_frete = false
    where empresa_id = v_empresa_id
      and id <> v_id;
  end if;

  v_result := public.logistica_transportadoras_get(v_id);

  perform pg_notify(
    'app_log',
    '[RPC] logistica_transportadoras_upsert: ' || v_id
  );

  return v_result;
end;
$$;

revoke all on function public.logistica_transportadoras_upsert from public;
grant execute on function public.logistica_transportadoras_upsert to authenticated, service_role;

-- =============================================
-- 8. RPC - Delete de Transportadora
-- =============================================

create or replace function public.logistica_transportadoras_delete(
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  delete from public.logistica_transportadoras
  where id = p_id
    and empresa_id = v_empresa_id;
end;
$$;

revoke all on function public.logistica_transportadoras_delete from public;
grant execute on function public.logistica_transportadoras_delete to authenticated, service_role;
