begin;

-- -----------------------------------------------------------------------------
-- Conciliação bancária: permitir 1 extrato conciliar com N movimentações
-- (ex.: 1 pagamento baixando vários títulos).
-- Mantemos financeiro_extratos_bancarios.movimentacao_id como "principal" para UI legada.
-- -----------------------------------------------------------------------------

create table if not exists public.financeiro_extratos_bancarios_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  extrato_id uuid not null,
  movimentacao_id uuid not null,
  created_at timestamptz not null default now(),
  constraint financeiro_extratos_bancarios_movs_extrato_fk
    foreign key (extrato_id) references public.financeiro_extratos_bancarios(id) on delete cascade,
  constraint financeiro_extratos_bancarios_movs_mov_fk
    foreign key (movimentacao_id) references public.financeiro_movimentacoes(id) on delete cascade,
  constraint financeiro_extratos_bancarios_movs_uniq unique (extrato_id, movimentacao_id)
);

create index if not exists idx_fin_extratos_movs_empresa on public.financeiro_extratos_bancarios_movimentacoes(empresa_id);
create index if not exists idx_fin_extratos_movs_extrato on public.financeiro_extratos_bancarios_movimentacoes(extrato_id);
create index if not exists idx_fin_extratos_movs_mov on public.financeiro_extratos_bancarios_movimentacoes(movimentacao_id);

alter table public.financeiro_extratos_bancarios_movimentacoes enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'financeiro_extratos_bancarios_movimentacoes'
      and policyname = 'tenant_isolation'
  ) then
    create policy tenant_isolation
    on public.financeiro_extratos_bancarios_movimentacoes
    for all
    to authenticated
    using (empresa_id = public.current_empresa_id())
    with check (empresa_id = public.current_empresa_id());
  end if;
end $$;

revoke all on table public.financeiro_extratos_bancarios_movimentacoes from public, anon, authenticated;
grant all on table public.financeiro_extratos_bancarios_movimentacoes to service_role;

-- Backfill do vínculo "principal" já existente.
insert into public.financeiro_extratos_bancarios_movimentacoes (empresa_id, extrato_id, movimentacao_id)
select e.empresa_id, e.id, e.movimentacao_id
from public.financeiro_extratos_bancarios e
where e.movimentacao_id is not null
on conflict (extrato_id, movimentacao_id) do nothing;

-- -----------------------------------------------------------------------------
-- Atualiza RPCs de vincular/desvincular para suportar N movimentações por extrato.
-- -----------------------------------------------------------------------------

create or replace function public.financeiro_extratos_bancarios_vincular_movimentacao(
  p_extrato_id uuid,
  p_movimentacao_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_extrato record;
  v_mov record;
begin
  perform public.require_permission_for_current_user('tesouraria','manage');

  select * into v_extrato
  from public.financeiro_extratos_bancarios e
  where e.id = p_extrato_id
    and e.empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'Extrato não encontrado ou acesso negado.';
  end if;

  select * into v_mov
  from public.financeiro_movimentacoes m
  where m.id = p_movimentacao_id
    and m.empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'Movimentação não encontrada ou acesso negado.';
  end if;

  if v_extrato.conta_corrente_id <> v_mov.conta_corrente_id then
    raise exception 'Conta do extrato difere da conta da movimentação.';
  end if;

  if v_extrato.tipo_lancamento = 'credito' and v_mov.tipo_mov <> 'entrada' then
    raise exception 'Lançamento de crédito só pode ser conciliado com movimentação de entrada.';
  end if;

  if v_extrato.tipo_lancamento = 'debito' and v_mov.tipo_mov <> 'saida' then
    raise exception 'Lançamento de débito só pode ser conciliado com movimentação de saída.';
  end if;

  insert into public.financeiro_extratos_bancarios_movimentacoes (empresa_id, extrato_id, movimentacao_id)
  values (v_empresa, v_extrato.id, v_mov.id)
  on conflict (extrato_id, movimentacao_id) do nothing;

  update public.financeiro_extratos_bancarios
  set movimentacao_id = case when movimentacao_id is null then v_mov.id else movimentacao_id end,
      conciliado = true
  where id = v_extrato.id;

  update public.financeiro_movimentacoes
  set conciliado = true
  where id = v_mov.id;

  perform pg_notify('app_log', '[RPC] financeiro_extratos_bancarios_vincular_movimentacao: extrato=' || p_extrato_id || ' mov=' || p_movimentacao_id);
end;
$$;

revoke all on function public.financeiro_extratos_bancarios_vincular_movimentacao(uuid, uuid) from public;
grant execute on function public.financeiro_extratos_bancarios_vincular_movimentacao(uuid, uuid) to authenticated, service_role;

create or replace function public.financeiro_extratos_bancarios_desvincular(p_extrato_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_mov_ids uuid[];
  v_mov_id uuid;
begin
  perform public.require_permission_for_current_user('tesouraria','manage');

  select array_agg(x.movimentacao_id order by x.created_at asc, x.id asc)
  into v_mov_ids
  from public.financeiro_extratos_bancarios_movimentacoes x
  where x.extrato_id = p_extrato_id
    and x.empresa_id = v_empresa;

  if v_mov_ids is null then
    select array_agg(e.movimentacao_id)
    into v_mov_ids
    from public.financeiro_extratos_bancarios e
    where e.id = p_extrato_id
      and e.empresa_id = v_empresa
      and e.movimentacao_id is not null;
  end if;

  delete from public.financeiro_extratos_bancarios_movimentacoes x
  where x.extrato_id = p_extrato_id
    and x.empresa_id = v_empresa;

  update public.financeiro_extratos_bancarios
  set movimentacao_id = null,
      conciliado = false
  where id = p_extrato_id
    and empresa_id = v_empresa;

  if v_mov_ids is not null then
    foreach v_mov_id in array v_mov_ids loop
      if v_mov_id is null then
        continue;
      end if;

      if not exists (
        select 1
        from public.financeiro_extratos_bancarios_movimentacoes x
        where x.empresa_id = v_empresa
          and x.movimentacao_id = v_mov_id
      )
      and not exists (
        select 1
        from public.financeiro_extratos_bancarios e2
        where e2.empresa_id = v_empresa
          and e2.movimentacao_id = v_mov_id
      ) then
        update public.financeiro_movimentacoes
        set conciliado = false
        where id = v_mov_id
          and empresa_id = v_empresa;
      end if;
    end loop;
  end if;

  perform pg_notify('app_log', '[RPC] financeiro_extratos_bancarios_desvincular: extrato=' || p_extrato_id);
end;
$$;

revoke all on function public.financeiro_extratos_bancarios_desvincular(uuid) from public;
grant execute on function public.financeiro_extratos_bancarios_desvincular(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RPC: conciliar 1 extrato com N títulos (baixa em lote)
-- -----------------------------------------------------------------------------

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

      perform public.financeiro_conta_pagar_pagar_v2(v_titulo_id, v_extrato.data_lancamento, v_item_total, v_extrato.conta_corrente_id);

      select m.id
      into v_mov_id
      from public.financeiro_movimentacoes m
      where m.empresa_id = v_empresa
        and m.origem_tipo = 'conta_a_pagar'
        and m.origem_id = v_titulo_id
      order by m.created_at desc, m.id desc
      limit 1;
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
