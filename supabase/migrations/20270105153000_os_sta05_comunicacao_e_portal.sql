/*
  OS-STA-05: Comunicação (WhatsApp/e-mail) com templates + log + portal simples do cliente

  Objetivo:
  - Padronizar mensagens (templates) e registrar o histórico de comunicação por OS.
  - Portal simples e seguro (link com token) para o cliente acompanhar status + checklist e enviar mensagem.

  Decisão:
  - Não envia mensagens automaticamente (sem integrações externas). O sistema:
    - gera texto pronto (copy)
    - cria links (wa.me / mailto)
    - registra o envio no log (auditável)
  - Portal: acesso somente via token (hash em DB), sem autenticação.
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) Templates + Logs
-- -----------------------------------------------------------------------------
create table if not exists public.os_comms_templates (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  slug text not null,
  canal text not null check (canal in ('whatsapp','email')),
  titulo text not null,
  assunto text null,
  corpo text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_os_comms_templates_empresa_slug
  on public.os_comms_templates (empresa_id, slug);

create index if not exists idx_os_comms_templates_empresa_active
  on public.os_comms_templates (empresa_id, active, updated_at desc);

drop trigger if exists tg_os_comms_templates_set_updated_at on public.os_comms_templates;
create trigger tg_os_comms_templates_set_updated_at
before update on public.os_comms_templates
for each row execute function public.tg_set_updated_at();

alter table public.os_comms_templates enable row level security;

drop policy if exists sel_os_comms_templates_by_empresa on public.os_comms_templates;
create policy sel_os_comms_templates_by_empresa
  on public.os_comms_templates
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists ins_os_comms_templates_by_empresa on public.os_comms_templates;
create policy ins_os_comms_templates_by_empresa
  on public.os_comms_templates
  for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

drop policy if exists upd_os_comms_templates_by_empresa on public.os_comms_templates;
create policy upd_os_comms_templates_by_empresa
  on public.os_comms_templates
  for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists del_os_comms_templates_by_empresa on public.os_comms_templates;
create policy del_os_comms_templates_by_empresa
  on public.os_comms_templates
  for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

grant select, insert, update, delete on table public.os_comms_templates to authenticated;

create table if not exists public.os_comms_logs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  os_id uuid not null references public.ordem_servicos(id) on delete cascade,
  direction text not null check (direction in ('outbound','inbound')),
  canal text not null check (canal in ('whatsapp','email','portal','nota')),
  to_value text null,
  assunto text null,
  corpo text not null,
  template_slug text null,
  actor_user_id uuid null default auth.uid(),
  actor_email text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_os_comms_logs_empresa_os_created
  on public.os_comms_logs (empresa_id, os_id, created_at desc);

alter table public.os_comms_logs enable row level security;

drop policy if exists sel_os_comms_logs_by_empresa on public.os_comms_logs;
create policy sel_os_comms_logs_by_empresa
  on public.os_comms_logs
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists ins_os_comms_logs_by_empresa on public.os_comms_logs;
create policy ins_os_comms_logs_by_empresa
  on public.os_comms_logs
  for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

grant select, insert on table public.os_comms_logs to authenticated;

-- -----------------------------------------------------------------------------
-- 2) Portal tokens
-- -----------------------------------------------------------------------------
create table if not exists public.os_portal_tokens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  os_id uuid not null references public.ordem_servicos(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  created_by uuid null default auth.uid()
);

create index if not exists idx_os_portal_tokens_hash
  on public.os_portal_tokens (token_hash);

create index if not exists idx_os_portal_tokens_os_created
  on public.os_portal_tokens (os_id, created_at desc);

alter table public.os_portal_tokens enable row level security;

drop policy if exists sel_os_portal_tokens_by_empresa on public.os_portal_tokens;
create policy sel_os_portal_tokens_by_empresa
  on public.os_portal_tokens
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists ins_os_portal_tokens_by_empresa on public.os_portal_tokens;
create policy ins_os_portal_tokens_by_empresa
  on public.os_portal_tokens
  for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

grant select, insert on table public.os_portal_tokens to authenticated;

-- -----------------------------------------------------------------------------
-- 3) RPCs (app)
-- -----------------------------------------------------------------------------
drop function if exists public.os_comms_templates_list(text, int);
create or replace function public.os_comms_templates_list(
  p_canal text default null,
  p_limit int default 100
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
  perform public.require_permission_for_current_user('os','view');

  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.titulo)
    from (
      select id, slug, canal, titulo, assunto, corpo, active
      from public.os_comms_templates
      where empresa_id = v_emp
        and active = true
        and (p_canal is null or btrim(p_canal) = '' or canal = lower(p_canal))
      limit greatest(1, least(coalesce(p_limit, 100), 200))
    ) t
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.os_comms_templates_list(text, int) from public, anon;
grant execute on function public.os_comms_templates_list(text, int) to authenticated, service_role;

drop function if exists public.os_comms_logs_list(uuid, int);
create or replace function public.os_comms_logs_list(
  p_os_id uuid,
  p_limit int default 50
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
  perform public.require_permission_for_current_user('os','view');

  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (
      select
        id,
        direction,
        canal,
        to_value,
        assunto,
        corpo,
        template_slug,
        actor_email,
        created_at
      from public.os_comms_logs
      where empresa_id = v_emp and os_id = p_os_id
      order by created_at desc
      limit greatest(1, least(coalesce(p_limit, 50), 200))
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.os_comms_logs_list(uuid, int) from public, anon;
grant execute on function public.os_comms_logs_list(uuid, int) to authenticated, service_role;

drop function if exists public.os_comms_log_register(uuid, text, text, text, text, text);
create or replace function public.os_comms_log_register(
  p_os_id uuid,
  p_canal text,
  p_to_value text,
  p_assunto text,
  p_corpo text,
  p_template_slug text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_email text := nullif(auth.email(), '');
  v_id uuid;
  v_canal text := lower(coalesce(nullif(btrim(p_canal), ''), 'nota'));
begin
  perform public.require_plano_mvp_allows('servicos');
  perform public.require_permission_for_current_user('os','update');

  if v_canal not in ('whatsapp','email','nota') then
    raise exception '[RPC][OS][COMMS] canal inválido' using errcode = '22023';
  end if;

  insert into public.os_comms_logs (
    empresa_id,
    os_id,
    direction,
    canal,
    to_value,
    assunto,
    corpo,
    template_slug,
    actor_user_id,
    actor_email
  )
  values (
    v_emp,
    p_os_id,
    'outbound',
    v_canal,
    nullif(btrim(p_to_value), ''),
    nullif(btrim(p_assunto), ''),
    coalesce(nullif(btrim(p_corpo), ''), ''),
    nullif(btrim(p_template_slug), ''),
    auth.uid(),
    v_email
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.os_comms_log_register(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.os_comms_log_register(uuid, text, text, text, text, text) to authenticated, service_role;

drop function if exists public.os_portal_link_create(uuid, int);
create or replace function public.os_portal_link_create(
  p_os_id uuid,
  p_expires_in_days int default 30
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_email text := nullif(auth.email(), '');
  v_token text;
  v_hash text;
  v_days int := greatest(1, least(coalesce(p_expires_in_days, 30), 365));
  v_expires timestamptz := now() + (v_days || ' days')::interval;
begin
  perform public.require_plano_mvp_allows('servicos');
  perform public.require_permission_for_current_user('os','update');

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');

  insert into public.os_portal_tokens (empresa_id, os_id, token_hash, expires_at, revoked_at, created_by)
  values (v_emp, p_os_id, v_hash, v_expires, null, auth.uid());

  return jsonb_build_object(
    'token', v_token,
    'token_hash', v_hash,
    'expires_at', v_expires,
    'path', '/portal/os/' || v_token
  );
end;
$$;

revoke all on function public.os_portal_link_create(uuid, int) from public, anon;
grant execute on function public.os_portal_link_create(uuid, int) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) Portal RPCs (anon)
-- -----------------------------------------------------------------------------
drop function if exists public.os_portal_get(text);
create or replace function public.os_portal_get(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hash text := encode(digest(coalesce(p_token,''), 'sha256'), 'hex');
  v_tok record;
  v_os record;
  v_total int := 0;
  v_done int := 0;
begin
  if length(coalesce(p_token,'')) < 20 then
    raise exception '[PORTAL][OS] token inválido' using errcode='22023';
  end if;

  select
    t.empresa_id,
    t.os_id,
    t.expires_at,
    t.revoked_at
  into v_tok
  from public.os_portal_tokens t
  where t.token_hash = v_hash
  order by t.created_at desc
  limit 1;

  if v_tok is null then
    raise exception '[PORTAL][OS] token não encontrado' using errcode='P0002';
  end if;

  if v_tok.revoked_at is not null then
    raise exception '[PORTAL][OS] token revogado' using errcode='42501';
  end if;

  if v_tok.expires_at is not null and v_tok.expires_at < now() then
    raise exception '[PORTAL][OS] token expirado' using errcode='42501';
  end if;

  select
    os.id,
    os.numero,
    os.status::text as status,
    os.descricao,
    os.data_prevista,
    os.updated_at
  into v_os
  from public.ordem_servicos os
  where os.id = v_tok.os_id and os.empresa_id = v_tok.empresa_id;

  if v_os is null then
    raise exception '[PORTAL][OS] OS não encontrada' using errcode='P0002';
  end if;

  select count(*) filter (where archived_at is null), count(*) filter (where archived_at is null and done = true)
  into v_total, v_done
  from public.os_checklist_items i
  where i.empresa_id = v_tok.empresa_id and i.os_id = v_tok.os_id;

  return jsonb_build_object(
    'os', jsonb_build_object(
      'id', v_os.id,
      'numero', v_os.numero,
      'status', v_os.status,
      'descricao', v_os.descricao,
      'data_prevista', v_os.data_prevista,
      'updated_at', v_os.updated_at
    ),
    'checklist', jsonb_build_object(
      'progress', jsonb_build_object(
        'total', coalesce(v_total, 0),
        'done', coalesce(v_done, 0),
        'pct', case when coalesce(v_total, 0) = 0 then 0 else round((v_done::numeric / v_total::numeric) * 100, 0) end
      ),
      'items', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.pos asc)
        from (
          select
            i.step_id,
            i.pos,
            i.titulo,
            i.descricao,
            i.done,
            i.done_at
          from public.os_checklist_items i
          where i.empresa_id = v_tok.empresa_id
            and i.os_id = v_tok.os_id
            and i.archived_at is null
          order by i.pos asc
        ) x
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.os_portal_get(text) from public;
grant execute on function public.os_portal_get(text) to anon, authenticated, service_role;

drop function if exists public.os_portal_message_create(text, text, text);
create or replace function public.os_portal_message_create(
  p_token text,
  p_nome text,
  p_mensagem text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hash text := encode(digest(coalesce(p_token,''), 'sha256'), 'hex');
  v_tok record;
  v_name text := nullif(btrim(p_nome), '');
  v_msg text := nullif(btrim(p_mensagem), '');
begin
  if v_name is null or v_msg is null then
    raise exception '[PORTAL][OS] campos obrigatórios' using errcode='23514';
  end if;

  select
    t.empresa_id,
    t.os_id,
    t.expires_at,
    t.revoked_at
  into v_tok
  from public.os_portal_tokens t
  where t.token_hash = v_hash
  order by t.created_at desc
  limit 1;

  if v_tok is null then
    raise exception '[PORTAL][OS] token não encontrado' using errcode='P0002';
  end if;
  if v_tok.revoked_at is not null then
    raise exception '[PORTAL][OS] token revogado' using errcode='42501';
  end if;
  if v_tok.expires_at is not null and v_tok.expires_at < now() then
    raise exception '[PORTAL][OS] token expirado' using errcode='42501';
  end if;

  insert into public.os_comms_logs (
    empresa_id,
    os_id,
    direction,
    canal,
    to_value,
    assunto,
    corpo,
    template_slug,
    actor_user_id,
    actor_email
  )
  values (
    v_tok.empresa_id,
    v_tok.os_id,
    'inbound',
    'portal',
    v_name,
    null,
    v_msg,
    null,
    null,
    null
  );
end;
$$;

revoke all on function public.os_portal_message_create(text, text, text) from public;
grant execute on function public.os_portal_message_create(text, text, text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5) Templates default (idempotente)
-- -----------------------------------------------------------------------------
insert into public.os_comms_templates (empresa_id, slug, canal, titulo, assunto, corpo, active)
select
  public.current_empresa_id(),
  'os_status_update_whatsapp',
  'whatsapp',
  'Atualização de status (WhatsApp)',
  null,
  'Olá! Aqui é da Revo.\n\nSobre a OS #{{os_numero}}: {{os_descricao}}\nStatus atual: {{os_status_label}}.\n\nQualquer dúvida, responda por aqui.',
  true
where public.current_empresa_id() is not null
  and not exists (
    select 1
    from public.os_comms_templates t
    where t.empresa_id = public.current_empresa_id()
      and t.slug = 'os_status_update_whatsapp'
  );

insert into public.os_comms_templates (empresa_id, slug, canal, titulo, assunto, corpo, active)
select
  public.current_empresa_id(),
  'os_budget_sent_whatsapp',
  'whatsapp',
  'Orçamento enviado (WhatsApp)',
  null,
  'Olá! Enviamos o orçamento da OS #{{os_numero}}.\n\nAssim que aprovar, seguimos com a execução.\n\nLink do acompanhamento: {{portal_url}}',
  true
where public.current_empresa_id() is not null
  and not exists (
    select 1
    from public.os_comms_templates t
    where t.empresa_id = public.current_empresa_id()
      and t.slug = 'os_budget_sent_whatsapp'
  );

insert into public.os_comms_templates (empresa_id, slug, canal, titulo, assunto, corpo, active)
select
  public.current_empresa_id(),
  'os_ready_email',
  'email',
  'OS pronta (e-mail)',
  'OS #{{os_numero}} pronta',
  'Olá,\n\nSua OS #{{os_numero}} está pronta.\n\nVocê pode acompanhar o status e checklist aqui:\n{{portal_url}}\n\nAtenciosamente,\nRevo',
  true
where public.current_empresa_id() is not null
  and not exists (
    select 1
    from public.os_comms_templates t
    where t.empresa_id = public.current_empresa_id()
      and t.slug = 'os_ready_email'
  );

select pg_notify('pgrst','reload schema');

commit;

