/*
  FIN: Parcelamento (estado da arte)
  - Preview de parcelas (datas/valores com ajuste de centavos)
  - Geração de Contas a Pagar/Receber parceladas (vínculo auditável)
  - Suporta origens (COMPRA / VENDA) sem conflitar índices únicos por origem
*/

begin;

-- -----------------------------------------------------------------------------
-- 1) Tipos / Tabelas
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_type t
    where t.typname = 'financeiro_parcelamento_tipo'
      and t.typnamespace = 'public'::regnamespace
	  ) then
	    execute 'create type public.financeiro_parcelamento_tipo as enum (''pagar'',''receber'')';
	  end if;
	end;
	$$;

create table if not exists public.financeiro_parcelamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo public.financeiro_parcelamento_tipo not null,
  origem_tipo text,
  origem_id uuid,
  total numeric(15,2) not null default 0,
  condicao text not null,
  base_date date not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fin_parcelamentos_empresa_tipo
  on public.financeiro_parcelamentos (empresa_id, tipo, created_at desc);

create index if not exists idx_fin_parcelamentos_empresa_origem
  on public.financeiro_parcelamentos (empresa_id, origem_tipo, origem_id)
  where origem_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'tg_fin_parcelamentos_set_updated_at'
      and tgrelid = 'public.financeiro_parcelamentos'::regclass
  ) then
    execute $t$
      create trigger tg_fin_parcelamentos_set_updated_at
      before update on public.financeiro_parcelamentos
      for each row execute function public.tg_set_updated_at()
    $t$;
  end if;
end;
$$;

create table if not exists public.financeiro_parcelamentos_parcelas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  parcelamento_id uuid not null references public.financeiro_parcelamentos(id) on delete cascade,
  numero_parcela int not null,
  vencimento date not null,
  valor numeric(15,2) not null default 0,
  conta_pagar_id uuid references public.financeiro_contas_pagar(id) on delete set null,
  conta_receber_id uuid references public.contas_a_receber(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_fin_parcelas_parcelamento_numero
  on public.financeiro_parcelamentos_parcelas (parcelamento_id, numero_parcela);

create index if not exists idx_fin_parcelas_empresa_parcelamento
  on public.financeiro_parcelamentos_parcelas (empresa_id, parcelamento_id);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'tg_fin_parcelas_set_updated_at'
      and tgrelid = 'public.financeiro_parcelamentos_parcelas'::regclass
  ) then
    execute $t$
      create trigger tg_fin_parcelas_set_updated_at
      before update on public.financeiro_parcelamentos_parcelas
      for each row execute function public.tg_set_updated_at()
    $t$;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2) RLS
-- -----------------------------------------------------------------------------
alter table public.financeiro_parcelamentos enable row level security;
alter table public.financeiro_parcelamentos force row level security;
alter table public.financeiro_parcelamentos_parcelas enable row level security;
alter table public.financeiro_parcelamentos_parcelas force row level security;

drop policy if exists fin_parcelamentos_sel on public.financeiro_parcelamentos;
create policy fin_parcelamentos_sel on public.financeiro_parcelamentos
  for select to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists fin_parcelamentos_ins on public.financeiro_parcelamentos;
create policy fin_parcelamentos_ins on public.financeiro_parcelamentos
  for insert to authenticated
  with check (empresa_id = public.current_empresa_id());

drop policy if exists fin_parcelamentos_upd on public.financeiro_parcelamentos;
create policy fin_parcelamentos_upd on public.financeiro_parcelamentos
  for update to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists fin_parcelamentos_del on public.financeiro_parcelamentos;
create policy fin_parcelamentos_del on public.financeiro_parcelamentos
  for delete to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists fin_parcelas_sel on public.financeiro_parcelamentos_parcelas;
create policy fin_parcelas_sel on public.financeiro_parcelamentos_parcelas
  for select to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists fin_parcelas_ins on public.financeiro_parcelamentos_parcelas;
create policy fin_parcelas_ins on public.financeiro_parcelamentos_parcelas
  for insert to authenticated
  with check (empresa_id = public.current_empresa_id());

drop policy if exists fin_parcelas_upd on public.financeiro_parcelamentos_parcelas;
create policy fin_parcelas_upd on public.financeiro_parcelamentos_parcelas
  for update to authenticated
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists fin_parcelas_del on public.financeiro_parcelamentos_parcelas;
create policy fin_parcelas_del on public.financeiro_parcelamentos_parcelas
  for delete to authenticated
  using (empresa_id = public.current_empresa_id());

-- -----------------------------------------------------------------------------
-- 3) Helpers (datas de vencimento)
-- -----------------------------------------------------------------------------
create or replace function public._fin_parse_due_dates(p_cond text, p_base date)
returns date[]
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cond text := coalesce(nullif(p_cond,''), '');
  v_base date := coalesce(p_base, current_date);
  v_tokens text[];
  v_due_dates date[] := '{}';
  v_last_due date;
  v_t text;
  v_n int;
  v_i int;
begin
  if btrim(v_cond) = '' then
    return array[v_base];
  end if;

  v_tokens := public.str_tokenize(v_cond);
  v_last_due := null;

  foreach v_t in array v_tokens loop
    v_t := btrim(v_t);

    if v_t ~ '^\d+$' then
      v_due_dates := array_append(v_due_dates, (v_base + (v_t::int) * interval '1 day')::date);
      v_last_due  := (v_base + (v_t::int) * interval '1 day')::date;

    elsif v_t ~ '^\+\d+x$' then
      v_n := regexp_replace(v_t, '[^\d]', '', 'g')::int;
      if v_n > 0 then
        if v_last_due is null then
          v_last_due := v_base;
        end if;
        for v_i in 1..v_n loop
          v_last_due := (v_last_due + interval '1 month')::date;
          v_due_dates := array_append(v_due_dates, v_last_due::date);
        end loop;
      end if;

    elsif v_t ~ '^\d+x$' then
      v_n := regexp_replace(v_t, '[^\d]', '', 'g')::int;
      if v_n > 0 then
        if v_last_due is null then
          v_last_due := v_base;
          v_due_dates := array_append(v_due_dates, v_last_due::date);
          for v_i in 2..v_n loop
            v_last_due := (v_last_due + interval '1 month')::date;
            v_due_dates := array_append(v_due_dates, v_last_due::date);
          end loop;
        else
          for v_i in 1..v_n loop
            v_last_due := (v_last_due + interval '1 month')::date;
            v_due_dates := array_append(v_due_dates, v_last_due::date);
          end loop;
        end if;
      end if;
    end if;
  end loop;

  if array_length(v_due_dates, 1) is null then
    v_due_dates := array_append(v_due_dates, v_base);
  end if;

  return v_due_dates;
end;
$$;

revoke all on function public._fin_parse_due_dates(text, date) from public;
grant execute on function public._fin_parse_due_dates(text, date) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) Preview (UI)
-- -----------------------------------------------------------------------------
create or replace function public.financeiro_parcelamento_preview(
  p_total numeric,
  p_condicao text,
  p_base_date date default null
)
returns table (
  numero_parcela int,
  vencimento date,
  valor numeric(15,2)
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_total numeric(15,2) := round(coalesce(p_total, 0)::numeric, 2);
  v_base date := coalesce(p_base_date, current_date);
  v_due_dates date[];
  v_rows int;
  v_each numeric(15,2);
  v_sum numeric(15,2);
  v_rest numeric(15,2);
  v_i int;
  v_due date;
begin
  if v_empresa is null then
    raise exception 'Empresa não encontrada no contexto atual.' using errcode='42501';
  end if;
  if v_total <= 0 then
    raise exception 'Total inválido (<= 0).' using errcode='22003';
  end if;

  v_due_dates := public._fin_parse_due_dates(p_condicao, v_base);
  v_rows := array_length(v_due_dates, 1);
  if v_rows is null or v_rows <= 0 then
    v_due_dates := array[v_base];
    v_rows := 1;
  end if;

  v_each := round((v_total / v_rows)::numeric, 2);
  v_sum  := v_each * v_rows;
  v_rest := round(v_total - v_sum, 2);

  v_i := 0;
  foreach v_due in array v_due_dates loop
    v_i := v_i + 1;
    numero_parcela := v_i;
    vencimento := v_due::date;
    valor := v_each + case when v_i = v_rows then v_rest else 0 end;
    return next;
  end loop;
end;
$$;

revoke all on function public.financeiro_parcelamento_preview(numeric, text, date) from public;
grant execute on function public.financeiro_parcelamento_preview(numeric, text, date) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5) Create: Contas a Receber (avulso)
-- -----------------------------------------------------------------------------
create or replace function public.financeiro_parcelamento_create_contas_a_receber(
  p_cliente_id uuid,
  p_descricao text,
  p_total numeric,
  p_condicao text,
  p_base_date date default null,
  p_centro_de_custo_id uuid default null,
  p_observacoes text default null,
  p_origem_tipo text default null,
  p_origem_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_total numeric(15,2) := round(coalesce(p_total, 0)::numeric, 2);
  v_base date := coalesce(p_base_date, current_date);
  v_due_dates date[];
  v_rows int;
  v_each numeric(15,2);
  v_sum numeric(15,2);
  v_rest numeric(15,2);
  v_parcelamento_id uuid;
  v_ids uuid[] := '{}';
  v_i int;
  v_due date;
  v_conta_id uuid;
  v_parcela_id uuid;
begin
  perform public.require_permission_for_current_user('contas_a_receber','create');

  if v_empresa is null then
    raise exception 'Empresa não encontrada no contexto atual.' using errcode='42501';
  end if;
  if p_cliente_id is null then
    raise exception 'Cliente é obrigatório para gerar títulos.' using errcode='23502';
  end if;
  if v_total <= 0 then
    raise exception 'Total inválido (<= 0).' using errcode='22003';
  end if;

  v_due_dates := public._fin_parse_due_dates(p_condicao, v_base);
  v_rows := array_length(v_due_dates, 1);
  if v_rows is null or v_rows <= 0 then
    v_due_dates := array[v_base];
    v_rows := 1;
  end if;

  v_each := round((v_total / v_rows)::numeric, 2);
  v_sum  := v_each * v_rows;
  v_rest := round(v_total - v_sum, 2);

  insert into public.financeiro_parcelamentos (
    empresa_id, tipo, origem_tipo, origem_id, total, condicao, base_date, created_by
  ) values (
    v_empresa, 'receber', p_origem_tipo, p_origem_id, v_total, coalesce(nullif(p_condicao,''), '1x'), v_base, auth.uid()
  )
  returning id into v_parcelamento_id;

  v_i := 0;
  foreach v_due in array v_due_dates loop
    v_i := v_i + 1;
    v_parcela_id := gen_random_uuid();

    insert into public.contas_a_receber (
      empresa_id,
      cliente_id,
      descricao,
      valor,
      data_vencimento,
      status,
      observacoes,
      centro_de_custo_id,
      origem_tipo,
      origem_id
    )
    values (
      v_empresa,
      p_cliente_id,
      case when v_rows > 1 then format('%s (%s/%s)', p_descricao, v_i, v_rows) else p_descricao end,
      v_each + case when v_i = v_rows then v_rest else 0 end,
      v_due::date,
      'pendente'::public.status_conta_receber,
      p_observacoes,
      p_centro_de_custo_id,
      'PARCELAMENTO_PARCELA',
      v_parcela_id
    )
    returning id into v_conta_id;

    insert into public.financeiro_parcelamentos_parcelas (
      id, empresa_id, parcelamento_id, numero_parcela, vencimento, valor, conta_receber_id
    ) values (
      v_parcela_id, v_empresa, v_parcelamento_id, v_i, v_due::date,
      v_each + case when v_i = v_rows then v_rest else 0 end,
      v_conta_id
    );

    v_ids := array_append(v_ids, v_conta_id);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'parcelamento_id', v_parcelamento_id,
    'count', coalesce(array_length(v_ids,1), 0),
    'contas_ids', v_ids
  );
end;
$$;

revoke all on function public.financeiro_parcelamento_create_contas_a_receber(uuid, text, numeric, text, date, uuid, text, text, uuid) from public;
grant execute on function public.financeiro_parcelamento_create_contas_a_receber(uuid, text, numeric, text, date, uuid, text, text, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6) Create: Contas a Pagar (avulso)
-- -----------------------------------------------------------------------------
create or replace function public.financeiro_parcelamento_create_contas_pagar(
  p_fornecedor_id uuid,
  p_descricao text,
  p_total numeric,
  p_condicao text,
  p_base_date date default null,
  p_data_emissao date default null,
  p_documento_ref text default null,
  p_categoria text default null,
  p_centro_de_custo_id uuid default null,
  p_forma_pagamento text default null,
  p_observacoes text default null,
  p_origem_tipo text default null,
  p_origem_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_total numeric(15,2) := round(coalesce(p_total, 0)::numeric, 2);
  v_base date := coalesce(p_base_date, current_date);
  v_emissao date := coalesce(p_data_emissao, current_date);
  v_due_dates date[];
  v_rows int;
  v_each numeric(15,2);
  v_sum numeric(15,2);
  v_rest numeric(15,2);
  v_parcelamento_id uuid;
  v_ids uuid[] := '{}';
  v_i int;
  v_due date;
  v_conta_id uuid;
  v_parcela_id uuid;
begin
  perform public.require_permission_for_current_user('contas_a_pagar','create');

  if v_empresa is null then
    raise exception 'Empresa não encontrada no contexto atual.' using errcode='42501';
  end if;
  if p_fornecedor_id is null then
    raise exception 'Fornecedor é obrigatório para gerar parcelas.' using errcode='23502';
  end if;
  if v_total <= 0 then
    raise exception 'Total inválido (<= 0).' using errcode='22003';
  end if;

  v_due_dates := public._fin_parse_due_dates(p_condicao, v_base);
  v_rows := array_length(v_due_dates, 1);
  if v_rows is null or v_rows <= 0 then
    v_due_dates := array[v_base];
    v_rows := 1;
  end if;

  v_each := round((v_total / v_rows)::numeric, 2);
  v_sum  := v_each * v_rows;
  v_rest := round(v_total - v_sum, 2);

  insert into public.financeiro_parcelamentos (
    empresa_id, tipo, origem_tipo, origem_id, total, condicao, base_date, created_by
  ) values (
    v_empresa, 'pagar', p_origem_tipo, p_origem_id, v_total, coalesce(nullif(p_condicao,''), '1x'), v_base, auth.uid()
  )
  returning id into v_parcelamento_id;

  v_i := 0;
  foreach v_due in array v_due_dates loop
    v_i := v_i + 1;
    v_parcela_id := gen_random_uuid();

    insert into public.financeiro_contas_pagar (
      empresa_id,
      fornecedor_id,
      documento_ref,
      descricao,
      data_emissao,
      data_vencimento,
      valor_total,
      valor_pago,
      status,
      observacoes,
      categoria,
      centro_de_custo_id,
      forma_pagamento,
      origem_tipo,
      origem_id
    ) values (
      v_empresa,
      p_fornecedor_id,
      nullif(p_documento_ref,''),
      case when v_rows > 1 then format('%s (%s/%s)', p_descricao, v_i, v_rows) else p_descricao end,
      v_emissao,
      v_due::date,
      v_each + case when v_i = v_rows then v_rest else 0 end,
      0,
      'aberta',
      p_observacoes,
      nullif(p_categoria,''),
      p_centro_de_custo_id,
      nullif(p_forma_pagamento,''),
      'PARCELAMENTO_PARCELA',
      v_parcela_id
    )
    returning id into v_conta_id;

    insert into public.financeiro_parcelamentos_parcelas (
      id, empresa_id, parcelamento_id, numero_parcela, vencimento, valor, conta_pagar_id
    ) values (
      v_parcela_id, v_empresa, v_parcelamento_id, v_i, v_due::date,
      v_each + case when v_i = v_rows then v_rest else 0 end,
      v_conta_id
    );

    v_ids := array_append(v_ids, v_conta_id);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'parcelamento_id', v_parcelamento_id,
    'count', coalesce(array_length(v_ids,1), 0),
    'contas_ids', v_ids
  );
end;
$$;

revoke all on function public.financeiro_parcelamento_create_contas_pagar(uuid, text, numeric, text, date, date, text, text, uuid, text, text, text, uuid) from public;
grant execute on function public.financeiro_parcelamento_create_contas_pagar(uuid, text, numeric, text, date, date, text, text, uuid, text, text, text, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7) Create: por origem (Compra / Venda)
-- -----------------------------------------------------------------------------
create or replace function public.financeiro_parcelamento_from_compra_create(
  p_compra_id uuid,
  p_condicao text,
  p_base_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_compra public.compras_pedidos;
begin
  perform public.require_permission_for_current_user('contas_a_pagar','create');

  if v_empresa is null then
    raise exception 'Empresa não encontrada no contexto atual.' using errcode='42501';
  end if;

  select * into v_compra
  from public.compras_pedidos c
  where c.id = p_compra_id
    and c.empresa_id = v_empresa
  limit 1;

  if not found then
    raise exception 'Compra não encontrada.' using errcode='P0002';
  end if;
  if v_compra.status <> 'recebido'::public.status_compra then
    raise exception 'A compra precisa estar recebida para gerar contas a pagar.' using errcode='23514';
  end if;
  if v_compra.fornecedor_id is null then
    raise exception 'Compra sem fornecedor vinculado.' using errcode='23514';
  end if;

  return public.financeiro_parcelamento_create_contas_pagar(
    v_compra.fornecedor_id,
    ('Ordem de Compra #' || v_compra.numero::text),
    coalesce(v_compra.total_geral, 0),
    p_condicao,
    coalesce(p_base_date, v_compra.data_emissao, current_date),
    coalesce(v_compra.data_emissao, current_date),
    ('OC-' || v_compra.numero::text),
    null,
    null,
    null,
    'Gerado automaticamente a partir de Compra recebida.',
    'COMPRA',
    p_compra_id
  );
end;
$$;

revoke all on function public.financeiro_parcelamento_from_compra_create(uuid, text, date) from public;
grant execute on function public.financeiro_parcelamento_from_compra_create(uuid, text, date) to authenticated, service_role;

create or replace function public.financeiro_parcelamento_from_venda_create(
  p_pedido_id uuid,
  p_condicao text default null,
  p_base_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_pedido public.vendas_pedidos;
  v_cond text;
begin
  perform public.require_permission_for_current_user('contas_a_receber','create');

  if v_empresa is null then
    raise exception 'Empresa não encontrada no contexto atual.' using errcode='42501';
  end if;

  select * into v_pedido
  from public.vendas_pedidos p
  where p.id = p_pedido_id
    and p.empresa_id = v_empresa
  limit 1;

  if not found then
    raise exception 'Pedido de venda não encontrado.' using errcode='P0002';
  end if;
  if v_pedido.status <> 'concluido' then
    raise exception 'O pedido precisa estar concluído para gerar títulos.' using errcode='23514';
  end if;
  if v_pedido.cliente_id is null then
    raise exception 'Pedido sem cliente vinculado.' using errcode='23514';
  end if;

  v_cond := coalesce(nullif(p_condicao,''), v_pedido.condicao_pagamento, '1x');

  return public.financeiro_parcelamento_create_contas_a_receber(
    v_pedido.cliente_id,
    ('Pedido ' || v_pedido.numero::text),
    coalesce(v_pedido.total_geral, 0),
    v_cond,
    coalesce(p_base_date, v_pedido.data_emissao, current_date),
    null,
    'Gerado automaticamente a partir de Pedido de Venda concluído.',
    'VENDA',
    p_pedido_id
  );
end;
$$;

revoke all on function public.financeiro_parcelamento_from_venda_create(uuid, text, date) from public;
grant execute on function public.financeiro_parcelamento_from_venda_create(uuid, text, date) to authenticated, service_role;

commit;
