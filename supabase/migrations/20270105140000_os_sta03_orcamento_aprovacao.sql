/*
  OS-STA-03: Fluxo de orçamento/aprovação com registro de aceite.

  Problema:
  - Hoje a OS tem status (orcamento/aberta/...) mas não existe um fluxo auditável para:
    "enviar orçamento" → "cliente aprovou/reprovou" (com evidência do aceite).

  Solução:
  - Adiciona campos em `public.ordem_servicos` para controlar o estado do orçamento.
  - Cria tabela `public.os_orcamento_eventos` (timeline/aceite).
  - Cria RPCs seguras (security definer + RBAC + plano):
    - `os_orcamento_get(p_os_id)` → resumo do orçamento + último evento
    - `os_orcamento_enviar(p_os_id, p_mensagem)` → marca como enviado
    - `os_orcamento_decidir(p_os_id, p_decisao, p_cliente_nome, p_observacao)` → aprovar/reprovar

  Observação:
  - Este fluxo é “interno” (operador registra o aceite). Um portal/token público pode ser
    adicionado depois sem quebrar este modelo.
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) Schema: colunas do orçamento na OS
-- -----------------------------------------------------------------------------
alter table public.ordem_servicos
  add column if not exists orcamento_status text not null default 'draft'
    check (orcamento_status in ('draft','sent','approved','rejected')),
  add column if not exists orcamento_sent_at timestamptz null,
  add column if not exists orcamento_decided_at timestamptz null,
  add column if not exists orcamento_decided_by uuid null,
  add column if not exists orcamento_cliente_nome text null,
  add column if not exists orcamento_observacao text null;

create index if not exists idx_os_empresa_orcamento_status_updated
  on public.ordem_servicos (empresa_id, orcamento_status, updated_at desc);

-- -----------------------------------------------------------------------------
-- 2) Timeline/aceite
-- -----------------------------------------------------------------------------
create table if not exists public.os_orcamento_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  os_id uuid not null references public.ordem_servicos(id) on delete cascade,
  tipo text not null check (tipo in ('sent','approved','rejected')),
  mensagem text null,
  cliente_nome text null,
  observacao text null,
  actor_user_id uuid null default auth.uid(),
  actor_email text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_os_orcamento_eventos_os_created
  on public.os_orcamento_eventos (os_id, created_at desc);

alter table public.os_orcamento_eventos enable row level security;

drop policy if exists sel_os_orcamento_eventos_by_empresa on public.os_orcamento_eventos;
create policy sel_os_orcamento_eventos_by_empresa
  on public.os_orcamento_eventos
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists ins_os_orcamento_eventos_by_empresa on public.os_orcamento_eventos;
create policy ins_os_orcamento_eventos_by_empresa
  on public.os_orcamento_eventos
  for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

grant select, insert on table public.os_orcamento_eventos to authenticated;

-- -----------------------------------------------------------------------------
-- 3) RPCs
-- -----------------------------------------------------------------------------
drop function if exists public.os_orcamento_get(uuid);
create or replace function public.os_orcamento_get(p_os_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_os record;
  v_last jsonb;
begin
  perform public.require_plano_mvp_allows('servicos');
  perform public.require_permission_for_current_user('os','view');

  select
    os.id,
    os.status,
    os.orcamento_status,
    os.orcamento_sent_at,
    os.orcamento_decided_at,
    os.orcamento_decided_by,
    os.orcamento_cliente_nome,
    os.orcamento_observacao
  into v_os
  from public.ordem_servicos os
  where os.id = p_os_id and os.empresa_id = v_emp;

  if v_os is null then
    raise exception '[RPC][OS][ORCAMENTO] OS não encontrada' using errcode = 'P0002';
  end if;

  select to_jsonb(e)
  into v_last
  from (
    select
      e.id,
      e.tipo,
      e.mensagem,
      e.cliente_nome,
      e.observacao,
      e.actor_user_id,
      e.actor_email,
      e.created_at
    from public.os_orcamento_eventos e
    where e.empresa_id = v_emp and e.os_id = p_os_id
    order by e.created_at desc
    limit 1
  ) e;

  return jsonb_build_object(
    'os_id', v_os.id,
    'status', v_os.status,
    'orcamento_status', v_os.orcamento_status,
    'sent_at', v_os.orcamento_sent_at,
    'decided_at', v_os.orcamento_decided_at,
    'decided_by', v_os.orcamento_decided_by,
    'cliente_nome', v_os.orcamento_cliente_nome,
    'observacao', v_os.orcamento_observacao,
    'last_event', coalesce(v_last, 'null'::jsonb)
  );
end;
$$;

revoke all on function public.os_orcamento_get(uuid) from public, anon;
grant execute on function public.os_orcamento_get(uuid) to authenticated, service_role;

drop function if exists public.os_orcamento_enviar(uuid, text);
create or replace function public.os_orcamento_enviar(
  p_os_id uuid,
  p_mensagem text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_email text := nullif(auth.email(), '');
begin
  perform public.require_plano_mvp_allows('servicos');
  perform public.require_permission_for_current_user('os','update');

  update public.ordem_servicos os
  set
    orcamento_status = 'sent',
    orcamento_sent_at = coalesce(os.orcamento_sent_at, now()),
    updated_at = now()
  where os.id = p_os_id and os.empresa_id = v_emp;

  if not found then
    raise exception '[RPC][OS][ORCAMENTO] OS não encontrada' using errcode = 'P0002';
  end if;

  insert into public.os_orcamento_eventos (empresa_id, os_id, tipo, mensagem, actor_user_id, actor_email)
  values (v_emp, p_os_id, 'sent', nullif(p_mensagem, ''), auth.uid(), v_email);
end;
$$;

revoke all on function public.os_orcamento_enviar(uuid, text) from public, anon;
grant execute on function public.os_orcamento_enviar(uuid, text) to authenticated, service_role;

drop function if exists public.os_orcamento_decidir(uuid, text, text, text);
create or replace function public.os_orcamento_decidir(
  p_os_id uuid,
  p_decisao text,
  p_cliente_nome text default null,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_email text := nullif(auth.email(), '');
  v_next text;
begin
  perform public.require_plano_mvp_allows('servicos');
  perform public.require_permission_for_current_user('os','manage');

  v_next := case
    when lower(p_decisao) in ('approved','aprovar','aprovado') then 'approved'
    when lower(p_decisao) in ('rejected','reprovar','reprovado') then 'rejected'
    else null
  end;

  if v_next is null then
    raise exception '[RPC][OS][ORCAMENTO] decisão inválida' using errcode = '22023';
  end if;

  update public.ordem_servicos os
  set
    orcamento_status = v_next,
    orcamento_decided_at = now(),
    orcamento_decided_by = auth.uid(),
    orcamento_cliente_nome = nullif(btrim(p_cliente_nome), ''),
    orcamento_observacao = nullif(btrim(p_observacao), ''),
    updated_at = now()
  where os.id = p_os_id and os.empresa_id = v_emp;

  if not found then
    raise exception '[RPC][OS][ORCAMENTO] OS não encontrada' using errcode = 'P0002';
  end if;

  insert into public.os_orcamento_eventos (empresa_id, os_id, tipo, cliente_nome, observacao, actor_user_id, actor_email)
  values (v_emp, p_os_id, v_next, nullif(btrim(p_cliente_nome), ''), nullif(btrim(p_observacao), ''), auth.uid(), v_email);
end;
$$;

revoke all on function public.os_orcamento_decidir(uuid, text, text, text) from public, anon;
grant execute on function public.os_orcamento_decidir(uuid, text, text, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) Auditoria (quando disponível)
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.audit_logs') is null or to_regprocedure('public.process_audit_log()') is null then
    return;
  end if;

  execute 'drop trigger if exists audit_logs_trigger on public.os_orcamento_eventos';
  execute 'create trigger audit_logs_trigger after insert or update or delete on public.os_orcamento_eventos for each row execute function public.process_audit_log()';
end;
$$;

select pg_notify('pgrst','reload schema');

commit;

