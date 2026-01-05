/*
  OS-STA-04: Checklists por tipo de serviço (diagnóstico → execução → teste → entrega)

  Objetivo:
  - Permitir criar/checkar um checklist padronizado por "tipo de serviço" dentro da OS.
  - Reduz retrabalho e suporte: o sistema guia o técnico e mostra progresso.
  - Suportar "done automático" via regras simples (ex.: tem cliente? tem itens? tem anexos? OS concluída?).

  Notas:
  - Templates ficam em `public.os_checklist_templates` (por empresa) e itens por OS em `public.os_checklist_items`.
  - Templates default são inseridos apenas se não existirem (idempotente).
  - Regras automáticas são avaliadas pelo backend e respeitam `manual_override=true`.
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) Schema
-- -----------------------------------------------------------------------------
alter table public.ordem_servicos
  add column if not exists checklist_template_id uuid null;

create table if not exists public.os_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  slug text not null,
  titulo text not null,
  descricao text null,
  steps jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_os_checklist_templates_empresa_slug
  on public.os_checklist_templates (empresa_id, slug);

create index if not exists idx_os_checklist_templates_empresa_active
  on public.os_checklist_templates (empresa_id, active, updated_at desc);

drop trigger if exists tg_os_checklist_templates_set_updated_at on public.os_checklist_templates;
create trigger tg_os_checklist_templates_set_updated_at
before update on public.os_checklist_templates
for each row execute function public.tg_set_updated_at();

alter table public.os_checklist_templates enable row level security;

drop policy if exists sel_os_checklist_templates_by_empresa on public.os_checklist_templates;
create policy sel_os_checklist_templates_by_empresa
  on public.os_checklist_templates
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists ins_os_checklist_templates_by_empresa on public.os_checklist_templates;
create policy ins_os_checklist_templates_by_empresa
  on public.os_checklist_templates
  for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

drop policy if exists upd_os_checklist_templates_by_empresa on public.os_checklist_templates;
create policy upd_os_checklist_templates_by_empresa
  on public.os_checklist_templates
  for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists del_os_checklist_templates_by_empresa on public.os_checklist_templates;
create policy del_os_checklist_templates_by_empresa
  on public.os_checklist_templates
  for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

grant select, insert, update, delete on table public.os_checklist_templates to authenticated;

create table if not exists public.os_checklist_items (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  os_id uuid not null references public.ordem_servicos(id) on delete cascade,
  step_id text not null,
  pos int not null default 0,
  titulo text not null,
  descricao text null,
  auto_rule jsonb null,
  auto_done boolean not null default false,
  manual_override boolean not null default false,
  done boolean not null default false,
  done_at timestamptz null,
  done_by uuid null,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_os_checklist_items_os_step
  on public.os_checklist_items (os_id, step_id);

create index if not exists idx_os_checklist_items_os_pos
  on public.os_checklist_items (os_id, pos);

create index if not exists idx_os_checklist_items_empresa_os_done
  on public.os_checklist_items (empresa_id, os_id, done);

drop trigger if exists tg_os_checklist_items_set_updated_at on public.os_checklist_items;
create trigger tg_os_checklist_items_set_updated_at
before update on public.os_checklist_items
for each row execute function public.tg_set_updated_at();

alter table public.os_checklist_items enable row level security;

drop policy if exists sel_os_checklist_items_by_empresa on public.os_checklist_items;
create policy sel_os_checklist_items_by_empresa
  on public.os_checklist_items
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists ins_os_checklist_items_by_empresa on public.os_checklist_items;
create policy ins_os_checklist_items_by_empresa
  on public.os_checklist_items
  for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

drop policy if exists upd_os_checklist_items_by_empresa on public.os_checklist_items;
create policy upd_os_checklist_items_by_empresa
  on public.os_checklist_items
  for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists del_os_checklist_items_by_empresa on public.os_checklist_items;
create policy del_os_checklist_items_by_empresa
  on public.os_checklist_items
  for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

grant select, insert, update, delete on table public.os_checklist_items to authenticated;

-- -----------------------------------------------------------------------------
-- 2) Helpers: avaliação de regra automática
-- -----------------------------------------------------------------------------
drop function if exists public.os_checklist_eval_rule(uuid, jsonb);
create or replace function public.os_checklist_eval_rule(p_os_id uuid, p_rule jsonb)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
stable
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_type text := lower(coalesce(p_rule->>'type',''));
  v_value text := lower(coalesce(p_rule->>'value',''));
  v_field text := lower(coalesce(p_rule->>'field',''));
  v_exists boolean := false;
  v_os record;
begin
  if v_emp is null then
    return false;
  end if;

  select
    os.id,
    os.status::text as status,
    os.cliente_id,
    os.equipamento_id,
    os.data_prevista,
    os.data_inicio,
    os.descricao,
    os.orcamento_status
  into v_os
  from public.ordem_servicos os
  where os.id = p_os_id and os.empresa_id = v_emp;

  if v_os is null then
    return false;
  end if;

  if v_type = 'os_field_present' then
    return case
      when v_field = 'cliente_id' then v_os.cliente_id is not null
      when v_field = 'equipamento_id' then v_os.equipamento_id is not null
      when v_field = 'data_prevista' then v_os.data_prevista is not null
      when v_field = 'data_inicio' then v_os.data_inicio is not null
      when v_field = 'descricao' then nullif(btrim(coalesce(v_os.descricao,'')), '') is not null
      else false
    end;
  end if;

  if v_type = 'os_status_is' then
    return lower(coalesce(v_os.status,'')) = v_value;
  end if;

  if v_type = 'orcamento_status_is' then
    return lower(coalesce(v_os.orcamento_status::text,'')) = v_value;
  end if;

  if v_type = 'has_itens' then
    select exists(
      select 1
      from public.ordem_servico_itens i
      where i.empresa_id = v_emp and i.ordem_servico_id = p_os_id
      limit 1
    ) into v_exists;
    return coalesce(v_exists, false);
  end if;

  if v_type = 'has_os_docs' then
    select exists(
      select 1
      from public.os_docs d
      where d.empresa_id = v_emp and d.os_id = p_os_id
      limit 1
    ) into v_exists;
    return coalesce(v_exists, false);
  end if;

  if v_type = 'has_conta_a_receber' then
    return public.financeiro_conta_a_receber_from_os_get(p_os_id) is not null;
  end if;

  return false;
end;
$$;

revoke all on function public.os_checklist_eval_rule(uuid, jsonb) from public, anon;
grant execute on function public.os_checklist_eval_rule(uuid, jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) RPCs: templates, itens e recompute
-- -----------------------------------------------------------------------------
drop function if exists public.os_checklist_templates_list(text, int);
create or replace function public.os_checklist_templates_list(
  p_q text default null,
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
    select jsonb_agg(to_jsonb(t) order by t.titulo)
    from (
      select
        id,
        slug,
        titulo,
        descricao,
        steps,
        active,
        updated_at
      from public.os_checklist_templates
      where empresa_id = v_emp
        and active = true
        and (
          p_q is null
          or btrim(p_q) = ''
          or slug ilike ('%'||p_q||'%')
          or titulo ilike ('%'||p_q||'%')
        )
      limit greatest(1, least(coalesce(p_limit, 50), 200))
    ) t
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.os_checklist_templates_list(text, int) from public, anon;
grant execute on function public.os_checklist_templates_list(text, int) to authenticated, service_role;

drop function if exists public.os_checklist_get(uuid);
create or replace function public.os_checklist_get(p_os_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_tpl record;
  v_total int := 0;
  v_done int := 0;
begin
  perform public.require_plano_mvp_allows('servicos');
  perform public.require_permission_for_current_user('os','view');

  select
    t.id,
    t.slug,
    t.titulo,
    t.descricao
  into v_tpl
  from public.ordem_servicos os
  left join public.os_checklist_templates t
    on t.id = os.checklist_template_id
   and t.empresa_id = v_emp
  where os.empresa_id = v_emp
    and os.id = p_os_id;

  select count(*) filter (where archived_at is null), count(*) filter (where archived_at is null and done = true)
  into v_total, v_done
  from public.os_checklist_items i
  where i.empresa_id = v_emp and i.os_id = p_os_id;

  return jsonb_build_object(
    'template', case when v_tpl.id is null then null else jsonb_build_object('id', v_tpl.id, 'slug', v_tpl.slug, 'titulo', v_tpl.titulo, 'descricao', v_tpl.descricao) end,
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
          i.auto_rule,
          i.auto_done,
          i.manual_override,
          i.done,
          i.done_at
        from public.os_checklist_items i
        where i.empresa_id = v_emp
          and i.os_id = p_os_id
          and i.archived_at is null
        order by i.pos asc
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.os_checklist_get(uuid) from public, anon;
grant execute on function public.os_checklist_get(uuid) to authenticated, service_role;

drop function if exists public.os_checklist_set_template(uuid, text);
create or replace function public.os_checklist_set_template(
  p_os_id uuid,
  p_template_slug text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_tpl public.os_checklist_templates;
begin
  perform public.require_plano_mvp_allows('servicos');
  perform public.require_permission_for_current_user('os','update');

  select * into v_tpl
  from public.os_checklist_templates t
  where t.empresa_id = v_emp
    and t.active = true
    and t.slug = nullif(btrim(p_template_slug), '')
  limit 1;

  if v_tpl.id is null then
    raise exception '[RPC][OS][CHECKLIST] Template inválido' using errcode = 'P0002';
  end if;

  update public.ordem_servicos os
     set checklist_template_id = v_tpl.id,
         updated_at = now()
   where os.empresa_id = v_emp
     and os.id = p_os_id;

  if not found then
    raise exception '[RPC][OS][CHECKLIST] OS não encontrada' using errcode = 'P0002';
  end if;

  -- Arquiva itens antigos que não existem mais no template
  update public.os_checklist_items i
     set archived_at = now()
   where i.empresa_id = v_emp
     and i.os_id = p_os_id
     and i.archived_at is null
     and not exists (
       select 1
       from jsonb_array_elements(v_tpl.steps) s
       where nullif(btrim(s->>'id'), '') = i.step_id
     );

  -- Upsert dos itens do template
  insert into public.os_checklist_items (
    empresa_id,
    os_id,
    step_id,
    pos,
    titulo,
    descricao,
    auto_rule,
    manual_override,
    done,
    done_at,
    done_by,
    archived_at
  )
  select
    v_emp,
    p_os_id,
    nullif(btrim(s->>'id'), ''),
    coalesce((s->>'pos')::int, 0),
    coalesce(nullif(btrim(s->>'title'), ''), nullif(btrim(s->>'titulo'), ''), 'Etapa'),
    nullif(btrim(coalesce(s->>'description', s->>'descricao', '')), ''),
    case when (s ? 'auto_rule') then s->'auto_rule' else null end,
    false,
    false,
    null,
    null,
    null
  from jsonb_array_elements(v_tpl.steps) s
  where nullif(btrim(s->>'id'), '') is not null
  on conflict (os_id, step_id) do update
    set pos = excluded.pos,
        titulo = excluded.titulo,
        descricao = excluded.descricao,
        auto_rule = excluded.auto_rule,
        archived_at = null;

  perform public.os_checklist_recompute(p_os_id);
end;
$$;

revoke all on function public.os_checklist_set_template(uuid, text) from public, anon;
grant execute on function public.os_checklist_set_template(uuid, text) to authenticated, service_role;

drop function if exists public.os_checklist_toggle(uuid, text, boolean);
create or replace function public.os_checklist_toggle(
  p_os_id uuid,
  p_step_id text,
  p_done boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_now timestamptz := now();
begin
  perform public.require_plano_mvp_allows('servicos');
  perform public.require_permission_for_current_user('os','update');

  update public.os_checklist_items i
     set done = coalesce(p_done, false),
         done_at = case when coalesce(p_done, false) = true then coalesce(i.done_at, v_now) else null end,
         done_by = case when coalesce(p_done, false) = true then auth.uid() else null end,
         manual_override = true,
         auto_done = false,
         updated_at = v_now
   where i.empresa_id = v_emp
     and i.os_id = p_os_id
     and i.step_id = nullif(btrim(p_step_id), '')
     and i.archived_at is null;

  if not found then
    raise exception '[RPC][OS][CHECKLIST] Item não encontrado' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.os_checklist_toggle(uuid, text, boolean) from public, anon;
grant execute on function public.os_checklist_toggle(uuid, text, boolean) to authenticated, service_role;

drop function if exists public.os_checklist_recompute(uuid);
create or replace function public.os_checklist_recompute(p_os_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  r record;
  v_eval boolean;
  v_now timestamptz := now();
begin
  if v_emp is null then
    return;
  end if;

  -- Não exige permissão: pode ser chamado por triggers (ainda respeita empresa atual via RLS helper)
  for r in
    select
      i.id,
      i.done,
      i.auto_rule
    from public.os_checklist_items i
    where i.empresa_id = v_emp
      and i.os_id = p_os_id
      and i.archived_at is null
      and i.auto_rule is not null
      and i.manual_override = false
  loop
    v_eval := public.os_checklist_eval_rule(p_os_id, r.auto_rule);

    if v_eval is distinct from r.done then
      update public.os_checklist_items i
         set done = v_eval,
             auto_done = v_eval,
             done_at = case when v_eval = true then coalesce(i.done_at, v_now) else null end,
             done_by = null,
             updated_at = v_now
       where i.id = r.id;
    end if;
  end loop;
end;
$$;

revoke all on function public.os_checklist_recompute(uuid) from public, anon;
grant execute on function public.os_checklist_recompute(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) Auto-recompute (triggers leves)
-- -----------------------------------------------------------------------------
drop function if exists public.os_checklist_recompute_trigger();
create or replace function public.os_checklist_recompute_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_table_name = 'ordem_servicos' then
    perform public.os_checklist_recompute(coalesce(new.id, old.id));
  elsif tg_table_name = 'os_docs' then
    perform public.os_checklist_recompute(coalesce(new.os_id, old.os_id));
  elsif tg_table_name = 'os_orcamento_eventos' then
    perform public.os_checklist_recompute(coalesce(new.os_id, old.os_id));
  elsif tg_table_name = 'contas_a_receber' then
    if coalesce(new.origem_tipo, old.origem_tipo) = 'OS' then
      perform public.os_checklist_recompute(coalesce(new.origem_id, old.origem_id));
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

do $$
begin
  execute 'drop trigger if exists tg_os_checklist_recompute_on_os on public.ordem_servicos';
  execute 'create trigger tg_os_checklist_recompute_on_os after insert or update on public.ordem_servicos for each row execute function public.os_checklist_recompute_trigger()';

  if to_regclass('public.os_docs') is not null then
    execute 'drop trigger if exists tg_os_checklist_recompute_on_docs on public.os_docs';
    execute 'create trigger tg_os_checklist_recompute_on_docs after insert or update or delete on public.os_docs for each row execute function public.os_checklist_recompute_trigger()';
  end if;

  if to_regclass('public.os_orcamento_eventos') is not null then
    execute 'drop trigger if exists tg_os_checklist_recompute_on_orcamento on public.os_orcamento_eventos';
    execute 'create trigger tg_os_checklist_recompute_on_orcamento after insert on public.os_orcamento_eventos for each row execute function public.os_checklist_recompute_trigger()';
  end if;

  if to_regclass('public.contas_a_receber') is not null then
    execute 'drop trigger if exists tg_os_checklist_recompute_on_contas on public.contas_a_receber';
    execute 'create trigger tg_os_checklist_recompute_on_contas after insert or update on public.contas_a_receber for each row execute function public.os_checklist_recompute_trigger()';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) Templates default (idempotente)
-- -----------------------------------------------------------------------------
insert into public.os_checklist_templates (empresa_id, slug, titulo, descricao, steps, active)
select
  public.current_empresa_id(),
  'assistencia_tecnica',
  'Assistência técnica',
  'Fluxo padrão para diagnóstico, execução, teste e entrega.',
  jsonb_build_array(
    jsonb_build_object('id','cadastro_base','pos',10,'title','Registrar cliente e equipamento','description','Vincule o cliente e o equipamento para rastreabilidade.','auto_rule',jsonb_build_object('type','os_field_present','field','cliente_id')),
    jsonb_build_object('id','itens_orcamento','pos',20,'title','Adicionar itens/serviços','description','Inclua peças e serviços para formar o orçamento.','auto_rule',jsonb_build_object('type','has_itens')),
    jsonb_build_object('id','enviar_orc','pos',30,'title','Marcar orçamento como enviado','description','Registre que o orçamento foi enviado ao cliente.','auto_rule',jsonb_build_object('type','orcamento_status_is','value','sent')),
    jsonb_build_object('id','aceite','pos',40,'title','Registrar aceite do cliente','description','Aprovar ou reprovar com evidência (OS-STA-03).','auto_rule',jsonb_build_object('type','orcamento_status_is','value','approved')),
    jsonb_build_object('id','anexos','pos',50,'title','Anexar evidências (fotos/laudos)','description','Envie fotos ou laudo técnico (Storage).','auto_rule',jsonb_build_object('type','has_os_docs')),
    jsonb_build_object('id','finalizar','pos',60,'title','Concluir OS','description','Ao finalizar o serviço, marque a OS como concluída.','auto_rule',jsonb_build_object('type','os_status_is','value','concluida'))
  ),
  true
where public.current_empresa_id() is not null
  and not exists (
    select 1
    from public.os_checklist_templates t
    where t.empresa_id = public.current_empresa_id()
      and t.slug = 'assistencia_tecnica'
  );

insert into public.os_checklist_templates (empresa_id, slug, titulo, descricao, steps, active)
select
  public.current_empresa_id(),
  'instalacao',
  'Instalação',
  'Fluxo padrão para serviços de instalação.',
  jsonb_build_array(
    jsonb_build_object('id','cadastro_base','pos',10,'title','Confirmar cliente e data','description','Vincule cliente e defina data prevista.','auto_rule',jsonb_build_object('type','os_field_present','field','cliente_id')),
    jsonb_build_object('id','agenda','pos',20,'title','Definir data prevista','description','Agende a instalação para organizar a fila.','auto_rule',jsonb_build_object('type','os_field_present','field','data_prevista')),
    jsonb_build_object('id','execucao','pos',30,'title','Executar instalação','description','Registre o que foi feito e anexos relevantes.','auto_rule',jsonb_build_object('type','has_os_docs')),
    jsonb_build_object('id','concluir','pos',40,'title','Concluir OS','description','Finalize o serviço e avance para financeiro se necessário.','auto_rule',jsonb_build_object('type','os_status_is','value','concluida')),
    jsonb_build_object('id','financeiro','pos',50,'title','Gerar conta a receber (se aplicável)','description','Crie a conta a receber vinculada à OS.','auto_rule',jsonb_build_object('type','has_conta_a_receber'))
  ),
  true
where public.current_empresa_id() is not null
  and not exists (
    select 1
    from public.os_checklist_templates t
    where t.empresa_id = public.current_empresa_id()
      and t.slug = 'instalacao'
  );

select pg_notify('pgrst','reload schema');

commit;

