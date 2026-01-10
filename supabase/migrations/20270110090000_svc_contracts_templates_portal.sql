/*
  SVC-CONTRATOS: Templates + Documento (snapshot) + Portal público com aceite

  Objetivo:
  - Permitir gerar um documento do contrato (snapshot a partir de um template)
  - Criar link público por token (hash armazenado) para visualização e aceite
  - Evitar Edge Functions (deploy em PROD pode ser pulado); usa RPC security definer + GRANT para anon
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) Templates
-- -----------------------------------------------------------------------------

create table if not exists public.servicos_contratos_templates (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  slug text not null,
  titulo text not null,
  corpo text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_servicos_contratos_templates_empresa_slug
  on public.servicos_contratos_templates (empresa_id, slug);

create index if not exists idx_servicos_contratos_templates_empresa_active
  on public.servicos_contratos_templates (empresa_id, active, updated_at desc);

alter table public.servicos_contratos_templates enable row level security;
alter table public.servicos_contratos_templates force row level security;

drop policy if exists servicos_contratos_templates_all_company_members on public.servicos_contratos_templates;
create policy servicos_contratos_templates_all_company_members
on public.servicos_contratos_templates
for all
to authenticated
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

drop trigger if exists tg_servicos_contratos_templates_updated on public.servicos_contratos_templates;
create trigger tg_servicos_contratos_templates_updated
  before update on public.servicos_contratos_templates
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on table public.servicos_contratos_templates to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) Documentos (snapshot + token)
-- -----------------------------------------------------------------------------

create table if not exists public.servicos_contratos_documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  contrato_id uuid not null references public.servicos_contratos(id) on delete cascade,
  template_id uuid null references public.servicos_contratos_templates(id) on delete set null,
  titulo text not null,
  corpo text not null,

  token_hash text not null,
  expires_at timestamptz null,
  revoked_at timestamptz null,

  accepted_at timestamptz null,
  accepted_nome text null,
  accepted_email text null,

  created_at timestamptz not null default now(),
  created_by uuid null default auth.uid()
);

create unique index if not exists ux_servicos_contratos_documentos_token_hash
  on public.servicos_contratos_documentos (token_hash);

create index if not exists idx_servicos_contratos_documentos_contrato_created
  on public.servicos_contratos_documentos (contrato_id, created_at desc);

alter table public.servicos_contratos_documentos enable row level security;
alter table public.servicos_contratos_documentos force row level security;

drop policy if exists servicos_contratos_documentos_all_company_members on public.servicos_contratos_documentos;
create policy servicos_contratos_documentos_all_company_members
on public.servicos_contratos_documentos
for all
to authenticated
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

grant select, insert, update, delete on table public.servicos_contratos_documentos to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) RPCs (app)
-- -----------------------------------------------------------------------------

create or replace function public.servicos_contratos_templates_ensure_defaults()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  if v_emp is null then
    return;
  end if;

  if exists (select 1 from public.servicos_contratos_templates t where t.empresa_id = v_emp) then
    return;
  end if;

  insert into public.servicos_contratos_templates (empresa_id, slug, titulo, corpo, active)
  values
  (
    v_emp,
    'contrato_servicos_padrao',
    'Contrato de Prestação de Serviços — {{cliente_nome}}',
    'EMPRESA: {{empresa_nome}}\n\nCONTRATO: {{contrato_descricao}}\nCLIENTE: {{cliente_nome}}\nE-MAIL: {{cliente_email}}\nVALOR MENSAL: {{valor_mensal}}\nINÍCIO: {{data_inicio}}\n\n1. OBJETO\nPrestação de serviços conforme descrito acima.\n\n2. VIGÊNCIA\nInício em {{data_inicio}} e término em {{data_fim}} (quando aplicável).\n\n3. PAGAMENTO\nCobrança mensal conforme regra do contrato.\n\n4. ACEITE\nAo clicar em “Aceitar contrato”, o CLIENTE confirma ciência e concordância com os termos.\n\nData: {{data_hoje}}',
    true
  ),
  (
    v_emp,
    'proposta_servicos',
    'Proposta Comercial — {{cliente_nome}}',
    'EMPRESA: {{empresa_nome}}\nCLIENTE: {{cliente_nome}}\n\nPROPOSTA\n{{contrato_descricao}}\n\nVALOR MENSAL: {{valor_mensal}}\nINÍCIO: {{data_inicio}}\n\nData: {{data_hoje}}',
    true
  )
  on conflict (empresa_id, slug) do nothing;
end;
$$;

revoke all on function public.servicos_contratos_templates_ensure_defaults() from public, anon;
grant execute on function public.servicos_contratos_templates_ensure_defaults() to authenticated, service_role;


drop function if exists public.servicos_contratos_templates_list(boolean);
create or replace function public.servicos_contratos_templates_list(
  p_active_only boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  perform public.require_plano_mvp_allows('servicos');
  perform public.require_permission_for_current_user('servicos','view');

  perform public.servicos_contratos_templates_ensure_defaults();

  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.titulo)
    from (
      select id, empresa_id, slug, titulo, corpo, active, created_at, updated_at
      from public.servicos_contratos_templates
      where empresa_id = v_emp
        and (p_active_only is false or active = true)
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.servicos_contratos_templates_list(boolean) from public, anon;
grant execute on function public.servicos_contratos_templates_list(boolean) to authenticated, service_role;


drop function if exists public.servicos_contratos_document_list(uuid, int);
create or replace function public.servicos_contratos_document_list(
  p_contrato_id uuid,
  p_limit int default 20
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  perform public.require_plano_mvp_allows('servicos');
  perform public.require_permission_for_current_user('servicos','view');

  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (
      select
        id,
        empresa_id,
        contrato_id,
        template_id,
        titulo,
        expires_at,
        revoked_at,
        accepted_at,
        accepted_nome,
        accepted_email,
        created_at
      from public.servicos_contratos_documentos d
      where d.empresa_id = v_emp and d.contrato_id = p_contrato_id
      order by d.created_at desc
      limit greatest(1, least(coalesce(p_limit, 20), 50))
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.servicos_contratos_document_list(uuid, int) from public, anon;
grant execute on function public.servicos_contratos_document_list(uuid, int) to authenticated, service_role;


drop function if exists public.servicos_contratos_document_create(uuid, uuid, int);
create or replace function public.servicos_contratos_document_create(
  p_contrato_id uuid,
  p_template_id uuid,
  p_expires_in_days int default 30
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_contrato public.servicos_contratos;
  v_template public.servicos_contratos_templates;
  v_cliente_nome text := null;
  v_cliente_email text := null;
  v_empresa_nome text := null;
  v_token text;
  v_hash text;
  v_days int := greatest(1, least(coalesce(p_expires_in_days, 30), 365));
  v_expires timestamptz := now() + (v_days || ' days')::interval;
  v_titulo text;
  v_corpo text;
  v_doc_id uuid;
begin
  perform public.require_plano_mvp_allows('servicos');
  perform public.require_permission_for_current_user('servicos','update');

  if v_emp is null then
    raise exception '[SVC][CONTRATOS][DOC] empresa_id inválido' using errcode='42501';
  end if;

  select * into v_contrato
  from public.servicos_contratos c
  where c.id = p_contrato_id and c.empresa_id = v_emp;

  if not found then
    raise exception 'Contrato não encontrado ou acesso negado.' using errcode='P0002';
  end if;

  select * into v_template
  from public.servicos_contratos_templates t
  where t.id = p_template_id and t.empresa_id = v_emp and t.active = true;

  if not found then
    raise exception 'Template não encontrado ou inativo.' using errcode='P0002';
  end if;

  select e.nome into v_empresa_nome
  from public.empresas e
  where e.id = v_emp;

  if v_contrato.cliente_id is not null then
    select p.nome, p.email into v_cliente_nome, v_cliente_email
    from public.pessoas p
    where p.id = v_contrato.cliente_id and p.empresa_id = v_emp;
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  v_titulo := v_template.titulo;
  v_corpo := v_template.corpo;

  v_titulo := replace(v_titulo, '{{empresa_nome}}', coalesce(v_empresa_nome, ''));
  v_titulo := replace(v_titulo, '{{contrato_descricao}}', coalesce(v_contrato.descricao, ''));
  v_titulo := replace(v_titulo, '{{contrato_numero}}', coalesce(v_contrato.numero, ''));
  v_titulo := replace(v_titulo, '{{cliente_nome}}', coalesce(v_cliente_nome, ''));
  v_titulo := replace(v_titulo, '{{cliente_email}}', coalesce(v_cliente_email, ''));
  v_titulo := replace(v_titulo, '{{valor_mensal}}', coalesce(v_contrato.valor_mensal, 0)::text);
  v_titulo := replace(v_titulo, '{{data_inicio}}', coalesce(to_char(v_contrato.data_inicio, 'DD/MM/YYYY'), ''));
  v_titulo := replace(v_titulo, '{{data_fim}}', coalesce(to_char(v_contrato.data_fim, 'DD/MM/YYYY'), ''));
  v_titulo := replace(v_titulo, '{{data_hoje}}', to_char(current_date, 'DD/MM/YYYY'));

  v_corpo := replace(v_corpo, '{{empresa_nome}}', coalesce(v_empresa_nome, ''));
  v_corpo := replace(v_corpo, '{{contrato_descricao}}', coalesce(v_contrato.descricao, ''));
  v_corpo := replace(v_corpo, '{{contrato_numero}}', coalesce(v_contrato.numero, ''));
  v_corpo := replace(v_corpo, '{{cliente_nome}}', coalesce(v_cliente_nome, ''));
  v_corpo := replace(v_corpo, '{{cliente_email}}', coalesce(v_cliente_email, ''));
  v_corpo := replace(v_corpo, '{{valor_mensal}}', coalesce(v_contrato.valor_mensal, 0)::text);
  v_corpo := replace(v_corpo, '{{data_inicio}}', coalesce(to_char(v_contrato.data_inicio, 'DD/MM/YYYY'), ''));
  v_corpo := replace(v_corpo, '{{data_fim}}', coalesce(to_char(v_contrato.data_fim, 'DD/MM/YYYY'), ''));
  v_corpo := replace(v_corpo, '{{data_hoje}}', to_char(current_date, 'DD/MM/YYYY'));

  insert into public.servicos_contratos_documentos (
    empresa_id,
    contrato_id,
    template_id,
    titulo,
    corpo,
    token_hash,
    expires_at,
    revoked_at,
    created_by
  )
  values (
    v_emp,
    p_contrato_id,
    p_template_id,
    coalesce(nullif(btrim(v_titulo), ''), 'Contrato'),
    coalesce(nullif(btrim(v_corpo), ''), ''),
    v_hash,
    v_expires,
    null,
    auth.uid()
  )
  returning id into v_doc_id;

  return jsonb_build_object(
    'doc_id', v_doc_id,
    'token', v_token,
    'expires_at', v_expires,
    'path', '/portal/contrato/' || v_token
  );
end;
$$;

revoke all on function public.servicos_contratos_document_create(uuid, uuid, int) from public, anon;
grant execute on function public.servicos_contratos_document_create(uuid, uuid, int) to authenticated, service_role;


drop function if exists public.servicos_contratos_document_revoke(uuid);
create or replace function public.servicos_contratos_document_revoke(
  p_doc_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_revoked_at timestamptz;
begin
  perform public.require_plano_mvp_allows('servicos');
  perform public.require_permission_for_current_user('servicos','update');

  update public.servicos_contratos_documentos d
  set revoked_at = now()
  where d.empresa_id = v_emp and d.id = p_doc_id
  returning revoked_at into v_revoked_at;

  if not found then
    raise exception 'Documento não encontrado ou acesso negado.' using errcode='P0002';
  end if;

  return jsonb_build_object('revoked_at', v_revoked_at);
end;
$$;

revoke all on function public.servicos_contratos_document_revoke(uuid) from public, anon;
grant execute on function public.servicos_contratos_document_revoke(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) Portal RPCs (anon)
-- -----------------------------------------------------------------------------

drop function if exists public.servicos_contratos_portal_get(text);
create or replace function public.servicos_contratos_portal_get(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hash text := encode(digest(coalesce(p_token,''), 'sha256'), 'hex');
  v_doc record;
  v_contrato record;
  v_cliente_id uuid := null;
  v_cliente_nome text := null;
  v_cliente_email text := null;
begin
  if length(coalesce(p_token,'')) < 20 then
    raise exception '[PORTAL][CONTRATO] token inválido' using errcode='22023';
  end if;

  select
    d.id,
    d.empresa_id,
    d.contrato_id,
    d.titulo,
    d.corpo,
    d.expires_at,
    d.revoked_at,
    d.accepted_at,
    d.accepted_nome,
    d.accepted_email,
    d.created_at
  into v_doc
  from public.servicos_contratos_documentos d
  where d.token_hash = v_hash
  order by d.created_at desc
  limit 1;

  if v_doc is null then
    raise exception '[PORTAL][CONTRATO] token não encontrado' using errcode='P0002';
  end if;
  if v_doc.revoked_at is not null then
    raise exception '[PORTAL][CONTRATO] token revogado' using errcode='42501';
  end if;
  if v_doc.expires_at is not null and v_doc.expires_at < now() then
    raise exception '[PORTAL][CONTRATO] token expirado' using errcode='42501';
  end if;

  select
    c.id,
    c.numero,
    c.descricao,
    c.status::text as status,
    c.valor_mensal,
    c.data_inicio,
    c.data_fim,
    c.cliente_id
  into v_contrato
  from public.servicos_contratos c
  where c.id = v_doc.contrato_id and c.empresa_id = v_doc.empresa_id;

  if v_contrato is null then
    raise exception '[PORTAL][CONTRATO] contrato não encontrado' using errcode='P0002';
  end if;

  if v_contrato.cliente_id is not null then
    select p.id, p.nome, p.email into v_cliente_id, v_cliente_nome, v_cliente_email
    from public.pessoas p
    where p.id = v_contrato.cliente_id and p.empresa_id = v_doc.empresa_id;
  end if;

  return jsonb_build_object(
    'documento', jsonb_build_object(
      'id', v_doc.id,
      'titulo', v_doc.titulo,
      'corpo', v_doc.corpo,
      'expires_at', v_doc.expires_at,
      'revoked_at', v_doc.revoked_at,
      'accepted_at', v_doc.accepted_at,
      'accepted_nome', v_doc.accepted_nome,
      'accepted_email', v_doc.accepted_email,
      'created_at', v_doc.created_at
    ),
    'contrato', jsonb_build_object(
      'id', v_contrato.id,
      'numero', v_contrato.numero,
      'descricao', v_contrato.descricao,
      'status', v_contrato.status,
      'valor_mensal', coalesce(v_contrato.valor_mensal, 0),
      'data_inicio', v_contrato.data_inicio,
      'data_fim', v_contrato.data_fim
    ),
    'cliente', jsonb_build_object(
      'id', v_cliente_id,
      'nome', v_cliente_nome,
      'email', v_cliente_email
    )
  );
end;
$$;

revoke all on function public.servicos_contratos_portal_get(text) from public;
grant execute on function public.servicos_contratos_portal_get(text) to anon, authenticated, service_role;


drop function if exists public.servicos_contratos_portal_accept(text, text, text);
create or replace function public.servicos_contratos_portal_accept(
  p_token text,
  p_nome text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hash text := encode(digest(coalesce(p_token,''), 'sha256'), 'hex');
  v_doc record;
  v_name text := nullif(btrim(p_nome), '');
  v_email text := nullif(btrim(p_email), '');
  v_accepted timestamptz;
begin
  if v_name is null or v_email is null then
    raise exception '[PORTAL][CONTRATO] campos obrigatórios' using errcode='23514';
  end if;
  if length(coalesce(p_token,'')) < 20 then
    raise exception '[PORTAL][CONTRATO] token inválido' using errcode='22023';
  end if;

  select
    d.id,
    d.expires_at,
    d.revoked_at,
    d.accepted_at,
    d.accepted_nome,
    d.accepted_email
  into v_doc
  from public.servicos_contratos_documentos d
  where d.token_hash = v_hash
  order by d.created_at desc
  limit 1;

  if v_doc is null then
    raise exception '[PORTAL][CONTRATO] token não encontrado' using errcode='P0002';
  end if;
  if v_doc.revoked_at is not null then
    raise exception '[PORTAL][CONTRATO] token revogado' using errcode='42501';
  end if;
  if v_doc.expires_at is not null and v_doc.expires_at < now() then
    raise exception '[PORTAL][CONTRATO] token expirado' using errcode='42501';
  end if;

  update public.servicos_contratos_documentos d
  set
    accepted_at = coalesce(d.accepted_at, now()),
    accepted_nome = coalesce(d.accepted_nome, v_name),
    accepted_email = coalesce(d.accepted_email, v_email)
  where d.id = v_doc.id
  returning accepted_at into v_accepted;

  return jsonb_build_object('accepted_at', v_accepted);
end;
$$;

revoke all on function public.servicos_contratos_portal_accept(text, text, text) from public;
grant execute on function public.servicos_contratos_portal_accept(text, text, text) to anon, authenticated, service_role;

commit;
