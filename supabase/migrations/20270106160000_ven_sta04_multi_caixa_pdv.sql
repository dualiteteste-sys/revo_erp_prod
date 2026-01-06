/*
  VEN-STA-04: Multi-caixa (PDV) + perfis por caixa + fechamento

  Motivo
  - Em operações com mais de um operador/terminal, precisamos separar o PDV por "caixa"
    para permitir abertura/fechamento e rastreabilidade (auditoria e conferência de dia).

  O que muda
  - Introduz:
    - `public.vendas_pdv_caixas` (cadastro de caixas por empresa)
    - `public.vendas_pdv_caixa_sessoes` (abertura/fechamento)
    - colunas em `public.vendas_pedidos` para vincular o pedido ao caixa/sessão
  - Atualiza `public.vendas_pdv_finalize_v2(...)` para registrar o caixa (quando informado) e exigir sessão aberta.

  Impacto
  - Frontend consegue selecionar um caixa e exigir "caixa aberto" antes de finalizar PDV.
  - Fechamento fica auditável e reportável (por sessão).

  Reversibilidade
  - Seguro: tabelas novas + colunas novas. Para rollback, remover as referências no frontend e (opcionalmente)
    dropar tabelas/colunas.
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) Link do pedido PDV -> caixa/sessão
-- -----------------------------------------------------------------------------
alter table public.vendas_pedidos
  add column if not exists pdv_caixa_id uuid,
  add column if not exists pdv_caixa_sessao_id uuid;

create index if not exists idx_vendas_pedidos_pdv_caixa
  on public.vendas_pedidos (empresa_id, pdv_caixa_id, updated_at desc)
  where canal = 'pdv';

create index if not exists idx_vendas_pedidos_pdv_caixa_sessao
  on public.vendas_pedidos (empresa_id, pdv_caixa_sessao_id, updated_at desc)
  where canal = 'pdv';

-- -----------------------------------------------------------------------------
-- 2) Caixas (cadastro)
-- -----------------------------------------------------------------------------
create table if not exists public.vendas_pdv_caixas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null default auth.uid(),
  updated_by uuid null default auth.uid()
);

create index if not exists idx_vendas_pdv_caixas_empresa_ativo
  on public.vendas_pdv_caixas (empresa_id, ativo, updated_at desc);

create unique index if not exists ux_vendas_pdv_caixas_empresa_nome
  on public.vendas_pdv_caixas (empresa_id, lower(btrim(nome)));

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'tg_vendas_pdv_caixas_set_updated_at'
      and tgrelid = 'public.vendas_pdv_caixas'::regclass
  ) then
    create trigger tg_vendas_pdv_caixas_set_updated_at
      before update on public.vendas_pdv_caixas
      for each row execute function public.tg_set_updated_at();
  end if;
end$$;

alter table public.vendas_pdv_caixas enable row level security;

drop policy if exists vendas_pdv_caixas_select on public.vendas_pdv_caixas;
create policy vendas_pdv_caixas_select
  on public.vendas_pdv_caixas
  for select to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists vendas_pdv_caixas_write on public.vendas_pdv_caixas;
create policy vendas_pdv_caixas_write
  on public.vendas_pdv_caixas
  for all to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

grant select, insert, update, delete on table public.vendas_pdv_caixas to authenticated;

-- -----------------------------------------------------------------------------
-- 3) Sessões do caixa (abertura/fechamento)
-- -----------------------------------------------------------------------------
create table if not exists public.vendas_pdv_caixa_sessoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  caixa_id uuid not null references public.vendas_pdv_caixas(id) on delete cascade,
  status text not null default 'aberto' check (status in ('aberto','fechado')),
  opened_at timestamptz not null default now(),
  opened_by uuid null default auth.uid(),
  closed_at timestamptz null,
  closed_by uuid null,
  saldo_inicial numeric(15,2) not null default 0,
  saldo_final numeric(15,2) null,
  total_vendas numeric(15,2) not null default 0,
  total_estornos numeric(15,2) not null default 0,
  observacoes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vendas_pdv_caixa_sessoes_empresa_caixa
  on public.vendas_pdv_caixa_sessoes (empresa_id, caixa_id, opened_at desc);

create index if not exists idx_vendas_pdv_caixa_sessoes_empresa_status
  on public.vendas_pdv_caixa_sessoes (empresa_id, status, opened_at desc);

create unique index if not exists ux_vendas_pdv_caixa_sessoes_aberta
  on public.vendas_pdv_caixa_sessoes (empresa_id, caixa_id)
  where status = 'aberto';

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'tg_vendas_pdv_caixa_sessoes_set_updated_at'
      and tgrelid = 'public.vendas_pdv_caixa_sessoes'::regclass
  ) then
    create trigger tg_vendas_pdv_caixa_sessoes_set_updated_at
      before update on public.vendas_pdv_caixa_sessoes
      for each row execute function public.tg_set_updated_at();
  end if;
end$$;

alter table public.vendas_pdv_caixa_sessoes enable row level security;

drop policy if exists vendas_pdv_caixa_sessoes_select on public.vendas_pdv_caixa_sessoes;
create policy vendas_pdv_caixa_sessoes_select
  on public.vendas_pdv_caixa_sessoes
  for select to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists vendas_pdv_caixa_sessoes_write on public.vendas_pdv_caixa_sessoes;
create policy vendas_pdv_caixa_sessoes_write
  on public.vendas_pdv_caixa_sessoes
  for all to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

grant select, insert, update, delete on table public.vendas_pdv_caixa_sessoes to authenticated;

-- -----------------------------------------------------------------------------
-- 4) Helpers/RPCs (idempotentes)
-- -----------------------------------------------------------------------------
create or replace function public.vendas_pdv_ensure_default_caixa()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_id uuid;
begin
  perform public.require_permission_for_current_user('vendas', 'view');

  if v_emp is null then
    raise exception '[PDV][caixa] empresa_id inválido' using errcode='42501';
  end if;

  select c.id into v_id
  from public.vendas_pdv_caixas c
  where c.empresa_id = v_emp and c.ativo = true
  order by c.created_at asc
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.vendas_pdv_caixas (empresa_id, nome, ativo)
  values (v_emp, 'Caixa 1', true)
  on conflict do nothing;

  select c.id into v_id
  from public.vendas_pdv_caixas c
  where c.empresa_id = v_emp and c.ativo = true
  order by c.created_at asc
  limit 1;

  return v_id;
end;
$$;

revoke all on function public.vendas_pdv_ensure_default_caixa() from public, anon;
grant execute on function public.vendas_pdv_ensure_default_caixa() to authenticated, service_role;

create or replace function public.vendas_pdv_caixas_list()
returns table (
  id uuid,
  nome text,
  ativo boolean,
  sessao_id uuid,
  sessao_status text,
  opened_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select
    c.id,
    c.nome,
    c.ativo,
    s.id as sessao_id,
    s.status as sessao_status,
    s.opened_at
  from public.vendas_pdv_caixas c
  left join public.vendas_pdv_caixa_sessoes s
    on s.empresa_id = c.empresa_id
   and s.caixa_id = c.id
   and s.status = 'aberto'
  where c.empresa_id = public.current_empresa_id()
  order by c.created_at asc;
$$;

revoke all on function public.vendas_pdv_caixas_list() from public, anon;
grant execute on function public.vendas_pdv_caixas_list() to authenticated, service_role;

create or replace function public.vendas_pdv_caixa_open(
  p_caixa_id uuid,
  p_saldo_inicial numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_id uuid;
begin
  perform public.require_permission_for_current_user('vendas', 'manage');

  if v_emp is null then
    raise exception '[PDV][caixa] empresa_id inválido' using errcode='42501';
  end if;
  if p_caixa_id is null then
    raise exception '[PDV][caixa] caixa_id é obrigatório' using errcode='22004';
  end if;

  perform public.vendas_pdv_ensure_default_caixa();

  select s.id into v_id
  from public.vendas_pdv_caixa_sessoes s
  where s.empresa_id = v_emp and s.caixa_id = p_caixa_id and s.status = 'aberto'
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.vendas_pdv_caixa_sessoes (empresa_id, caixa_id, status, saldo_inicial)
  values (v_emp, p_caixa_id, 'aberto', coalesce(p_saldo_inicial, 0))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.vendas_pdv_caixa_open(uuid, numeric) from public, anon;
grant execute on function public.vendas_pdv_caixa_open(uuid, numeric) to authenticated, service_role;

create or replace function public.vendas_pdv_caixa_close(
  p_caixa_id uuid,
  p_saldo_final numeric default null,
  p_observacoes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_sess public.vendas_pdv_caixa_sessoes%rowtype;
  v_total_vendas numeric(15,2);
  v_total_estornos numeric(15,2);
begin
  perform public.require_permission_for_current_user('vendas', 'manage');

  if v_emp is null then
    raise exception '[PDV][caixa] empresa_id inválido' using errcode='42501';
  end if;

  select *
    into v_sess
    from public.vendas_pdv_caixa_sessoes s
   where s.empresa_id = v_emp
     and s.caixa_id = p_caixa_id
     and s.status = 'aberto'
   for update;

  if not found then
    raise exception '[PDV][caixa] Nenhuma sessão aberta para este caixa' using errcode='P0002';
  end if;

  select coalesce(sum(p.total_geral), 0)
    into v_total_vendas
    from public.vendas_pedidos p
   where p.empresa_id = v_emp
     and p.canal = 'pdv'
     and p.pdv_caixa_sessao_id = v_sess.id
     and p.status = 'concluido';

  select coalesce(sum(p.total_geral), 0)
    into v_total_estornos
    from public.vendas_pedidos p
   where p.empresa_id = v_emp
     and p.canal = 'pdv'
     and p.pdv_caixa_sessao_id = v_sess.id
     and p.pdv_estornado_at is not null;

  update public.vendas_pdv_caixa_sessoes
     set status = 'fechado',
         closed_at = now(),
         closed_by = auth.uid(),
         saldo_final = p_saldo_final,
         total_vendas = v_total_vendas,
         total_estornos = v_total_estornos,
         observacoes = p_observacoes,
         updated_at = now()
   where id = v_sess.id;

  return jsonb_build_object(
    'ok', true,
    'sessao_id', v_sess.id,
    'caixa_id', v_sess.caixa_id,
    'saldo_inicial', v_sess.saldo_inicial,
    'saldo_final', p_saldo_final,
    'total_vendas', v_total_vendas,
    'total_estornos', v_total_estornos,
    'opened_at', v_sess.opened_at,
    'closed_at', now()
  );
end;
$$;

revoke all on function public.vendas_pdv_caixa_close(uuid, numeric, text) from public, anon;
grant execute on function public.vendas_pdv_caixa_close(uuid, numeric, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5) PDV finalize: registra caixa/sessão quando informado
-- -----------------------------------------------------------------------------
drop function if exists public.vendas_pdv_finalize_v2(uuid, uuid, boolean);
create or replace function public.vendas_pdv_finalize_v2(
  p_pedido_id uuid,
  p_conta_corrente_id uuid,
  p_baixar_estoque boolean default true,
  p_pdv_caixa_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_row public.vendas_pedidos%rowtype;
  v_doc text;
  v_mov_id uuid;
  v_mov jsonb;
  v_sess_id uuid;
begin
  perform public.require_permission_for_current_user('vendas', 'update');

  if v_emp is null then
    raise exception '[PDV][finalize] Nenhuma empresa ativa encontrada' using errcode = '42501';
  end if;

  if p_pedido_id is null then
    raise exception '[PDV][finalize] pedido_id é obrigatório' using errcode = '22004';
  end if;
  if p_conta_corrente_id is null then
    raise exception '[PDV][finalize] conta_corrente_id é obrigatório' using errcode = '22004';
  end if;

  -- Lock por pedido para evitar double-click/retry concorrente
  perform pg_advisory_xact_lock(hashtextextended(p_pedido_id::text, 0));

  select *
    into v_row
    from public.vendas_pedidos p
   where p.id = p_pedido_id
     and p.empresa_id = v_emp
   for update;

  if not found then
    raise exception '[PDV][finalize] Pedido não encontrado na empresa atual' using errcode = 'P0002';
  end if;

  if v_row.status = 'cancelado' then
    raise exception '[PDV][finalize] Pedido cancelado não pode ser finalizado' using errcode = 'P0001';
  end if;

  if p_pdv_caixa_id is not null then
    select s.id into v_sess_id
    from public.vendas_pdv_caixa_sessoes s
    where s.empresa_id = v_emp
      and s.caixa_id = p_pdv_caixa_id
      and s.status = 'aberto'
    order by s.opened_at desc
    limit 1;

    if v_sess_id is null then
      raise exception '[PDV][finalize] Caixa não está aberto (abra o caixa antes de finalizar)' using errcode = '42501';
    end if;
  end if;

  v_doc := 'PDV-' || v_row.numero::text;

  -- Finaliza pedido (idempotente por estado)
  update public.vendas_pedidos
     set canal = 'pdv',
         status = 'concluido',
         pdv_caixa_id = coalesce(p_pdv_caixa_id, pdv_caixa_id),
         pdv_caixa_sessao_id = coalesce(v_sess_id, pdv_caixa_sessao_id),
         updated_at = now()
   where id = v_row.id
     and empresa_id = v_emp;

  -- Financeiro: garante movimento único por origem (idempotente)
  select m.id
    into v_mov_id
    from public.financeiro_movimentacoes m
   where m.empresa_id = v_emp
     and m.origem_tipo = 'venda_pdv'
     and m.origem_id = v_row.id
   limit 1;

  if v_mov_id is null then
    begin
      v_mov := public.financeiro_movimentacoes_upsert(
        jsonb_build_object(
          'conta_corrente_id', p_conta_corrente_id,
          'tipo_mov', 'entrada',
          'valor', v_row.total_geral,
          'descricao', 'Venda PDV #' || v_row.numero::text,
          'documento_ref', v_doc,
          'origem_tipo', 'venda_pdv',
          'origem_id', v_row.id,
          'categoria', 'Vendas',
          'observacoes', 'Gerado automaticamente pelo PDV'
        )
      );
      v_mov_id := nullif(v_mov->>'id','')::uuid;
    exception
      when unique_violation then
        select m.id
          into v_mov_id
          from public.financeiro_movimentacoes m
         where m.empresa_id = v_emp
           and m.origem_tipo = 'venda_pdv'
           and m.origem_id = v_row.id
         limit 1;
    end;
  end if;

  if v_mov_id is not null then
    v_mov := public.financeiro_movimentacoes_get(v_mov_id);

    if (v_mov->>'conciliado')::boolean is false
       and nullif(v_mov->>'conta_corrente_id','')::uuid is distinct from p_conta_corrente_id then
      begin
        v_mov := public.financeiro_movimentacoes_upsert(
          jsonb_build_object(
            'id', v_mov_id,
            'conta_corrente_id', p_conta_corrente_id,
            'tipo_mov', 'entrada',
            'valor', v_row.total_geral,
            'descricao', 'Venda PDV #' || v_row.numero::text,
            'documento_ref', v_doc,
            'origem_tipo', 'venda_pdv',
            'origem_id', v_row.id,
            'categoria', 'Vendas',
            'observacoes', 'Atualizado automaticamente pelo PDV (correção de conta)'
          )
        );
      exception
        when others then
          null;
      end;
    end if;
  end if;

  if p_baixar_estoque then
    perform public.vendas_baixar_estoque(v_row.id, v_doc);
  end if;

  return jsonb_build_object(
    'ok', true,
    'pedido_id', v_row.id,
    'documento_ref', v_doc,
    'financeiro_movimentacao_id', v_mov_id,
    'pdv_caixa_id', p_pdv_caixa_id,
    'pdv_caixa_sessao_id', v_sess_id,
    'estoque_baixado_at', (select p.estoque_baixado_at from public.vendas_pedidos p where p.id = v_row.id)
  );
end;
$$;

revoke all on function public.vendas_pdv_finalize_v2(uuid, uuid, boolean, uuid) from public;
grant execute on function public.vendas_pdv_finalize_v2(uuid, uuid, boolean, uuid) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
