/*
  Financeiro: Contas a Receber — recebimentos por evento + estorno parcial (estado da arte)

  Situação anterior
  - Baixa consolidada em (valor_pago, data_pagamento) e 1 movimentação por título.
  - Recebimento parcial marcava o título como "pago".
  - Estorno só era total (do título), sem escolha de qual recebimento estornar.

  Solução
  - Adicionar status 'parcial' ao enum public.status_conta_receber
  - Criar tabela de eventos: public.financeiro_contas_a_receber_recebimentos (1 linha por recebimento)
  - Cada recebimento gera 1 movimentação (entrada) com origem:
      origem_tipo = 'conta_a_receber_recebimento'
      origem_id   = recebimento_id
  - Estorno parcial: estorna o recebimento selecionado (bloqueia se conciliado).
  - Compat: financeiro_conta_a_receber_estornar_v2 passa a estornar todos os recebimentos não estornados (total).
*/

begin;

-- -----------------------------------------------------------------------------
-- 0) Status: adicionar "parcial" (idempotente)
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'status_conta_receber'
      and e.enumlabel = 'parcial'
  ) then
    alter type public.status_conta_receber add value 'parcial';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1) Tabela: recebimentos por evento
-- -----------------------------------------------------------------------------

create table if not exists public.financeiro_contas_a_receber_recebimentos (
  id                     uuid primary key default gen_random_uuid(),
  empresa_id              uuid not null default public.current_empresa_id(),
  conta_a_receber_id      uuid not null,
  data_recebimento        date not null default current_date,
  valor                  numeric(15,2) not null check (valor > 0),
  conta_corrente_id       uuid not null,
  observacoes             text,

  movimentacao_id         uuid,
  estornado_at            timestamptz,
  estornado_por           uuid,
  estorno_motivo          text,
  estorno_movimentacao_id uuid,

  created_at              timestamptz default now(),
  updated_at              timestamptz default now(),

  constraint fin_car_rec_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint fin_car_rec_conta_fkey foreign key (conta_a_receber_id) references public.contas_a_receber(id) on delete cascade,
  constraint fin_car_rec_cc_fkey foreign key (conta_corrente_id) references public.financeiro_contas_correntes(id) on delete restrict,
  constraint fin_car_rec_mov_fkey foreign key (movimentacao_id) references public.financeiro_movimentacoes(id) on delete set null,
  constraint fin_car_rec_estorno_mov_fkey foreign key (estorno_movimentacao_id) references public.financeiro_movimentacoes(id) on delete set null
);

create index if not exists idx_fin_car_rec_empresa on public.financeiro_contas_a_receber_recebimentos (empresa_id);
create index if not exists idx_fin_car_rec_empresa_conta on public.financeiro_contas_a_receber_recebimentos (empresa_id, conta_a_receber_id);
create index if not exists idx_fin_car_rec_empresa_estornado on public.financeiro_contas_a_receber_recebimentos (empresa_id, conta_a_receber_id, estornado_at);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'handle_updated_at_financeiro_contas_a_receber_recebimentos'
      and tgrelid = 'public.financeiro_contas_a_receber_recebimentos'::regclass
  ) then
    create trigger handle_updated_at_financeiro_contas_a_receber_recebimentos
      before update on public.financeiro_contas_a_receber_recebimentos
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

alter table public.financeiro_contas_a_receber_recebimentos enable row level security;

drop policy if exists fin_car_rec_select on public.financeiro_contas_a_receber_recebimentos;
drop policy if exists fin_car_rec_insert on public.financeiro_contas_a_receber_recebimentos;
drop policy if exists fin_car_rec_update on public.financeiro_contas_a_receber_recebimentos;
drop policy if exists fin_car_rec_delete on public.financeiro_contas_a_receber_recebimentos;

create policy fin_car_rec_select
  on public.financeiro_contas_a_receber_recebimentos
  for select
  using (empresa_id = public.current_empresa_id());

create policy fin_car_rec_insert
  on public.financeiro_contas_a_receber_recebimentos
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy fin_car_rec_update
  on public.financeiro_contas_a_receber_recebimentos
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy fin_car_rec_delete
  on public.financeiro_contas_a_receber_recebimentos
  for delete
  using (empresa_id = public.current_empresa_id());

-- RPC-first: nenhuma permissão direta para anon/authenticated
revoke all on table public.financeiro_contas_a_receber_recebimentos from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2) Backfill (estado atual): cria 1 evento para títulos já recebidos (consolidado)
--    - Migra origem da movimentação antiga ('conta_a_receber', conta_id) para o novo recebimento_id.
-- -----------------------------------------------------------------------------

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
  'Criado automaticamente (backfill recebimentos contas a receber).'
from (
  select distinct c.empresa_id
  from public.contas_a_receber c
  where coalesce(c.valor_pago, 0) > 0
) x
where not exists (
  select 1
  from public.financeiro_contas_correntes cc
  where cc.empresa_id = x.empresa_id
);

with to_backfill as (
  select
    c.id as conta_id,
    c.empresa_id,
    coalesce(c.data_pagamento, c.data_vencimento, current_date) as data_recebimento,
    round(coalesce(c.valor_pago, 0), 2) as valor,
    (
      select m.id
      from public.financeiro_movimentacoes m
      where m.empresa_id = c.empresa_id
        and m.origem_tipo = 'conta_a_receber'
        and m.origem_id = c.id
      order by m.created_at desc
      limit 1
    ) as mov_id,
    (
      select m.conta_corrente_id
      from public.financeiro_movimentacoes m
      where m.empresa_id = c.empresa_id
        and m.origem_tipo = 'conta_a_receber'
        and m.origem_id = c.id
      order by m.created_at desc
      limit 1
    ) as mov_cc_id,
    (
      select cc.id
      from public.financeiro_contas_correntes cc
      where cc.empresa_id = c.empresa_id
      order by
        (cc.padrao_para_recebimentos = true) desc,
        (cc.tipo_conta = 'caixa') desc,
        cc.updated_at desc
      limit 1
    ) as fallback_cc_id
  from public.contas_a_receber c
  where coalesce(c.valor_pago, 0) > 0
    and not exists (
      select 1
      from public.financeiro_contas_a_receber_recebimentos r
      where r.empresa_id = c.empresa_id
        and r.conta_a_receber_id = c.id
    )
),
ins as (
  insert into public.financeiro_contas_a_receber_recebimentos (
    empresa_id,
    conta_a_receber_id,
    data_recebimento,
    valor,
    conta_corrente_id,
    movimentacao_id,
    observacoes
  )
  select
    b.empresa_id,
    b.conta_id,
    b.data_recebimento,
    b.valor,
    coalesce(b.mov_cc_id, b.fallback_cc_id),
    b.mov_id,
    'Backfill (recebimento consolidado histórico).'
  from to_backfill b
  where b.valor > 0
    and coalesce(b.mov_cc_id, b.fallback_cc_id) is not null
  returning id, empresa_id, conta_a_receber_id, movimentacao_id, data_recebimento, valor, conta_corrente_id
)
update public.financeiro_movimentacoes m
set
  origem_tipo = 'conta_a_receber_recebimento',
  origem_id = ins.id,
  updated_at = now()
from ins
where ins.movimentacao_id is not null
  and m.id = ins.movimentacao_id
  and m.empresa_id = ins.empresa_id
  and m.origem_tipo = 'conta_a_receber'
  and m.origem_id = ins.conta_a_receber_id;

with need as (
  select
    r.id as recebimento_id,
    r.empresa_id,
    r.conta_a_receber_id,
    r.data_recebimento,
    r.valor,
    r.conta_corrente_id
  from public.financeiro_contas_a_receber_recebimentos r
  where r.movimentacao_id is null
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
    n.data_recebimento,
    c.data_vencimento,
    'entrada',
    n.valor,
    case
      when c.descricao is null or btrim(c.descricao) = '' then 'Recebimento'
      else 'Recebimento: ' || c.descricao
    end,
    null,
    'conta_a_receber_recebimento',
    n.recebimento_id,
    null,
    null,
    false,
    'Backfill (movimentação criada para recebimento histórico).'
  from need n
  join public.contas_a_receber c
    on c.id = n.conta_a_receber_id
   and c.empresa_id = n.empresa_id
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
update public.financeiro_contas_a_receber_recebimentos r
set movimentacao_id = mov.id,
    updated_at = now()
from mov
where r.empresa_id = mov.empresa_id
  and r.id = mov.origem_id
  and r.movimentacao_id is null;

-- -----------------------------------------------------------------------------
-- 3) RPC: listar recebimentos de um título
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_conta_a_receber_recebimentos_list(p_conta_a_receber_id uuid)
returns table(
  id uuid,
  data_recebimento date,
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
  perform public.require_permission_for_current_user('contas_a_receber', 'view');

  return query
  select
    r.id,
    r.data_recebimento,
    r.valor,
    r.conta_corrente_id,
    cc.nome as conta_corrente_nome,
    r.observacoes,
    (r.estornado_at is not null) as estornado,
    r.estornado_at,
    r.estorno_motivo,
    r.movimentacao_id,
    coalesce(m.conciliado, false) as movimentacao_conciliada,
    r.created_at
  from public.financeiro_contas_a_receber_recebimentos r
  join public.contas_a_receber c
    on c.id = r.conta_a_receber_id
   and c.empresa_id = v_empresa
  left join public.financeiro_contas_correntes cc on cc.id = r.conta_corrente_id and cc.empresa_id = v_empresa
  left join public.financeiro_movimentacoes m on m.id = r.movimentacao_id and m.empresa_id = v_empresa
  where r.empresa_id = v_empresa
    and r.conta_a_receber_id = p_conta_a_receber_id
  order by r.data_recebimento desc, r.created_at desc;
end;
$$;

revoke all on function public.financeiro_conta_a_receber_recebimentos_list(uuid) from public, anon;
grant execute on function public.financeiro_conta_a_receber_recebimentos_list(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) RPC: estornar 1 recebimento (parcial) por id do recebimento
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_conta_a_receber_recebimento_estornar(
  p_recebimento_id uuid,
  p_data_estorno date default null,
  p_conta_corrente_id uuid default null,
  p_motivo text default null
)
returns public.contas_a_receber
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
  v_novo_status public.status_conta_receber;
  v_cc_id uuid;
  v_mov public.financeiro_movimentacoes;
  v_rec public.contas_a_receber;
  v_rec_event record;
  v_estorno_mov_id uuid;
begin
  perform public.require_permission_for_current_user('contas_a_receber','update');
  perform public.require_permission_for_current_user('tesouraria','create');

  select
    r.*,
    (r.estornado_at is not null) as is_estornado
  into v_rec_event
  from public.financeiro_contas_a_receber_recebimentos r
  where r.id = p_recebimento_id
    and r.empresa_id = v_empresa
  for update;

  if not found then
    raise exception '[FINANCEIRO][receber][estornar] Recebimento não encontrado.' using errcode = 'P0001';
  end if;

  select *
    into v_rec
  from public.contas_a_receber c
  where c.id = v_rec_event.conta_a_receber_id
    and c.empresa_id = v_empresa
  for update;

  if v_rec.id is null then
    raise exception '[FINANCEIRO][receber][estornar] Conta a receber não encontrada.' using errcode = 'P0001';
  end if;

  if v_rec_event.is_estornado then
    return v_rec;
  end if;

  select *
    into v_mov
  from public.financeiro_movimentacoes m
  where m.empresa_id = v_empresa
    and m.id = v_rec_event.movimentacao_id
  limit 1;

  if v_mov.id is null then
    select *
      into v_mov
    from public.financeiro_movimentacoes m
    where m.empresa_id = v_empresa
      and m.origem_tipo = 'conta_a_receber_recebimento'
      and m.origem_id = v_rec_event.id
    order by m.created_at desc
    limit 1;
  end if;

  if v_mov.id is not null and coalesce(v_mov.conciliado, false) = true then
    raise exception '[FINANCEIRO][receber][estornar] Movimentação conciliada. Desfaça a conciliação antes de estornar.' using errcode = 'P0001';
  end if;

  v_cc_id := coalesce(p_conta_corrente_id, v_mov.conta_corrente_id, public.financeiro_conta_corrente_escolher('recebimento'));

  -- Mantém trilha e evita colisão no índice único (empresa_id, origem_tipo, origem_id)
  if v_mov.id is not null then
    update public.financeiro_movimentacoes
       set origem_tipo = 'conta_a_receber_recebimento_estornado',
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
    'saida',
    v_rec_event.valor,
    case
      when v_rec.descricao is null or btrim(v_rec.descricao) = '' then 'Estorno de recebimento'
      else 'Estorno: ' || v_rec.descricao
    end,
    null,
    'conta_a_receber_estorno',
    coalesce(v_mov.id, v_rec.id),
    null,
    null,
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

  update public.financeiro_contas_a_receber_recebimentos
     set estornado_at = now(),
         estornado_por = auth.uid(),
         estorno_motivo = nullif(btrim(p_motivo), ''),
         estorno_movimentacao_id = v_estorno_mov_id,
         updated_at = now()
   where id = v_rec_event.id
     and empresa_id = v_empresa
     and estornado_at is null;

  v_total := round(coalesce(v_rec.valor, 0), 2);

  select
    round(coalesce(sum(r.valor), 0), 2),
    max(r.data_recebimento)
  into v_sum, v_last_pay
  from public.financeiro_contas_a_receber_recebimentos r
  where r.empresa_id = v_empresa
    and r.conta_a_receber_id = v_rec.id
    and r.estornado_at is null;

  if coalesce(v_sum, 0) <= 0 then
    v_novo_status := 'pendente'::public.status_conta_receber;
    v_last_pay := null;
  elsif v_sum >= v_total then
    v_novo_status := 'pago'::public.status_conta_receber;
  else
    v_novo_status := 'parcial'::public.status_conta_receber;
  end if;

  update public.contas_a_receber
     set status = v_novo_status,
         valor_pago = case when coalesce(v_sum, 0) <= 0 then null else v_sum end,
         data_pagamento = v_last_pay,
         updated_at = now()
   where id = v_rec.id
     and empresa_id = v_empresa
   returning * into v_rec;

  return v_rec;
end;
$$;

revoke all on function public.financeiro_conta_a_receber_recebimento_estornar(uuid, date, uuid, text) from public, anon;
grant execute on function public.financeiro_conta_a_receber_recebimento_estornar(uuid, date, uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5) Override: receber_v2 cria evento + movimentação por recebimento
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_conta_a_receber_receber_v2(
  p_id uuid,
  p_data_pagamento date default null,
  p_valor_pago numeric default null,
  p_conta_corrente_id uuid default null
)
returns public.contas_a_receber
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  rec public.contas_a_receber;
  v_data date := coalesce(p_data_pagamento, current_date);
  v_total numeric;
  v_saldo_atual numeric;
  v_increment numeric;
  v_novo_pago numeric;
  v_novo_status public.status_conta_receber;
  v_cc_id uuid;
  v_rec_id uuid;
  v_mov_id uuid;
begin
  perform public.require_permission_for_current_user('contas_a_receber','update');
  perform public.require_permission_for_current_user('tesouraria','create');

  select *
    into rec
  from public.contas_a_receber c
  where c.id = p_id
    and c.empresa_id = v_empresa
  for update;

  if rec.id is null then
    raise exception '[FINANCEIRO][receber] Conta a receber não encontrada.' using errcode = 'P0001';
  end if;

  if rec.status = 'cancelado'::public.status_conta_receber then
    raise exception '[FINANCEIRO][receber] Não é possível receber uma conta cancelada.' using errcode = 'P0001';
  end if;

  v_total := round(coalesce(rec.valor, 0), 2);
  v_saldo_atual := round(v_total - coalesce(rec.valor_pago, 0), 2);

  if v_saldo_atual <= 0 then
    if rec.status <> 'pago'::public.status_conta_receber then
      update public.contas_a_receber
      set status = 'pago'::public.status_conta_receber
      where id = rec.id and empresa_id = v_empresa
      returning * into rec;
    end if;
    return rec;
  end if;

  if rec.status = 'pago'::public.status_conta_receber then
    raise exception '[FINANCEIRO][receber] Esta conta já está paga.' using errcode = 'P0001';
  end if;

  v_increment := round(coalesce(p_valor_pago, v_saldo_atual), 2);

  if v_increment <= 0 then
    raise exception '[FINANCEIRO][receber] Informe um valor de recebimento válido.' using errcode = 'P0001';
  end if;

  if v_increment > v_saldo_atual then
    raise exception '[FINANCEIRO][receber] Valor do recebimento maior que o saldo atual.' using errcode = 'P0001';
  end if;

  v_cc_id := coalesce(p_conta_corrente_id, public.financeiro_conta_corrente_escolher('recebimento'));
  v_rec_id := gen_random_uuid();

  insert into public.financeiro_contas_a_receber_recebimentos (
    id,
    empresa_id,
    conta_a_receber_id,
    data_recebimento,
    valor,
    conta_corrente_id
  ) values (
    v_rec_id,
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
    'entrada',
    v_increment,
    case
      when rec.descricao is null or btrim(rec.descricao) = '' then 'Recebimento'
      else 'Recebimento: ' || rec.descricao
    end,
    null,
    'conta_a_receber_recebimento',
    v_rec_id,
    null,
    null,
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

  update public.financeiro_contas_a_receber_recebimentos
  set movimentacao_id = v_mov_id,
      updated_at = now()
  where id = v_rec_id
    and empresa_id = v_empresa;

  v_novo_pago := round(coalesce(rec.valor_pago, 0) + v_increment, 2);
  if v_novo_pago >= v_total then
    v_novo_pago := v_total;
    v_novo_status := 'pago'::public.status_conta_receber;
  else
    v_novo_status := 'parcial'::public.status_conta_receber;
  end if;

  update public.contas_a_receber
  set
    status = v_novo_status,
    data_pagamento = v_data,
    valor_pago = v_novo_pago
  where id = rec.id and empresa_id = v_empresa
  returning * into rec;

  perform pg_notify('app_log', '[RPC] financeiro_conta_a_receber_receber_v2 ' || p_id);
  return rec;
end;
$$;

revoke all on function public.financeiro_conta_a_receber_receber_v2(uuid, date, numeric, uuid) from public, anon;
grant execute on function public.financeiro_conta_a_receber_receber_v2(uuid, date, numeric, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6) Override: estornar_v2 (total) estorna todos os recebimentos não estornados
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_conta_a_receber_estornar_v2(
  p_id uuid,
  p_data_estorno date default null,
  p_conta_corrente_id uuid default null,
  p_motivo text default null
)
returns public.contas_a_receber
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  rec public.contas_a_receber;
  v_rec_id uuid;
  v_has_conciliado boolean;
begin
  perform public.require_permission_for_current_user('contas_a_receber','update');
  perform public.require_permission_for_current_user('tesouraria','create');

  select * into rec
  from public.contas_a_receber c
  where c.id = p_id and c.empresa_id = v_empresa
  for update;

  if rec.id is null then
    raise exception '[FINANCEIRO][estornar] Conta a receber não encontrada.' using errcode = 'P0001';
  end if;

  if coalesce(rec.valor_pago, 0) <= 0 then
    raise exception '[FINANCEIRO][estornar] Esta conta não possui recebimento registrado.' using errcode = 'P0001';
  end if;

  -- Compat legado: se não houver eventos, cria 1 evento sintético e migra a origem da movimentação antiga (mais recente).
  if not exists (
    select 1
    from public.financeiro_contas_a_receber_recebimentos r
    where r.empresa_id = v_empresa
      and r.conta_a_receber_id = rec.id
  ) then
    v_rec_id := gen_random_uuid();
    insert into public.financeiro_contas_a_receber_recebimentos (
      id,
      empresa_id,
      conta_a_receber_id,
      data_recebimento,
      valor,
      conta_corrente_id,
      movimentacao_id,
      observacoes
    )
    select
      v_rec_id,
      v_empresa,
      rec.id,
      coalesce(rec.data_pagamento, current_date),
      rec.valor_pago,
      coalesce(m.conta_corrente_id, public.financeiro_conta_corrente_escolher('recebimento')),
      m.id,
      'Evento sintético (compat legado).'
    from (
      select m.*
      from public.financeiro_movimentacoes m
      where m.empresa_id = v_empresa
        and m.origem_tipo = 'conta_a_receber'
        and m.origem_id = rec.id
      order by m.created_at desc
      limit 1
    ) m;

    update public.financeiro_movimentacoes
    set origem_tipo = 'conta_a_receber_recebimento',
        origem_id = v_rec_id,
        updated_at = now()
    where empresa_id = v_empresa
      and id = (
        select m2.id
        from public.financeiro_movimentacoes m2
        where m2.empresa_id = v_empresa
          and m2.origem_tipo = 'conta_a_receber'
          and m2.origem_id = rec.id
        order by m2.created_at desc
        limit 1
      );
  end if;

  select exists (
    select 1
    from public.financeiro_contas_a_receber_recebimentos r
    left join public.financeiro_movimentacoes m on m.id = r.movimentacao_id and m.empresa_id = v_empresa
    where r.empresa_id = v_empresa
      and r.conta_a_receber_id = rec.id
      and r.estornado_at is null
      and coalesce(m.conciliado, false) = true
  ) into v_has_conciliado;

  if coalesce(v_has_conciliado, false) = true then
    raise exception '[FINANCEIRO][estornar] Existem recebimentos conciliados. Desfaça a conciliação antes de estornar.' using errcode = 'P0001';
  end if;

  for v_rec_id in
    select r.id
    from public.financeiro_contas_a_receber_recebimentos r
    where r.empresa_id = v_empresa
      and r.conta_a_receber_id = rec.id
      and r.estornado_at is null
    order by r.data_recebimento desc, r.created_at desc
  loop
    perform public.financeiro_conta_a_receber_recebimento_estornar(
      v_rec_id,
      p_data_estorno,
      p_conta_corrente_id,
      p_motivo
    );
  end loop;

  select * into rec
  from public.contas_a_receber c
  where c.id = p_id and c.empresa_id = v_empresa;

  return rec;
end;
$$;

revoke all on function public.financeiro_conta_a_receber_estornar_v2(uuid, date, uuid, text) from public, anon;
grant execute on function public.financeiro_conta_a_receber_estornar_v2(uuid, date, uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6.1) Ajuste: cancelar deve bloquear títulos pagos/parciais
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_conta_a_receber_cancelar(
  p_id uuid,
  p_motivo text default null
)
returns public.contas_a_receber
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  rec public.contas_a_receber;
begin
  perform public.require_permission_for_current_user('contas_a_receber','update');

  select * into rec
  from public.contas_a_receber
  where id = p_id and empresa_id = v_empresa;

  if rec.id is null then
    raise exception '[FINANCEIRO][cancelar] Conta a receber não encontrada.' using errcode = 'P0001';
  end if;

  if rec.status in ('pago'::public.status_conta_receber, 'parcial'::public.status_conta_receber) then
    raise exception '[FINANCEIRO][cancelar] Conta possui recebimentos. Estorne antes de cancelar.' using errcode = 'P0001';
  end if;

  update public.contas_a_receber
     set status = 'cancelado'::public.status_conta_receber,
         observacoes = case
           when coalesce(nullif(btrim(p_motivo), ''), '') = '' then observacoes
           when observacoes is null or btrim(observacoes) = '' then '[CANCELADO] ' || btrim(p_motivo)
           else observacoes || E'\n' || '[CANCELADO] ' || btrim(p_motivo)
         end,
         updated_at = now()
   where id = rec.id and empresa_id = v_empresa
  returning * into rec;

  return rec;
end;
$$;

revoke all on function public.financeiro_conta_a_receber_cancelar(uuid, text) from public, anon;
grant execute on function public.financeiro_conta_a_receber_cancelar(uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7) Ajuste: summary considera "parcial"
-- -----------------------------------------------------------------------------

create or replace function public.get_contas_a_receber_summary_v2(
  p_start_date date default null,
  p_end_date date default null
)
returns table(total_pendente numeric, total_pago_mes numeric, total_vencido numeric)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  select
    coalesce(sum(
      case
        when status = 'pendente'::public.status_conta_receber then valor
        when status = 'vencido'::public.status_conta_receber then valor
        when status = 'parcial'::public.status_conta_receber then greatest(valor - coalesce(valor_pago, 0), 0)
        else 0
      end
    ), 0) as total_pendente,
    coalesce(sum(
      case
        when status not in ('pago'::public.status_conta_receber, 'parcial'::public.status_conta_receber) then 0
        when (p_start_date is not null or p_end_date is not null)
          and (p_start_date is null or data_pagamento >= p_start_date)
          and (p_end_date is null or data_pagamento <= p_end_date)
          then coalesce(valor_pago, 0)
        when (p_start_date is null and p_end_date is null)
          and date_trunc('month', data_pagamento) = date_trunc('month', current_date)
          then coalesce(valor_pago, 0)
        else 0
      end
    ), 0) as total_pago_mes,
    coalesce(sum(case when status = 'vencido'::public.status_conta_receber then valor else 0 end), 0) as total_vencido
  from public.contas_a_receber
  where empresa_id = public.current_empresa_id()
    and (p_start_date is null or data_vencimento >= p_start_date)
    and (p_end_date is null or data_vencimento <= p_end_date);
end;
$$;

revoke all on function public.get_contas_a_receber_summary_v2(date, date) from public;
grant execute on function public.get_contas_a_receber_summary_v2(date, date) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8) Override: conciliação (extrato -> título) localiza movimentação do recebimento-evento
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_conciliacao_conciliar_extrato_com_titulo(
  p_extrato_id uuid,
  p_tipo text,
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
    join public.financeiro_contas_a_receber_recebimentos r
      on r.id = m.origem_id
     and m.origem_tipo = 'conta_a_receber_recebimento'
    where r.empresa_id = v_empresa
      and r.conta_a_receber_id = p_titulo_id
    order by r.created_at desc, m.created_at desc
    limit 1;

    if v_mov_id is null then
      select m.id
        into v_mov_id
      from public.financeiro_movimentacoes m
      where m.empresa_id = v_empresa
        and m.origem_tipo = 'conta_a_receber'
        and m.origem_id = p_titulo_id
      order by m.created_at desc, m.id desc
      limit 1;
    end if;
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
      join public.financeiro_contas_a_receber_recebimentos r
        on r.id = m.origem_id
       and m.origem_tipo = 'conta_a_receber_recebimento'
      where r.empresa_id = v_empresa
        and r.conta_a_receber_id = v_titulo_id
      order by r.created_at desc, m.created_at desc
      limit 1;

      if v_mov_id is null then
        select m.id
        into v_mov_id
        from public.financeiro_movimentacoes m
        where m.empresa_id = v_empresa
          and m.origem_tipo = 'conta_a_receber'
          and m.origem_id = v_titulo_id
        order by m.created_at desc, m.id desc
        limit 1;
      end if;
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
