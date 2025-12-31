/*
  CRM-01/02 + AUTO-01 + GL-02/03 (MVP “bem feito”)

  - CRM-01: Etapas configuráveis + atividades/anotações por oportunidade
  - CRM-02: Conversão oportunidade -> pedido (link rastreável)
  - AUTO-01: Automações (Vendas) com validação + fila + worker via GitHub Actions
  - GL-02: Suporte a backup/restore (docs/workflows já existentes; este SQL só prepara base necessária)
  - GL-03: Hardening mínimo para novas entidades (RLS FORCE + RPCs com permission guard)
*/

begin;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- CRM: atividades/anotações (CRM-01)
-- -----------------------------------------------------------------------------
create table if not exists public.crm_atividades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  oportunidade_id uuid not null references public.crm_oportunidades(id) on delete cascade,
  tipo text not null default 'nota' check (tipo in ('nota','tarefa','ligacao','email','whatsapp')),
  titulo text,
  descricao text,
  due_at timestamptz,
  done_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_crm_atividades_empresa_oportunidade
  on public.crm_atividades(empresa_id, oportunidade_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'tg_crm_atividades_updated_at'
      and tgrelid = 'public.crm_atividades'::regclass
  ) then
    create trigger tg_crm_atividades_updated_at
      before update on public.crm_atividades
      for each row execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

alter table public.crm_atividades enable row level security;
alter table public.crm_atividades force row level security;

drop policy if exists crm_atividades_all on public.crm_atividades;
create policy crm_atividades_all
  on public.crm_atividades
  for all
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

-- Hardening: garantir FORCE nos objetos do CRM existentes também (GL-03)
do $$
begin
  if to_regclass('public.crm_funis') is not null then
    execute 'alter table public.crm_funis force row level security';
  end if;
  if to_regclass('public.crm_etapas') is not null then
    execute 'alter table public.crm_etapas force row level security';
  end if;
  if to_regclass('public.crm_oportunidades') is not null then
    execute 'alter table public.crm_oportunidades force row level security';
  end if;
end;
$$;

-- RPC: pipeline config (etapas configuráveis)
drop function if exists public.crm_get_pipeline_config(uuid);
create or replace function public.crm_get_pipeline_config(p_funil_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_funil_id uuid := p_funil_id;
begin
  perform public.require_permission_for_current_user('crm','view');

  if v_funil_id is null then
    select id into v_funil_id
      from public.crm_funis
     where empresa_id = v_empresa and padrao = true
     limit 1;
  end if;

  if v_funil_id is null then
    return jsonb_build_object('funil_id', null, 'funil', null, 'etapas', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'funil_id', v_funil_id,
    'funil', (
      select jsonb_build_object(
        'id', f.id,
        'nome', f.nome,
        'descricao', f.descricao,
        'padrao', f.padrao,
        'ativo', f.ativo
      )
      from public.crm_funis f
      where f.id = v_funil_id and f.empresa_id = v_empresa
    ),
    'etapas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id,
        'nome', e.nome,
        'ordem', e.ordem,
        'cor', e.cor,
        'probabilidade', e.probabilidade
      ) order by e.ordem), '[]'::jsonb)
      from public.crm_etapas e
      where e.funil_id = v_funil_id and e.empresa_id = v_empresa
    )
  );
end;
$$;
revoke all on function public.crm_get_pipeline_config(uuid) from public;
grant execute on function public.crm_get_pipeline_config(uuid) to authenticated, service_role;

drop function if exists public.crm_upsert_etapa(jsonb);
create or replace function public.crm_upsert_etapa(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid;
  v_funil uuid;
  v_nome text;
  v_ordem int;
  v_prob int;
  v_cor text;
begin
  perform public.require_permission_for_current_user('crm','manage');

  v_funil := (p_payload->>'funil_id')::uuid;
  v_nome := nullif(btrim(p_payload->>'nome'), '');
  v_ordem := coalesce((p_payload->>'ordem')::int, 0);
  v_prob := greatest(0, least(100, coalesce((p_payload->>'probabilidade')::int, 0)));
  v_cor := nullif(btrim(p_payload->>'cor'), '');

  if v_funil is null then
    raise exception 'funil_id é obrigatório';
  end if;
  if v_nome is null then
    raise exception 'nome é obrigatório';
  end if;

  if p_payload->>'id' is not null then
    update public.crm_etapas
       set nome = v_nome,
           ordem = v_ordem,
           probabilidade = v_prob,
           cor = v_cor,
           updated_at = now()
     where id = (p_payload->>'id')::uuid
       and empresa_id = v_empresa
       and funil_id = v_funil
     returning id into v_id;
  else
    insert into public.crm_etapas (empresa_id, funil_id, nome, ordem, cor, probabilidade)
    values (v_empresa, v_funil, v_nome, v_ordem, v_cor, v_prob)
    returning id into v_id;
  end if;

  if v_id is null then
    raise exception 'Etapa não encontrada';
  end if;
  return v_id;
end;
$$;
revoke all on function public.crm_upsert_etapa(jsonb) from public;
grant execute on function public.crm_upsert_etapa(jsonb) to authenticated, service_role;

drop function if exists public.crm_delete_etapa(uuid);
create or replace function public.crm_delete_etapa(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  perform public.require_permission_for_current_user('crm','manage');

  delete from public.crm_etapas
   where id = p_id
     and empresa_id = v_empresa;
end;
$$;
revoke all on function public.crm_delete_etapa(uuid) from public;
grant execute on function public.crm_delete_etapa(uuid) to authenticated, service_role;

drop function if exists public.crm_reorder_etapas(uuid, uuid[]);
create or replace function public.crm_reorder_etapas(p_funil_id uuid, p_etapa_ids uuid[])
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid;
  v_ordem int := 1;
begin
  perform public.require_permission_for_current_user('crm','manage');

  if p_funil_id is null then
    raise exception 'funil_id é obrigatório';
  end if;

  foreach v_id in array coalesce(p_etapa_ids, array[]::uuid[]) loop
    update public.crm_etapas
       set ordem = v_ordem,
           updated_at = now()
     where id = v_id
       and funil_id = p_funil_id
       and empresa_id = v_empresa;
    v_ordem := v_ordem + 1;
  end loop;
end;
$$;
revoke all on function public.crm_reorder_etapas(uuid, uuid[]) from public;
grant execute on function public.crm_reorder_etapas(uuid, uuid[]) to authenticated, service_role;

-- RPC: atividades
drop function if exists public.crm_list_atividades(uuid);
create or replace function public.crm_list_atividades(p_oportunidade_id uuid)
returns table (
  id uuid,
  tipo text,
  titulo text,
  descricao text,
  due_at timestamptz,
  done_at timestamptz,
  created_at timestamptz,
  created_by uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  perform public.require_permission_for_current_user('crm','view');

  return query
  select
    a.id, a.tipo, a.titulo, a.descricao, a.due_at, a.done_at, a.created_at, a.created_by
  from public.crm_atividades a
  where a.empresa_id = v_empresa
    and a.oportunidade_id = p_oportunidade_id
  order by a.created_at desc;
end;
$$;
revoke all on function public.crm_list_atividades(uuid) from public;
grant execute on function public.crm_list_atividades(uuid) to authenticated, service_role;

drop function if exists public.crm_upsert_atividade(jsonb);
create or replace function public.crm_upsert_atividade(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid;
  v_oportunidade uuid := (p_payload->>'oportunidade_id')::uuid;
  v_tipo text := lower(coalesce(nullif(btrim(p_payload->>'tipo'),''), 'nota'));
  v_titulo text := nullif(btrim(p_payload->>'titulo'), '');
  v_desc text := nullif(btrim(p_payload->>'descricao'), '');
  v_due timestamptz := nullif(p_payload->>'due_at','')::timestamptz;
begin
  perform public.require_permission_for_current_user('crm','update');

  if v_oportunidade is null then
    raise exception 'oportunidade_id é obrigatório';
  end if;

  if v_tipo not in ('nota','tarefa','ligacao','email','whatsapp') then
    v_tipo := 'nota';
  end if;

  if p_payload->>'id' is not null then
    update public.crm_atividades set
      tipo = v_tipo,
      titulo = v_titulo,
      descricao = v_desc,
      due_at = v_due,
      updated_at = now()
    where id = (p_payload->>'id')::uuid
      and empresa_id = v_empresa
      and oportunidade_id = v_oportunidade
    returning id into v_id;
  else
    insert into public.crm_atividades (
      empresa_id, oportunidade_id, tipo, titulo, descricao, due_at, created_by
    ) values (
      v_empresa, v_oportunidade, v_tipo, v_titulo, v_desc, v_due, auth.uid()
    )
    returning id into v_id;
  end if;

  if v_id is null then
    raise exception 'Atividade não encontrada';
  end if;
  return v_id;
end;
$$;
revoke all on function public.crm_upsert_atividade(jsonb) from public;
grant execute on function public.crm_upsert_atividade(jsonb) to authenticated, service_role;

drop function if exists public.crm_mark_atividade_done(uuid, boolean);
create or replace function public.crm_mark_atividade_done(p_id uuid, p_done boolean default true)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  perform public.require_permission_for_current_user('crm','update');

  update public.crm_atividades
     set done_at = case when coalesce(p_done,true) then now() else null end,
         updated_at = now()
   where id = p_id
     and empresa_id = v_empresa;
end;
$$;
revoke all on function public.crm_mark_atividade_done(uuid, boolean) from public;
grant execute on function public.crm_mark_atividade_done(uuid, boolean) to authenticated, service_role;

drop function if exists public.crm_delete_atividade(uuid);
create or replace function public.crm_delete_atividade(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  perform public.require_permission_for_current_user('crm','delete');

  delete from public.crm_atividades
   where id = p_id
     and empresa_id = v_empresa;
end;
$$;
revoke all on function public.crm_delete_atividade(uuid) from public;
grant execute on function public.crm_delete_atividade(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- CRM-02: Conversão oportunidade -> pedido
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.vendas_pedidos') is not null then
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='vendas_pedidos' and column_name='crm_oportunidade_id'
    ) then
      alter table public.vendas_pedidos
        add column crm_oportunidade_id uuid;
    end if;

    begin
      alter table public.vendas_pedidos
        add constraint vendas_pedidos_crm_oportunidade_fkey
        foreign key (crm_oportunidade_id) references public.crm_oportunidades(id) on delete set null;
    exception when duplicate_object then
      null;
    end;

    create index if not exists idx_vendas_pedidos_empresa_crm_oportunidade
      on public.vendas_pedidos(empresa_id, crm_oportunidade_id);
  end if;
end;
$$;

drop function if exists public.crm_convert_oportunidade_to_pedido(uuid);
create or replace function public.crm_convert_oportunidade_to_pedido(p_oportunidade_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_op record;
  v_pedido_id uuid;
  v_obs text;
begin
  perform public.require_permission_for_current_user('crm','update');
  perform public.require_permission_for_current_user('vendas','create');

  select o.id, o.cliente_id, o.titulo, o.valor
    into v_op
  from public.crm_oportunidades o
  where o.id = p_oportunidade_id
    and o.empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'Oportunidade não encontrada';
  end if;

  if v_op.cliente_id is null then
    raise exception 'Defina um cliente na oportunidade antes de converter em pedido';
  end if;

  select p.id into v_pedido_id
  from public.vendas_pedidos p
  where p.empresa_id = v_empresa
    and p.crm_oportunidade_id = v_op.id
  limit 1;

  if v_pedido_id is not null then
    return v_pedido_id;
  end if;

  v_obs := left('Gerado a partir do CRM: ' || coalesce(v_op.titulo,'(sem título)'), 250);

  insert into public.vendas_pedidos (
    empresa_id, cliente_id, status, observacoes, crm_oportunidade_id
  ) values (
    v_empresa, v_op.cliente_id, 'orcamento', v_obs, v_op.id
  )
  returning id into v_pedido_id;

  return v_pedido_id;
end;
$$;
revoke all on function public.crm_convert_oportunidade_to_pedido(uuid) from public;
grant execute on function public.crm_convert_oportunidade_to_pedido(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- AUTO-01: fila + execuções (worker)
-- -----------------------------------------------------------------------------
create table if not exists public.vendas_automacao_jobs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  automacao_id uuid not null references public.vendas_automacoes(id) on delete cascade,
  gatilho text not null,
  entity_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','done','failed','dead')),
  attempts int not null default 0,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vendas_automacao_jobs_status_run_after
  on public.vendas_automacao_jobs(status, run_after, created_at);
create index if not exists idx_vendas_automacao_jobs_empresa
  on public.vendas_automacao_jobs(empresa_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname='public'
      and indexname='ux_vendas_automacao_jobs_pending'
  ) then
    execute $sql$
      create unique index ux_vendas_automacao_jobs_pending
      on public.vendas_automacao_jobs(empresa_id, automacao_id, gatilho, entity_id)
      where status in ('pending','processing')
    $sql$;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'tg_vendas_automacao_jobs_updated_at'
      and tgrelid = 'public.vendas_automacao_jobs'::regclass
  ) then
    create trigger tg_vendas_automacao_jobs_updated_at
      before update on public.vendas_automacao_jobs
      for each row execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

alter table public.vendas_automacao_jobs enable row level security;
alter table public.vendas_automacao_jobs force row level security;

drop policy if exists vendas_automacao_jobs_deny_authenticated on public.vendas_automacao_jobs;
create policy vendas_automacao_jobs_deny_authenticated
  on public.vendas_automacao_jobs
  for all
  to authenticated
  using (false)
  with check (false);

create table if not exists public.vendas_automacao_runs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  automacao_id uuid not null references public.vendas_automacoes(id) on delete cascade,
  job_id uuid references public.vendas_automacao_jobs(id) on delete set null,
  status text not null check (status in ('ok','error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  output jsonb not null default '{}'::jsonb,
  error text
);

create index if not exists idx_vendas_automacao_runs_empresa_started
  on public.vendas_automacao_runs(empresa_id, started_at desc);

alter table public.vendas_automacao_runs enable row level security;
alter table public.vendas_automacao_runs force row level security;

drop policy if exists vendas_automacao_runs_select on public.vendas_automacao_runs;
create policy vendas_automacao_runs_select
  on public.vendas_automacao_runs
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists vendas_automacao_runs_deny_write on public.vendas_automacao_runs;
create policy vendas_automacao_runs_deny_write
  on public.vendas_automacao_runs
  for all
  to authenticated
  using (false)
  with check (false);

-- Validação simples de config no banco (UI pode chamar para feedback)
drop function if exists public._vendas_automacao_validate_config__unsafe(jsonb);
create or replace function public._vendas_automacao_validate_config__unsafe(p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actions jsonb := coalesce(p_config->'actions', '[]'::jsonb);
  v_errors text[] := array[]::text[];
  v_item jsonb;
  v_type text;
begin
  if jsonb_typeof(v_actions) is distinct from 'array' then
    v_errors := array_append(v_errors, 'config.actions deve ser uma lista');
  else
    for v_item in select * from jsonb_array_elements(v_actions) loop
      v_type := lower(coalesce(v_item->>'type',''));
      if v_type not in ('expedicao_criar','log') then
        v_errors := array_append(v_errors, 'action.type inválido: ' || coalesce(v_item->>'type','(vazio)'));
      end if;
    end loop;
  end if;

  return jsonb_build_object('ok', array_length(v_errors,1) is null, 'errors', coalesce(to_jsonb(v_errors), '[]'::jsonb));
end;
$$;
revoke all on function public._vendas_automacao_validate_config__unsafe(jsonb) from public;
grant execute on function public._vendas_automacao_validate_config__unsafe(jsonb) to service_role;

drop function if exists public.vendas_automacao_validate_config(jsonb);
create or replace function public.vendas_automacao_validate_config(p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.require_permission_for_current_user('vendas','view');
  return public._vendas_automacao_validate_config__unsafe(p_config);
end;
$$;
revoke all on function public.vendas_automacao_validate_config(jsonb) from public;
grant execute on function public.vendas_automacao_validate_config(jsonb) to authenticated, service_role;

-- Enfileirar (por gatilho + entidade), idempotente por automação/entidade enquanto pending/processing
drop function if exists public.vendas_automacao_enqueue_for_trigger(text, uuid, jsonb);
create or replace function public.vendas_automacao_enqueue_for_trigger(
  p_gatilho text,
  p_entity_id uuid,
  p_payload jsonb default null
)
returns int
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_gatilho text := lower(coalesce(nullif(btrim(p_gatilho),''), 'manual'));
  v_created int := 0;
  r record;
begin
  perform public.require_permission_for_current_user('vendas','update');

  for r in
    select id, empresa_id
    from public.vendas_automacoes
    where empresa_id = v_empresa
      and enabled = true
      and lower(gatilho) = v_gatilho
  loop
    -- idempotência: não cria job duplicado enquanto houver pending/processing
    if exists (
      select 1
      from public.vendas_automacao_jobs j
      where j.empresa_id = v_empresa
        and j.automacao_id = r.id
        and j.gatilho = v_gatilho
        and j.entity_id = p_entity_id
        and j.status in ('pending','processing')
      limit 1
    ) then
      continue;
    end if;

    insert into public.vendas_automacao_jobs (
      empresa_id, automacao_id, gatilho, entity_id, payload, status, attempts, run_after
    ) values (
      v_empresa, r.id, v_gatilho, p_entity_id, coalesce(p_payload, '{}'::jsonb), 'pending', 0, now()
    );

    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;
revoke all on function public.vendas_automacao_enqueue_for_trigger(text, uuid, jsonb) from public;
grant execute on function public.vendas_automacao_enqueue_for_trigger(text, uuid, jsonb) to authenticated, service_role;

-- Enfileira uma automação específica (para "Executar agora" no UI)
drop function if exists public.vendas_automacao_enqueue_single(uuid, uuid, text, jsonb);
create or replace function public.vendas_automacao_enqueue_single(
  p_automacao_id uuid,
  p_entity_id uuid,
  p_gatilho text default 'manual',
  p_payload jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_gatilho text := lower(coalesce(nullif(btrim(p_gatilho),''), 'manual'));
  v_id uuid;
begin
  perform public.require_permission_for_current_user('vendas','update');

  if p_automacao_id is null then
    raise exception 'automacao_id é obrigatório';
  end if;
  if p_entity_id is null then
    raise exception 'entity_id é obrigatório';
  end if;

  -- idempotência: não cria job duplicado enquanto houver pending/processing
  select j.id into v_id
  from public.vendas_automacao_jobs j
  where j.empresa_id = v_empresa
    and j.automacao_id = p_automacao_id
    and j.gatilho = v_gatilho
    and j.entity_id = p_entity_id
    and j.status in ('pending','processing')
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.vendas_automacao_jobs (
    empresa_id, automacao_id, gatilho, entity_id, payload, status, attempts, run_after
  ) values (
    v_empresa, p_automacao_id, v_gatilho, p_entity_id, coalesce(p_payload, '{}'::jsonb), 'pending', 0, now()
  )
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.vendas_automacao_enqueue_single(uuid, uuid, text, jsonb) from public;
grant execute on function public.vendas_automacao_enqueue_single(uuid, uuid, text, jsonb) to authenticated, service_role;

-- Trigger: quando pedido muda status, enfileira (best-effort)
drop function if exists public.vendas_automacao_on_pedido_status_change();
create or replace function public.vendas_automacao_on_pedido_status_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_gatilho text;
begin
  if new.empresa_id is distinct from old.empresa_id then
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'aprovado' then
      v_gatilho := 'pedido_aprovado';
    elsif new.status = 'concluido' then
      v_gatilho := 'pedido_concluido';
    else
      v_gatilho := null;
    end if;

    if v_gatilho is not null then
      begin
        -- Sem bloquear update do pedido
        perform public.vendas_automacao_enqueue_for_trigger(v_gatilho, new.id, jsonb_build_object('pedido_id', new.id));
      exception when others then
        null;
      end;
    end if;
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.vendas_pedidos') is not null then
    execute 'drop trigger if exists tg_vendas_automacao_pedido_status on public.vendas_pedidos';
    execute 'create trigger tg_vendas_automacao_pedido_status after update on public.vendas_pedidos for each row execute function public.vendas_automacao_on_pedido_status_change()';
  end if;
end;
$$;

-- Worker: processa jobs (admin, sem depender de JWT/current_empresa)
drop function if exists public.vendas_automacao_process_queue_admin(int);
create or replace function public.vendas_automacao_process_queue_admin(p_limit int default 25)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit int := greatest(1, least(200, coalesce(p_limit, 25)));
  v_now timestamptz := now();
  v_done int := 0;
  v_failed int := 0;
  v_dead int := 0;
  v_job record;
  v_auto record;
  v_run_id uuid;
  v_validate jsonb;
  v_actions jsonb;
  v_action jsonb;
  v_type text;
  v_out jsonb := '{}'::jsonb;
begin
  for v_job in
    with picked as (
      select j.id
      from public.vendas_automacao_jobs j
      where j.status = 'pending'
        and j.run_after <= v_now
      order by j.created_at asc
      limit v_limit
      for update skip locked
    )
    update public.vendas_automacao_jobs j
       set status = 'processing',
           locked_at = now(),
           locked_by = coalesce(current_setting('application_name', true), 'worker'),
           updated_at = now()
      from picked
     where j.id = picked.id
     returning j.*
  loop
    v_out := '{}'::jsonb;

    begin
      select * into v_auto
      from public.vendas_automacoes a
      where a.id = v_job.automacao_id;

      if not found or coalesce(v_auto.enabled, false) = false then
        update public.vendas_automacao_jobs
           set status = 'done',
               updated_at = now()
         where id = v_job.id;
        v_done := v_done + 1;
        continue;
      end if;

      v_validate := public._vendas_automacao_validate_config__unsafe(v_auto.config);
      if coalesce((v_validate->>'ok')::boolean, false) is not true then
        raise exception 'Config inválida: %', v_validate::text;
      end if;

      insert into public.vendas_automacao_runs (empresa_id, automacao_id, job_id, status, started_at, output)
      values (v_job.empresa_id, v_job.automacao_id, v_job.id, 'ok', now(), '{}'::jsonb)
      returning id into v_run_id;

      v_actions := coalesce(v_auto.config->'actions', '[]'::jsonb);

      for v_action in select * from jsonb_array_elements(v_actions) loop
        v_type := lower(coalesce(v_action->>'type',''));

        if v_type = 'expedicao_criar' then
          -- Cria expedição (idempotente pela unique (empresa_id, pedido_id)).
          -- Safe-guard: só cria quando o pedido está aprovado/concluído.
          if exists (
            select 1
            from public.vendas_pedidos p
            where p.empresa_id = v_job.empresa_id
              and p.id = v_job.entity_id
              and p.status in ('aprovado','concluido')
          ) then
            insert into public.vendas_expedicoes (
              empresa_id, pedido_id, status, transportadora_id, tracking_code, data_envio, data_entrega, observacoes
            ) values (
              v_job.empresa_id, v_job.entity_id, 'separando', null, null, null, null, 'Criado automaticamente por automação'
            )
            on conflict (empresa_id, pedido_id) do nothing;

            v_out := v_out || jsonb_build_object('expedicao', 'ok');
          else
            v_out := v_out || jsonb_build_object('expedicao', 'skipped');
          end if;
        elsif v_type = 'log' then
          v_out := v_out || jsonb_build_object('log', coalesce(v_action->>'message','ok'));
        end if;
      end loop;

      -- Loga em app_logs (best-effort)
      begin
        insert into public.app_logs (empresa_id, level, source, event, message, context, actor_id, created_at)
        values (
          v_job.empresa_id,
          'info',
          'worker',
          'vendas_automacao',
          left(coalesce(v_auto.nome,'Automação') || ' executada', 2000),
          jsonb_build_object('automacao_id', v_job.automacao_id, 'job_id', v_job.id, 'gatilho', v_job.gatilho, 'entity_id', v_job.entity_id) || coalesce(v_out,'{}'::jsonb),
          null,
          now()
        );
      exception when others then
        null;
      end;

      update public.vendas_automacao_runs
         set finished_at = now(),
             output = coalesce(v_out,'{}'::jsonb)
       where id = v_run_id;

      update public.vendas_automacao_jobs
         set status = 'done',
             last_error = null,
             updated_at = now()
       where id = v_job.id;

      v_done := v_done + 1;
    exception when others then
      v_failed := v_failed + 1;

      update public.vendas_automacao_runs
         set status = 'error',
             finished_at = now(),
             error = left(SQLERRM, 2000),
             output = coalesce(v_out,'{}'::jsonb)
       where job_id = v_job.id
         and empresa_id = v_job.empresa_id;

      update public.vendas_automacao_jobs
         set attempts = attempts + 1,
             status = case when attempts + 1 >= 5 then 'dead' else 'failed' end,
             last_error = left(SQLERRM, 2000),
             run_after = case when attempts + 1 >= 5 then now() else now() + ((attempts + 1) * interval '2 minutes') end,
             updated_at = now()
       where id = v_job.id;

      if (select status from public.vendas_automacao_jobs where id = v_job.id) = 'dead' then
        v_dead := v_dead + 1;
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'status', 'ok',
    'processed', v_done + v_failed,
    'done', v_done,
    'failed', v_failed,
    'dead', v_dead
  );
end;
$$;

revoke all on function public.vendas_automacao_process_queue_admin(int) from public;
grant execute on function public.vendas_automacao_process_queue_admin(int) to service_role;

commit;

notify pgrst, 'reload schema';
