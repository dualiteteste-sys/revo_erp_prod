/*
  Financeiro: Contas a Pagar — pagamentos parciais por evento + estorno parcial (estado da arte)

  Motivação
  - O modelo anterior consolidava pagamento em (valor_pago, data_pagamento) + 1 movimentação por título.
  - Isso impede:
    - múltiplos pagamentos (retiradas) por título com trilha correta
    - estorno de UM pagamento específico (parcial)

  Solução
  - Criar tabela de eventos: public.financeiro_contas_pagar_pagamentos (1 linha por pagamento)
  - Cada pagamento gera 1 movimentação na tesouraria com origem:
      origem_tipo = 'conta_a_pagar_pagamento'
      origem_id   = pagamento_id
  - Estorno parcial: estorna o pagamento selecionado (bloqueia se movimentação conciliada).
  - Compat: financeiro_conta_pagar_estornar_v2 passa a estornar todos os pagamentos não estornados (total).
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) Tabela: pagamentos por evento
-- -----------------------------------------------------------------------------

create table if not exists public.financeiro_contas_pagar_pagamentos (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null default public.current_empresa_id(),
  conta_pagar_id        uuid not null,
  data_pagamento        date not null default current_date,
  valor                numeric(15,2) not null check (valor > 0),
  conta_corrente_id     uuid not null,
  observacoes           text,

  movimentacao_id       uuid,
  estornado_at          timestamptz,
  estornado_por         uuid,
  estorno_motivo        text,
  estorno_movimentacao_id uuid,

  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),

  constraint fin_cpp_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint fin_cpp_conta_pagar_fkey foreign key (conta_pagar_id) references public.financeiro_contas_pagar(id) on delete cascade,
  constraint fin_cpp_cc_fkey foreign key (conta_corrente_id) references public.financeiro_contas_correntes(id) on delete restrict,
  constraint fin_cpp_mov_fkey foreign key (movimentacao_id) references public.financeiro_movimentacoes(id) on delete set null,
  constraint fin_cpp_estorno_mov_fkey foreign key (estorno_movimentacao_id) references public.financeiro_movimentacoes(id) on delete set null
);

create index if not exists idx_fin_cpp_empresa on public.financeiro_contas_pagar_pagamentos (empresa_id);
create index if not exists idx_fin_cpp_empresa_conta on public.financeiro_contas_pagar_pagamentos (empresa_id, conta_pagar_id);
create index if not exists idx_fin_cpp_empresa_estornado on public.financeiro_contas_pagar_pagamentos (empresa_id, conta_pagar_id, estornado_at);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'handle_updated_at_financeiro_contas_pagar_pagamentos'
      and tgrelid = 'public.financeiro_contas_pagar_pagamentos'::regclass
  ) then
    create trigger handle_updated_at_financeiro_contas_pagar_pagamentos
      before update on public.financeiro_contas_pagar_pagamentos
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

alter table public.financeiro_contas_pagar_pagamentos enable row level security;

drop policy if exists fin_cpp_select on public.financeiro_contas_pagar_pagamentos;
drop policy if exists fin_cpp_insert on public.financeiro_contas_pagar_pagamentos;
drop policy if exists fin_cpp_update on public.financeiro_contas_pagar_pagamentos;
drop policy if exists fin_cpp_delete on public.financeiro_contas_pagar_pagamentos;

create policy fin_cpp_select
  on public.financeiro_contas_pagar_pagamentos
  for select
  using (empresa_id = public.current_empresa_id());

create policy fin_cpp_insert
  on public.financeiro_contas_pagar_pagamentos
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy fin_cpp_update
  on public.financeiro_contas_pagar_pagamentos
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy fin_cpp_delete
  on public.financeiro_contas_pagar_pagamentos
  for delete
  using (empresa_id = public.current_empresa_id());

-- RPC-first: nenhuma permissão direta para anon/authenticated
revoke all on table public.financeiro_contas_pagar_pagamentos from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2) Backfill (estado atual): cria 1 evento para títulos já pagos (consolidado)
--    - Migra origem da movimentação antiga ('conta_a_pagar', conta_id) para o novo pagamento_id.
-- -----------------------------------------------------------------------------

-- Garante que empresas com título pago tenham ao menos 1 conta-corrente (fallback para backfill).
insert into public.financeiro_contas_correntes (
  empresa_id,
  nome,
  apelido,
  tipo_conta,
  moeda,
  saldo_inicial,
  data_saldo_inicial,
  limite_credito,
  permite_saldo_negativo,
  ativo,
  padrao_para_pagamentos,
  padrao_para_recebimentos,
  observacoes
)
select
  x.empresa_id,
  'Caixa',
  'Caixa',
  'caixa',
  'BRL',
  0,
  current_date,
  0,
  false,
  true,
  true,
  true,
  'Criado automaticamente (backfill pagamentos contas a pagar).'
from (
  select distinct cp.empresa_id
  from public.financeiro_contas_pagar cp
  where coalesce(cp.valor_pago, 0) > 0
) x
where not exists (
  select 1
  from public.financeiro_contas_correntes cc
  where cc.empresa_id = x.empresa_id
);

with to_backfill as (
  select
    cp.id as conta_id,
    cp.empresa_id,
    coalesce(cp.data_pagamento, cp.data_vencimento, current_date) as data_pagamento,
    round(cp.valor_pago, 2) as valor,
    (
      select m.id
      from public.financeiro_movimentacoes m
      where m.empresa_id = cp.empresa_id
        and m.origem_tipo = 'conta_a_pagar'
        and m.origem_id = cp.id
      order by m.created_at desc
      limit 1
    ) as mov_id,
    (
      select m.conta_corrente_id
      from public.financeiro_movimentacoes m
      where m.empresa_id = cp.empresa_id
        and m.origem_tipo = 'conta_a_pagar'
        and m.origem_id = cp.id
      order by m.created_at desc
      limit 1
    ) as mov_cc_id,
    (
      select cc.id
      from public.financeiro_contas_correntes cc
      where cc.empresa_id = cp.empresa_id
      order by
        (cc.padrao_para_pagamentos = true) desc,
        (cc.tipo_conta = 'caixa') desc,
        cc.updated_at desc
      limit 1
    ) as fallback_cc_id
  from public.financeiro_contas_pagar cp
  where coalesce(cp.valor_pago, 0) > 0
    and not exists (
      select 1
      from public.financeiro_contas_pagar_pagamentos p
      where p.empresa_id = cp.empresa_id
        and p.conta_pagar_id = cp.id
    )
),
ins as (
  insert into public.financeiro_contas_pagar_pagamentos (
    empresa_id,
    conta_pagar_id,
    data_pagamento,
    valor,
    conta_corrente_id,
    movimentacao_id,
    observacoes
  )
  select
    b.empresa_id,
    b.conta_id,
    b.data_pagamento,
    b.valor,
    coalesce(b.mov_cc_id, b.fallback_cc_id),
    b.mov_id,
    'Backfill (pagamento consolidado histórico).'
  from to_backfill b
  where coalesce(b.mov_cc_id, b.fallback_cc_id) is not null
  returning id, empresa_id, conta_pagar_id, movimentacao_id, data_pagamento, valor, conta_corrente_id
)
update public.financeiro_movimentacoes m
set
  origem_tipo = 'conta_a_pagar_pagamento',
  origem_id = ins.id,
  updated_at = now()
from ins
where ins.movimentacao_id is not null
  and m.id = ins.movimentacao_id
  and m.empresa_id = ins.empresa_id
  and m.origem_tipo = 'conta_a_pagar'
  and m.origem_id = ins.conta_pagar_id;

-- Pagamentos históricos sem movimentação: criar movimentação por pagamento-evento (evita estorno inconsistente).
with need as (
  select
    p.id as pagamento_id,
    p.empresa_id,
    p.conta_pagar_id,
    p.data_pagamento,
    p.valor,
    p.conta_corrente_id
  from public.financeiro_contas_pagar_pagamentos p
  where p.movimentacao_id is null
),
mov as (
  insert into public.financeiro_movimentacoes (
    empresa_id,
    conta_corrente_id,
    data_movimento,
    data_competencia,
    tipo_mov,
    valor,
    descricao,
    documento_ref,
    origem_tipo,
    origem_id,
    categoria,
    centro_custo,
    conciliado,
    observacoes
  )
  select
    n.empresa_id,
    n.conta_corrente_id,
    n.data_pagamento,
    cp.data_vencimento,
    'saida',
    n.valor,
    case
      when cp.descricao is null or btrim(cp.descricao) = '' then 'Pagamento'
      else 'Pagamento: ' || cp.descricao
    end,
    cp.documento_ref,
    'conta_a_pagar_pagamento',
    n.pagamento_id,
    cp.categoria,
    cp.centro_custo,
    false,
    'Backfill (movimentação criada para pagamento histórico).'
  from need n
  join public.financeiro_contas_pagar cp
    on cp.id = n.conta_pagar_id
   and cp.empresa_id = n.empresa_id
  on conflict (empresa_id, origem_tipo, origem_id)
    where origem_tipo is not null and origem_id is not null
  do update set
    conta_corrente_id = excluded.conta_corrente_id,
    data_movimento = excluded.data_movimento,
    data_competencia = excluded.data_competencia,
    valor = excluded.valor,
    descricao = excluded.descricao,
    documento_ref = excluded.documento_ref,
    categoria = excluded.categoria,
    centro_custo = excluded.centro_custo,
    observacoes = coalesce(excluded.observacoes, public.financeiro_movimentacoes.observacoes),
    updated_at = now()
  returning id, empresa_id, origem_id
)
update public.financeiro_contas_pagar_pagamentos p
set movimentacao_id = mov.id,
    updated_at = now()
from mov
where p.empresa_id = mov.empresa_id
  and p.id = mov.origem_id
  and p.movimentacao_id is null;

-- -----------------------------------------------------------------------------
-- 3) RPC: listar pagamentos de uma conta a pagar
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_conta_pagar_pagamentos_list(p_conta_pagar_id uuid)
returns table(
  id uuid,
  data_pagamento date,
  valor numeric,
  conta_corrente_id uuid,
  conta_corrente_nome text,
  observacoes text,
  estornado boolean,
  estornado_at timestamptz,
  estorno_motivo text,
  movimentacao_id uuid,
  movimentacao_conciliada boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  perform public.require_permission_for_current_user('contas_a_pagar', 'view');

  return query
  select
    p.id,
    p.data_pagamento,
    p.valor,
    p.conta_corrente_id,
    cc.nome as conta_corrente_nome,
    p.observacoes,
    (p.estornado_at is not null) as estornado,
    p.estornado_at,
    p.estorno_motivo,
    p.movimentacao_id,
    coalesce(m.conciliado, false) as movimentacao_conciliada,
    p.created_at
  from public.financeiro_contas_pagar_pagamentos p
  join public.financeiro_contas_pagar cp
    on cp.id = p.conta_pagar_id
   and cp.empresa_id = v_empresa
  left join public.financeiro_contas_correntes cc on cc.id = p.conta_corrente_id and cc.empresa_id = v_empresa
  left join public.financeiro_movimentacoes m on m.id = p.movimentacao_id and m.empresa_id = v_empresa
  where p.empresa_id = v_empresa
    and p.conta_pagar_id = p_conta_pagar_id
  order by p.data_pagamento desc, p.created_at desc;
end;
$$;

revoke all on function public.financeiro_conta_pagar_pagamentos_list(uuid) from public, anon;
grant execute on function public.financeiro_conta_pagar_pagamentos_list(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) RPC: estornar 1 pagamento (parcial) por id de pagamento
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_conta_pagar_pagamento_estornar(
  p_pagamento_id uuid,
  p_data_estorno date default null,
  p_conta_corrente_id uuid default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_data date := coalesce(p_data_estorno, current_date);
  v_total numeric;
  v_sum numeric;
  v_last_pay date;
  v_novo_status text;
  v_cc_id uuid;
  v_mov public.financeiro_movimentacoes;
  v_rec public.financeiro_contas_pagar;
  v_pag record;
  v_estorno_mov_id uuid;
begin
  perform public.require_permission_for_current_user('contas_a_pagar','update');
  perform public.require_permission_for_current_user('tesouraria','create');

  select
    p.*,
    (p.estornado_at is not null) as is_estornado
  into v_pag
  from public.financeiro_contas_pagar_pagamentos p
  where p.id = p_pagamento_id
    and p.empresa_id = v_empresa
  for update;

  if not found then
    raise exception '[FINANCEIRO][pagar][estornar] Pagamento não encontrado.' using errcode = 'P0001';
  end if;

  select *
    into v_rec
  from public.financeiro_contas_pagar cp
  where cp.id = v_pag.conta_pagar_id
    and cp.empresa_id = v_empresa
  for update;

  if v_rec.id is null then
    raise exception '[FINANCEIRO][pagar][estornar] Conta a pagar não encontrada.' using errcode = 'P0001';
  end if;

  if v_pag.is_estornado then
    return public.financeiro_contas_pagar_get(v_rec.id);
  end if;

  select *
    into v_mov
  from public.financeiro_movimentacoes m
  where m.empresa_id = v_empresa
    and m.id = v_pag.movimentacao_id
  limit 1;

  if v_mov.id is null then
    select *
      into v_mov
    from public.financeiro_movimentacoes m
    where m.empresa_id = v_empresa
      and m.origem_tipo = 'conta_a_pagar_pagamento'
      and m.origem_id = v_pag.id
    order by m.created_at desc
    limit 1;
  end if;

  if v_mov.id is not null and coalesce(v_mov.conciliado, false) = true then
    raise exception '[FINANCEIRO][pagar][estornar] Movimentação conciliada. Desfaça a conciliação antes de estornar.' using errcode = 'P0001';
  end if;

  v_cc_id := coalesce(p_conta_corrente_id, v_mov.conta_corrente_id, public.financeiro_conta_corrente_escolher('pagamento'));

  -- Mantém trilha e evita colisão no índice único (empresa_id, origem_tipo, origem_id)
  if v_mov.id is not null then
    update public.financeiro_movimentacoes
       set origem_tipo = 'conta_a_pagar_pagamento_estornado',
           origem_id = v_mov.id,
           observacoes = case
             when coalesce(nullif(btrim(p_motivo), ''), '') = '' then observacoes
             when observacoes is null or btrim(observacoes) = '' then '[ESTORNO] ' || btrim(p_motivo)
             else observacoes || E'\n' || '[ESTORNO] ' || btrim(p_motivo)
           end,
           updated_at = now()
     where id = v_mov.id
       and empresa_id = v_empresa
       and coalesce(conciliado, false) = false;
  end if;

  insert into public.financeiro_movimentacoes (
    empresa_id,
    conta_corrente_id,
    data_movimento,
    data_competencia,
    tipo_mov,
    valor,
    descricao,
    documento_ref,
    origem_tipo,
    origem_id,
    categoria,
    centro_custo,
    conciliado,
    observacoes
  ) values (
    v_empresa,
    v_cc_id,
    v_data,
    v_rec.data_vencimento,
    'entrada',
    v_pag.valor,
    case
      when v_rec.descricao is null or btrim(v_rec.descricao) = '' then 'Estorno de pagamento'
      else 'Estorno: ' || v_rec.descricao
    end,
    v_rec.documento_ref,
    'conta_a_pagar_estorno',
    coalesce(v_mov.id, v_rec.id),
    v_rec.categoria,
    v_rec.centro_custo,
    false,
    nullif(btrim(p_motivo), '')
  )
  on conflict (empresa_id, origem_tipo, origem_id)
    where origem_tipo is not null and origem_id is not null
  do update set
    conta_corrente_id = excluded.conta_corrente_id,
    data_movimento = excluded.data_movimento,
    data_competencia = excluded.data_competencia,
    valor = excluded.valor,
    descricao = excluded.descricao,
    documento_ref = excluded.documento_ref,
    categoria = excluded.categoria,
    centro_custo = excluded.centro_custo,
    observacoes = coalesce(excluded.observacoes, public.financeiro_movimentacoes.observacoes),
    updated_at = now()
  returning id into v_estorno_mov_id;

  update public.financeiro_contas_pagar_pagamentos
     set estornado_at = now(),
         estornado_por = auth.uid(),
         estorno_motivo = nullif(btrim(p_motivo), ''),
         estorno_movimentacao_id = v_estorno_mov_id,
         updated_at = now()
   where id = v_pag.id
     and empresa_id = v_empresa
     and estornado_at is null;

  v_total := round((v_rec.valor_total + v_rec.multa + v_rec.juros - v_rec.desconto), 2);

  select
    round(coalesce(sum(p.valor), 0), 2),
    max(p.data_pagamento)
  into v_sum, v_last_pay
  from public.financeiro_contas_pagar_pagamentos p
  where p.empresa_id = v_empresa
    and p.conta_pagar_id = v_rec.id
    and p.estornado_at is null;

  if coalesce(v_sum, 0) <= 0 then
    v_novo_status := 'aberta';
    v_last_pay := null;
  elsif v_sum >= v_total then
    v_novo_status := 'paga';
  else
    v_novo_status := 'parcial';
  end if;

  update public.financeiro_contas_pagar
     set status = v_novo_status,
         valor_pago = greatest(coalesce(v_sum, 0), 0),
         data_pagamento = v_last_pay,
         updated_at = now()
   where id = v_rec.id
     and empresa_id = v_empresa
   returning * into v_rec;

  return public.financeiro_contas_pagar_get(v_rec.id);
end;
$$;

revoke all on function public.financeiro_conta_pagar_pagamento_estornar(uuid, date, uuid, text) from public, anon;
grant execute on function public.financeiro_conta_pagar_pagamento_estornar(uuid, date, uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5) Override: pagar_v2 cria evento + movimentação por pagamento
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_conta_pagar_pagar_v2(
  p_id uuid,
  p_data_pagamento date default null,
  p_valor_pago numeric default null,
  p_conta_corrente_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  rec public.financeiro_contas_pagar;
  v_data date := coalesce(p_data_pagamento, current_date);
  v_total numeric;
  v_saldo_atual numeric;
  v_increment numeric;
  v_novo_pago numeric;
  v_novo_status text;
  v_cc_id uuid;
  v_pag_id uuid;
  v_mov_id uuid;
begin
  perform public.require_permission_for_current_user('contas_a_pagar','update');
  perform public.require_permission_for_current_user('tesouraria','create');

  select *
    into rec
  from public.financeiro_contas_pagar
  where id = p_id
    and empresa_id = v_empresa
  for update;

  if rec.id is null then
    raise exception '[FINANCEIRO][pagar] Conta a pagar não encontrada.' using errcode = 'P0001';
  end if;

  if rec.status = 'cancelada' then
    raise exception '[FINANCEIRO][pagar] Não é possível pagar uma conta cancelada.' using errcode = 'P0001';
  end if;

  v_total := round((rec.valor_total + rec.multa + rec.juros - rec.desconto), 2);
  v_saldo_atual := round(v_total - coalesce(rec.valor_pago, 0), 2);

  if v_saldo_atual <= 0 then
    if rec.status <> 'paga' then
      update public.financeiro_contas_pagar
      set status = 'paga'
      where id = rec.id
        and empresa_id = v_empresa
      returning * into rec;
    end if;
    return to_jsonb(rec) || jsonb_build_object('saldo', 0);
  end if;

  if rec.status = 'paga' then
    raise exception '[FINANCEIRO][pagar] Esta conta já está paga.' using errcode = 'P0001';
  end if;

  -- Interpretação: p_valor_pago = valor pago NESTA operação (incremental).
  v_increment := round(coalesce(p_valor_pago, v_saldo_atual), 2);

  if v_increment <= 0 then
    raise exception '[FINANCEIRO][pagar] Informe um valor de pagamento válido.' using errcode = 'P0001';
  end if;

  if v_increment > v_saldo_atual then
    raise exception '[FINANCEIRO][pagar] Valor do pagamento maior que o saldo atual.' using errcode = 'P0001';
  end if;

  v_cc_id := coalesce(p_conta_corrente_id, public.financeiro_conta_corrente_escolher('pagamento'));
  v_pag_id := gen_random_uuid();

  insert into public.financeiro_contas_pagar_pagamentos (
    id,
    empresa_id,
    conta_pagar_id,
    data_pagamento,
    valor,
    conta_corrente_id
  ) values (
    v_pag_id,
    v_empresa,
    rec.id,
    v_data,
    v_increment,
    v_cc_id
  );

  insert into public.financeiro_movimentacoes (
    empresa_id,
    conta_corrente_id,
    data_movimento,
    data_competencia,
    tipo_mov,
    valor,
    descricao,
    documento_ref,
    origem_tipo,
    origem_id,
    categoria,
    centro_custo,
    conciliado,
    observacoes
  ) values (
    v_empresa,
    v_cc_id,
    v_data,
    rec.data_vencimento,
    'saida',
    v_increment,
    case
      when rec.descricao is null or btrim(rec.descricao) = '' then 'Pagamento'
      else 'Pagamento: ' || rec.descricao
    end,
    rec.documento_ref,
    'conta_a_pagar_pagamento',
    v_pag_id,
    rec.categoria,
    rec.centro_custo,
    false,
    null
  )
  on conflict (empresa_id, origem_tipo, origem_id)
    where origem_tipo is not null and origem_id is not null
  do update set
    conta_corrente_id = excluded.conta_corrente_id,
    data_movimento = excluded.data_movimento,
    data_competencia = excluded.data_competencia,
    valor = excluded.valor,
    descricao = excluded.descricao,
    documento_ref = excluded.documento_ref,
    categoria = excluded.categoria,
    centro_custo = excluded.centro_custo,
    updated_at = now()
  returning id into v_mov_id;

  update public.financeiro_contas_pagar_pagamentos
  set movimentacao_id = v_mov_id,
      updated_at = now()
  where id = v_pag_id
    and empresa_id = v_empresa;

  v_novo_pago := round(coalesce(rec.valor_pago, 0) + v_increment, 2);
  if v_novo_pago >= v_total then
    v_novo_pago := v_total;
    v_novo_status := 'paga';
  else
    v_novo_status := 'parcial';
  end if;

  update public.financeiro_contas_pagar
  set
    status = v_novo_status,
    data_pagamento = v_data,
    valor_pago = v_novo_pago
  where id = rec.id
    and empresa_id = v_empresa
  returning * into rec;

  perform pg_notify('app_log', '[RPC] financeiro_conta_pagar_pagar_v2 ' || p_id);

  return to_jsonb(rec)
    || jsonb_build_object(
      'saldo', round(v_total - rec.valor_pago, 2),
      'pagamento_id', v_pag_id,
      'movimentacao_id', v_mov_id
    );
end;
$$;

revoke all on function public.financeiro_conta_pagar_pagar_v2(uuid, date, numeric, uuid) from public, anon;
grant execute on function public.financeiro_conta_pagar_pagar_v2(uuid, date, numeric, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6) Override: estornar_v2 (total) estorna todos os pagamentos não estornados
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_conta_pagar_estornar_v2(
  p_id uuid,
  p_data_estorno date default null,
  p_conta_corrente_id uuid default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  rec public.financeiro_contas_pagar;
  v_pag_id uuid;
  v_has_conciliado boolean;
begin
  perform public.require_permission_for_current_user('contas_a_pagar','update');
  perform public.require_permission_for_current_user('tesouraria','create');

  select *
    into rec
  from public.financeiro_contas_pagar cp
  where cp.id = p_id
    and cp.empresa_id = v_empresa
  for update;

  if rec.id is null then
    raise exception '[FINANCEIRO][pagar][estornar] Conta a pagar não encontrada.' using errcode = 'P0001';
  end if;

  if coalesce(rec.valor_pago, 0) <= 0 then
    raise exception '[FINANCEIRO][pagar][estornar] Esta conta não possui pagamento registrado.' using errcode = 'P0001';
  end if;

  -- Se por algum motivo não houver eventos (estado legado), cria 1 evento sintético e migra a origem.
  if not exists (
    select 1
    from public.financeiro_contas_pagar_pagamentos p
    where p.empresa_id = v_empresa
      and p.conta_pagar_id = rec.id
  ) then
    v_pag_id := gen_random_uuid();
    insert into public.financeiro_contas_pagar_pagamentos (
      id,
      empresa_id,
      conta_pagar_id,
      data_pagamento,
      valor,
      conta_corrente_id,
      movimentacao_id,
      observacoes
    )
    select
      v_pag_id,
      v_empresa,
      rec.id,
      coalesce(rec.data_pagamento, current_date),
      rec.valor_pago,
      coalesce(m.conta_corrente_id, public.financeiro_conta_corrente_escolher('pagamento')),
      m.id,
      'Evento sintético (compat legado).'
    from (
      select m.*
      from public.financeiro_movimentacoes m
      where m.empresa_id = v_empresa
        and m.origem_tipo = 'conta_a_pagar'
        and m.origem_id = rec.id
      order by m.created_at desc
      limit 1
    ) m;

	    update public.financeiro_movimentacoes
	    set origem_tipo = 'conta_a_pagar_pagamento',
	        origem_id = v_pag_id,
	        updated_at = now()
	    where empresa_id = v_empresa
	      and id = (
	        select m2.id
	        from public.financeiro_movimentacoes m2
	        where m2.empresa_id = v_empresa
	          and m2.origem_tipo = 'conta_a_pagar'
	          and m2.origem_id = rec.id
	        order by m2.created_at desc
	        limit 1
	      );

	    if not exists (
	      select 1
	      from public.financeiro_contas_pagar_pagamentos p
	      where p.empresa_id = v_empresa
	        and p.conta_pagar_id = rec.id
	    ) then
	      raise exception '[FINANCEIRO][pagar][estornar] Não foi possível localizar/criar pagamentos para estorno.' using errcode = 'P0001';
	    end if;
	  end if;

  select exists (
	    select 1
	    from public.financeiro_contas_pagar_pagamentos p
	    left join public.financeiro_movimentacoes m on m.id = p.movimentacao_id and m.empresa_id = v_empresa
	    where p.empresa_id = v_empresa
	      and p.conta_pagar_id = rec.id
	      and p.estornado_at is null
	      and coalesce(m.conciliado, false) = true
  ) into v_has_conciliado;

  if coalesce(v_has_conciliado, false) = true then
    raise exception '[FINANCEIRO][pagar][estornar] Existem pagamentos conciliados. Desfaça a conciliação antes de estornar.' using errcode = 'P0001';
  end if;

  for v_pag_id in
    select p.id
    from public.financeiro_contas_pagar_pagamentos p
    where p.empresa_id = v_empresa
      and p.conta_pagar_id = rec.id
      and p.estornado_at is null
    order by p.data_pagamento desc, p.created_at desc
  loop
    perform public.financeiro_conta_pagar_pagamento_estornar(
      v_pag_id,
      p_data_estorno,
      p_conta_corrente_id,
      p_motivo
    );
  end loop;

  return public.financeiro_contas_pagar_get(rec.id);
end;
$$;

revoke all on function public.financeiro_conta_pagar_estornar_v2(uuid, date, uuid, text) from public, anon;
grant execute on function public.financeiro_conta_pagar_estornar_v2(uuid, date, uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7) Override: conciliação (extrato -> título) precisa localizar movimentação do pagamento-evento
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_conciliacao_conciliar_extrato_com_titulo(
  p_extrato_id uuid,
  p_tipo text, -- 'pagar' | 'receber'
  p_titulo_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_extrato record;
  v_mov_id uuid;
  v_total numeric;
  v_res jsonb;
begin
  perform public.require_permission_for_current_user('tesouraria', 'update');
  perform public.require_permission_for_current_user('financeiro', 'update');

  if p_tipo not in ('pagar','receber') then
    raise exception 'p_tipo inválido. Use pagar|receber.' using errcode = 'P0001';
  end if;

  select *
    into v_extrato
  from public.financeiro_extratos_bancarios e
  where e.id = p_extrato_id
    and e.empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'Extrato não encontrado ou acesso negado.' using errcode = 'P0001';
  end if;

  if coalesce(v_extrato.conciliado, false) is true then
    raise exception 'Extrato já conciliado.' using errcode = 'P0001';
  end if;

  if v_extrato.tipo_lancamento = 'debito' and p_tipo <> 'pagar' then
    raise exception 'Extrato (débito) só pode conciliar com título a pagar.' using errcode = 'P0001';
  end if;
  if v_extrato.tipo_lancamento = 'credito' and p_tipo <> 'receber' then
    raise exception 'Extrato (crédito) só pode conciliar com título a receber.' using errcode = 'P0001';
  end if;

  if p_tipo = 'pagar' then
    select (cp.valor_total + cp.multa + cp.juros - cp.desconto) - coalesce(cp.valor_pago,0)
      into v_total
    from public.financeiro_contas_pagar cp
    where cp.id = p_titulo_id
      and cp.empresa_id = v_empresa;

    if v_total is null then
      raise exception 'Conta a pagar não encontrada.' using errcode = 'P0001';
    end if;

    if abs(v_total - v_extrato.valor) > 0.01 then
      raise exception 'Valor do extrato não confere com o saldo do título. Use busca manual e/ou crie movimentação.' using errcode = 'P0001';
    end if;

    select public.financeiro_conta_pagar_pagar_v2(p_titulo_id, v_extrato.data_lancamento, v_extrato.valor, v_extrato.conta_corrente_id)
      into v_res;

    v_mov_id := nullif(v_res->>'movimentacao_id','')::uuid;
    if v_mov_id is null then
      select m.id
        into v_mov_id
      from public.financeiro_movimentacoes m
      where m.empresa_id = v_empresa
        and m.origem_tipo = 'conta_a_pagar'
        and m.origem_id = p_titulo_id
      order by m.created_at desc, m.id desc
      limit 1;
    end if;
  else
    select (cr.valor - coalesce(cr.valor_pago,0))
      into v_total
    from public.contas_a_receber cr
    where cr.id = p_titulo_id
      and cr.empresa_id = v_empresa;

    if v_total is null then
      raise exception 'Conta a receber não encontrada.' using errcode = 'P0001';
    end if;

    if abs(v_total - v_extrato.valor) > 0.01 then
      raise exception 'Valor do extrato não confere com o saldo do título. Use busca manual e/ou crie movimentação.' using errcode = 'P0001';
    end if;

    perform public.financeiro_conta_a_receber_receber_v2(p_titulo_id, v_extrato.data_lancamento, v_extrato.valor, v_extrato.conta_corrente_id);

    select m.id
      into v_mov_id
    from public.financeiro_movimentacoes m
    where m.empresa_id = v_empresa
      and m.origem_tipo = 'conta_a_receber'
      and m.origem_id = p_titulo_id
    order by m.created_at desc, m.id desc
    limit 1;
  end if;

  if v_mov_id is null then
    raise exception 'Falha ao localizar movimentação gerada para conciliação.' using errcode = 'P0001';
  end if;

  perform public.financeiro_extratos_bancarios_vincular_movimentacao(p_extrato_id, v_mov_id);
  return v_mov_id;
end;
$$;

revoke all on function public.financeiro_conciliacao_conciliar_extrato_com_titulo(uuid, text, uuid) from public, anon;
grant execute on function public.financeiro_conciliacao_conciliar_extrato_com_titulo(uuid, text, uuid) to authenticated, service_role;

create or replace function public.financeiro_conciliacao_conciliar_extrato_com_titulos(
  p_extrato_id uuid,
  p_tipo text,
  p_titulo_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_extrato record;
  v_total numeric := 0;
  v_item_total numeric;
  v_titulo_id uuid;
  v_mov_id uuid;
  v_first_mov uuid;
  v_ids uuid[];
  v_res jsonb;
begin
  perform public.require_permission_for_current_user('tesouraria','manage');

  if v_empresa is null then
    raise exception '[FINANCEIRO][TESOURARIA] Nenhuma empresa ativa encontrada.' using errcode = '42501';
  end if;

  if p_titulo_ids is null or array_length(p_titulo_ids, 1) is null then
    raise exception 'Selecione ao menos 1 título.' using errcode = 'P0001';
  end if;

  select array_agg(distinct x)
  into v_ids
  from unnest(p_titulo_ids) x;

  if v_ids is null or array_length(v_ids, 1) is null then
    raise exception 'Selecione ao menos 1 título.' using errcode = 'P0001';
  end if;

  select * into v_extrato
  from public.financeiro_extratos_bancarios e
  where e.id = p_extrato_id
    and e.empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'Extrato não encontrado ou acesso negado.' using errcode = 'P0001';
  end if;

  if v_extrato.conciliado then
    raise exception 'Extrato já conciliado.' using errcode = 'P0001';
  end if;

  if v_extrato.tipo_lancamento = 'debito' and p_tipo <> 'pagar' then
    raise exception 'Extrato (débito) só pode conciliar com título a pagar.' using errcode = 'P0001';
  end if;

  if v_extrato.tipo_lancamento = 'credito' and p_tipo <> 'receber' then
    raise exception 'Extrato (crédito) só pode conciliar com título a receber.' using errcode = 'P0001';
  end if;

  foreach v_titulo_id in array v_ids loop
    if p_tipo = 'pagar' then
      select (cp.valor_total + cp.multa + cp.juros - cp.desconto) - coalesce(cp.valor_pago, 0)
      into v_item_total
      from public.financeiro_contas_pagar cp
      where cp.id = v_titulo_id
        and cp.empresa_id = v_empresa;

      if v_item_total is null then
        raise exception 'Conta a pagar não encontrada.' using errcode = 'P0001';
      end if;
    else
      select (cr.valor - coalesce(cr.valor_pago, 0))
      into v_item_total
      from public.contas_a_receber cr
      where cr.id = v_titulo_id
        and cr.empresa_id = v_empresa;

      if v_item_total is null then
        raise exception 'Conta a receber não encontrada.' using errcode = 'P0001';
      end if;
    end if;

    v_total := v_total + coalesce(v_item_total, 0);
  end loop;

  if abs(v_total - v_extrato.valor) > 0.01 then
    raise exception 'Soma dos títulos (R$ %) não confere com o valor do extrato (R$ %). Ajuste a seleção.', v_total, v_extrato.valor using errcode = 'P0001';
  end if;

  foreach v_titulo_id in array v_ids loop
    if p_tipo = 'pagar' then
      select (cp.valor_total + cp.multa + cp.juros - cp.desconto) - coalesce(cp.valor_pago, 0)
      into v_item_total
      from public.financeiro_contas_pagar cp
      where cp.id = v_titulo_id
        and cp.empresa_id = v_empresa;

      select public.financeiro_conta_pagar_pagar_v2(v_titulo_id, v_extrato.data_lancamento, v_item_total, v_extrato.conta_corrente_id)
        into v_res;
      v_mov_id := nullif(v_res->>'movimentacao_id','')::uuid;

      if v_mov_id is null then
        select m.id
        into v_mov_id
        from public.financeiro_movimentacoes m
        where m.empresa_id = v_empresa
          and m.origem_tipo = 'conta_a_pagar'
          and m.origem_id = v_titulo_id
        order by m.created_at desc, m.id desc
        limit 1;
      end if;
    else
      select (cr.valor - coalesce(cr.valor_pago, 0))
      into v_item_total
      from public.contas_a_receber cr
      where cr.id = v_titulo_id
        and cr.empresa_id = v_empresa;

      perform public.financeiro_conta_a_receber_receber_v2(v_titulo_id, v_extrato.data_lancamento, v_item_total, v_extrato.conta_corrente_id);

      select m.id
      into v_mov_id
      from public.financeiro_movimentacoes m
      where m.empresa_id = v_empresa
        and m.origem_tipo = 'conta_a_receber'
        and m.origem_id = v_titulo_id
      order by m.created_at desc, m.id desc
      limit 1;
    end if;

    if v_mov_id is null then
      raise exception 'Falha ao localizar movimentação gerada para conciliação.' using errcode = 'P0001';
    end if;

    perform public.financeiro_extratos_bancarios_vincular_movimentacao(p_extrato_id, v_mov_id);

    if v_first_mov is null then
      v_first_mov := v_mov_id;
    end if;
  end loop;

  return v_first_mov;
end;
$$;

revoke all on function public.financeiro_conciliacao_conciliar_extrato_com_titulos(uuid, text, uuid[]) from public, anon;
grant execute on function public.financeiro_conciliacao_conciliar_extrato_com_titulos(uuid, text, uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
