/*
  SUP-STA-03: Devolução ao fornecedor vinculada a OC/Recebimento (reversão auditável)

  Objetivo
  - Permitir devolver parte/total de um Recebimento concluído ao fornecedor.
  - Gerar saída de estoque auditável (kardex) e manter idempotência.
  - Vincular a devolução ao recebimento (e itens), para rastreabilidade e suporte.

  Observações
  - Usa depósito padrão quando multi-estoque estiver ativo.
  - Mantém compatibilidade com ambientes legados (sem depósitos).
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) Tabelas
-- -----------------------------------------------------------------------------
create table if not exists public.suprimentos_devolucoes_fornecedor (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  recebimento_id uuid not null references public.recebimentos(id) on delete cascade,
  deposito_id uuid null references public.estoque_depositos(id) on delete set null,
  status text not null default 'rascunho' check (status in ('rascunho','aplicada','cancelada')),
  motivo text null,
  created_by uuid null default auth.uid(),
  applied_by uuid null,
  applied_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sup_devol_fornecedor_empresa_created
  on public.suprimentos_devolucoes_fornecedor (empresa_id, created_at desc);

create index if not exists idx_sup_devol_fornecedor_recebimento
  on public.suprimentos_devolucoes_fornecedor (empresa_id, recebimento_id);

drop trigger if exists tg_sup_devol_fornecedor_set_updated_at on public.suprimentos_devolucoes_fornecedor;
create trigger tg_sup_devol_fornecedor_set_updated_at
before update on public.suprimentos_devolucoes_fornecedor
for each row execute function public.tg_set_updated_at();

create table if not exists public.suprimentos_devolucao_fornecedor_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  devolucao_id uuid not null references public.suprimentos_devolucoes_fornecedor(id) on delete cascade,
  recebimento_item_id uuid not null references public.recebimento_itens(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  quantidade numeric(15,4) not null check (quantidade > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sup_devol_forn_itens_uk unique (devolucao_id, recebimento_item_id)
);

create index if not exists idx_sup_devol_forn_itens_devolucao
  on public.suprimentos_devolucao_fornecedor_itens (devolucao_id);

create index if not exists idx_sup_devol_forn_itens_produto
  on public.suprimentos_devolucao_fornecedor_itens (empresa_id, produto_id);

drop trigger if exists tg_sup_devol_fornecedor_itens_set_updated_at on public.suprimentos_devolucao_fornecedor_itens;
create trigger tg_sup_devol_fornecedor_itens_set_updated_at
before update on public.suprimentos_devolucao_fornecedor_itens
for each row execute function public.tg_set_updated_at();

alter table public.suprimentos_devolucoes_fornecedor enable row level security;
alter table public.suprimentos_devolucao_fornecedor_itens enable row level security;

drop policy if exists sup_devol_forn_sel on public.suprimentos_devolucoes_fornecedor;
create policy sup_devol_forn_sel
  on public.suprimentos_devolucoes_fornecedor
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists sup_devol_forn_ins on public.suprimentos_devolucoes_fornecedor;
create policy sup_devol_forn_ins
  on public.suprimentos_devolucoes_fornecedor
  for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

drop policy if exists sup_devol_forn_upd on public.suprimentos_devolucoes_fornecedor;
create policy sup_devol_forn_upd
  on public.suprimentos_devolucoes_fornecedor
  for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists sup_devol_forn_del on public.suprimentos_devolucoes_fornecedor;
create policy sup_devol_forn_del
  on public.suprimentos_devolucoes_fornecedor
  for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists sup_devol_forn_itens_sel on public.suprimentos_devolucao_fornecedor_itens;
create policy sup_devol_forn_itens_sel
  on public.suprimentos_devolucao_fornecedor_itens
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists sup_devol_forn_itens_ins on public.suprimentos_devolucao_fornecedor_itens;
create policy sup_devol_forn_itens_ins
  on public.suprimentos_devolucao_fornecedor_itens
  for insert
  to authenticated
  with check (empresa_id = public.current_empresa_id());

drop policy if exists sup_devol_forn_itens_upd on public.suprimentos_devolucao_fornecedor_itens;
create policy sup_devol_forn_itens_upd
  on public.suprimentos_devolucao_fornecedor_itens
  for update
  to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists sup_devol_forn_itens_del on public.suprimentos_devolucao_fornecedor_itens;
create policy sup_devol_forn_itens_del
  on public.suprimentos_devolucao_fornecedor_itens
  for delete
  to authenticated
  using (empresa_id = public.current_empresa_id());

grant select, insert, update, delete on table public.suprimentos_devolucoes_fornecedor to authenticated;
grant select, insert, update, delete on table public.suprimentos_devolucao_fornecedor_itens to authenticated;

-- Auditoria (best-effort, se `process_audit_log` existir)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'process_audit_log') then
    execute 'drop trigger if exists audit_logs_trigger on public.suprimentos_devolucoes_fornecedor';
    execute 'create trigger audit_logs_trigger after insert or update or delete on public.suprimentos_devolucoes_fornecedor for each row execute function public.process_audit_log()';

    execute 'drop trigger if exists audit_logs_trigger on public.suprimentos_devolucao_fornecedor_itens';
    execute 'create trigger audit_logs_trigger after insert or update or delete on public.suprimentos_devolucao_fornecedor_itens for each row execute function public.process_audit_log()';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2) RPCs
-- -----------------------------------------------------------------------------
drop function if exists public.suprimentos_devolucao_fornecedor_create(uuid, uuid, text, jsonb);
create or replace function public.suprimentos_devolucao_fornecedor_create(
  p_recebimento_id uuid,
  p_deposito_id uuid default null,
  p_motivo text default null,
  p_itens jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_id uuid;
  v_status text;
  v_classificacao text;
  v_item record;
  v_qtd numeric;
  v_max numeric;
begin
  perform public.require_plano_mvp_allows('suprimentos');
  perform public.require_permission_for_current_user('suprimentos','update');

  select status, classificacao into v_status, v_classificacao
  from public.recebimentos
  where id = p_recebimento_id and empresa_id = v_emp
  for update;

  if v_status is null then
    raise exception 'Recebimento não encontrado.' using errcode='P0001';
  end if;
  if v_status <> 'concluido' then
    raise exception 'Somente recebimentos concluídos podem ser devolvidos (status atual: %).', v_status using errcode='P0001';
  end if;

  if v_classificacao is not null and v_classificacao <> 'estoque_proprio' then
    raise exception 'Devolução ao fornecedor disponível apenas para recebimentos classificados como Estoque Próprio.' using errcode='P0001';
  end if;

  insert into public.suprimentos_devolucoes_fornecedor (
    empresa_id, recebimento_id, deposito_id, status, motivo, created_by
  )
  values (
    v_emp, p_recebimento_id, p_deposito_id, 'rascunho', nullif(btrim(p_motivo), ''), auth.uid()
  )
  returning id into v_id;

  for v_item in
    select * from jsonb_to_recordset(coalesce(p_itens, '[]'::jsonb)) as x(
      recebimento_item_id uuid,
      quantidade numeric
    )
  loop
    v_qtd := coalesce(v_item.quantidade, 0);
    if v_qtd <= 0 then
      continue;
    end if;

    select
      coalesce(nullif(ri.quantidade_conferida, 0), ri.quantidade_xml) as max_qtd
    into v_max
    from public.recebimento_itens ri
    where ri.id = v_item.recebimento_item_id
      and ri.empresa_id = v_emp
      and ri.recebimento_id = p_recebimento_id
      and ri.produto_id is not null;

    if v_max is null then
      raise exception 'Item de recebimento inválido ou sem produto vinculado.' using errcode='P0001';
    end if;

    if v_qtd > v_max then
      raise exception 'Quantidade devolvida maior que a recebida (max=%, informado=%).', v_max, v_qtd using errcode='P0001';
    end if;

    insert into public.suprimentos_devolucao_fornecedor_itens (
      empresa_id, devolucao_id, recebimento_item_id, produto_id, quantidade
    )
    select
      v_emp, v_id, ri.id, ri.produto_id, v_qtd
    from public.recebimento_itens ri
    where ri.id = v_item.recebimento_item_id
      and ri.empresa_id = v_emp
      and ri.recebimento_id = p_recebimento_id
      and ri.produto_id is not null
    on conflict (devolucao_id, recebimento_item_id)
    do update set
      quantidade = excluded.quantidade,
      updated_at = now();
  end loop;

  if not exists (
    select 1 from public.suprimentos_devolucao_fornecedor_itens
    where devolucao_id = v_id and empresa_id = v_emp
  ) then
    raise exception 'Selecione ao menos 1 item para devolução.' using errcode='P0001';
  end if;

  return v_id;
end;
$$;

revoke all on function public.suprimentos_devolucao_fornecedor_create(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.suprimentos_devolucao_fornecedor_create(uuid, uuid, text, jsonb) to authenticated, service_role;

drop function if exists public.suprimentos_devolucao_fornecedor_apply(uuid);
create or replace function public.suprimentos_devolucao_fornecedor_apply(
  p_devolucao_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_row record;
  v_item record;
  v_has_depositos boolean := false;
  v_dep uuid;
  v_saldo_ant numeric := 0;
  v_saldo_novo numeric := 0;
  v_custo_ant numeric := 0;
  v_total numeric := 0;
  v_total_custo numeric := 0;
  v_doc text;
  v_obs text;
  v_rows int := 0;
begin
  perform public.require_plano_mvp_allows('suprimentos');
  perform public.require_permission_for_current_user('suprimentos','update');

  select d.id, d.status, d.deposito_id, d.motivo
    into v_row
  from public.suprimentos_devolucoes_fornecedor d
  where d.id = p_devolucao_id and d.empresa_id = v_emp
  for update;

  if v_row.id is null then
    raise exception 'Devolução não encontrada.' using errcode='P0001';
  end if;

  if v_row.status = 'aplicada' then
    return jsonb_build_object('status','already_applied');
  end if;
  if v_row.status = 'cancelada' then
    raise exception 'Devolução cancelada não pode ser aplicada.' using errcode='P0001';
  end if;

  v_has_depositos := (to_regclass('public.estoque_saldos_depositos') is not null);
  if v_has_depositos then
    begin
      v_dep := coalesce(v_row.deposito_id, public.suprimentos_default_deposito_ensure());
    exception when undefined_function then
      v_has_depositos := false;
    end;
  end if;

  v_doc := 'DEVF-' || left(replace(p_devolucao_id::text, '-', ''), 12);
  v_obs := coalesce(nullif(v_row.motivo::text, ''), 'Devolução ao fornecedor');

  for v_item in
    select i.produto_id, i.quantidade
    from public.suprimentos_devolucao_fornecedor_itens i
    where i.devolucao_id = p_devolucao_id and i.empresa_id = v_emp
  loop
    if coalesce(v_item.quantidade, 0) <= 0 then
      continue;
    end if;

    if v_has_depositos then
      -- lock por (empresa, deposito)
      perform pg_advisory_xact_lock(
        ('x'||substr(replace(v_emp::text,'-',''),1,16))::bit(64)::bigint,
        ('x'||substr(replace(v_dep::text,'-',''),1,16))::bit(64)::bigint
      );

      insert into public.estoque_saldos_depositos (empresa_id, produto_id, deposito_id, saldo, custo_medio)
      values (v_emp, v_item.produto_id, v_dep, 0, 0)
      on conflict (empresa_id, produto_id, deposito_id) do nothing;

      select saldo, custo_medio
        into v_saldo_ant, v_custo_ant
      from public.estoque_saldos_depositos
      where empresa_id = v_emp and produto_id = v_item.produto_id and deposito_id = v_dep
      for update;

      v_saldo_novo := coalesce(v_saldo_ant,0) - v_item.quantidade;

      update public.estoque_saldos_depositos
      set saldo = v_saldo_novo, custo_medio = v_custo_ant, updated_at = now()
      where empresa_id = v_emp and produto_id = v_item.produto_id and deposito_id = v_dep;

      select coalesce(sum(saldo),0), coalesce(sum(saldo * custo_medio),0)
        into v_total, v_total_custo
      from public.estoque_saldos_depositos
      where empresa_id = v_emp and produto_id = v_item.produto_id;

      insert into public.estoque_saldos (empresa_id, produto_id, saldo, custo_medio)
      values (v_emp, v_item.produto_id, v_total, case when v_total <= 0 then 0 else (v_total_custo / v_total) end)
      on conflict (empresa_id, produto_id) do update
        set saldo = excluded.saldo,
            custo_medio = excluded.custo_medio,
            updated_at = now();

      begin
        update public.estoque_lotes
        set saldo = greatest(coalesce(saldo,0) - v_item.quantidade, 0),
            updated_at = now()
        where empresa_id = v_emp and produto_id = v_item.produto_id and lote = 'SEM_LOTE';
      exception when undefined_table then
        null;
      end;

      insert into public.estoque_movimentos (
        empresa_id,
        produto_id,
        deposito_id,
        data_movimento,
        tipo,
        tipo_mov,
        quantidade,
        saldo_anterior,
        saldo_atual,
        custo_medio,
        origem_tipo,
        origem_id,
        origem,
        lote,
        observacoes
      )
      values (
        v_emp,
        v_item.produto_id,
        v_dep,
        current_date,
        'saida',
        'devolucao_fornecedor',
        v_item.quantidade,
        coalesce(v_saldo_ant,0),
        v_saldo_novo,
        coalesce(v_custo_ant,0),
        'devolucao_fornecedor',
        p_devolucao_id,
        v_doc,
        'SEM_LOTE',
        left(v_obs, 250)
      )
      on conflict (empresa_id, origem_tipo, origem_id, produto_id, tipo_mov)
      do update set
        deposito_id = excluded.deposito_id,
        quantidade = excluded.quantidade,
        saldo_anterior = excluded.saldo_anterior,
        saldo_atual = excluded.saldo_atual,
        custo_medio = excluded.custo_medio,
        origem = excluded.origem,
        observacoes = excluded.observacoes,
        updated_at = now();

      v_rows := v_rows + 1;
      continue;
    end if;

    -- fallback legado (sem depósito)
    insert into public.estoque_movimentos (
      empresa_id,
      produto_id,
      data_movimento,
      tipo,
      tipo_mov,
      quantidade,
      origem_tipo,
      origem_id,
      lote,
      observacoes
    )
    values (
      v_emp,
      v_item.produto_id,
      current_date,
      'saida',
      'devolucao_fornecedor',
      v_item.quantidade,
      'devolucao_fornecedor',
      p_devolucao_id,
      'SEM_LOTE',
      left(v_obs, 250)
    )
    on conflict (empresa_id, origem_tipo, origem_id, produto_id, tipo_mov)
    do update set
      quantidade = excluded.quantidade,
      observacoes = excluded.observacoes,
      updated_at = now();

    v_rows := v_rows + 1;
  end loop;

  update public.suprimentos_devolucoes_fornecedor
  set status = 'aplicada',
      applied_at = now(),
      applied_by = auth.uid(),
      updated_at = now()
  where id = p_devolucao_id and empresa_id = v_emp;

  return jsonb_build_object('status','ok','movimentos',v_rows,'deposito_id',v_dep);
end;
$$;

revoke all on function public.suprimentos_devolucao_fornecedor_apply(uuid) from public, anon;
grant execute on function public.suprimentos_devolucao_fornecedor_apply(uuid) to authenticated, service_role;

select pg_notify('pgrst','reload schema');

commit;

