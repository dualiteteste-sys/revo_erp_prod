/*
  Financeiro: Recorrências (Contas a Pagar / Contas a Receber) — Core

  Objetivo:
  - Permitir lançar contas recorrentes (semanal, mensal, bimestral, trimestral, semestral, anual)
    com geração idempotente de ocorrências.

  Modelo:
  - public.financeiro_recorrencias: template/configuração
  - public.financeiro_recorrencias_ocorrencias: instâncias geradas (1 por vencimento)
  - contas geradas gravam origem_tipo='RECORRENCIA' e origem_id=<ocorrencia_id>

  Nota:
  - Ajuste de dia útil considera apenas fim de semana (sem feriados) nesta etapa.
*/

begin;

-- -----------------------------------------------------------------------------
-- 0) Tipos auxiliares (idempotentes)
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'financeiro_recorrencia_tipo') then
    create type public.financeiro_recorrencia_tipo as enum ('pagar','receber');
  end if;
  if not exists (select 1 from pg_type where typname = 'financeiro_recorrencia_frequencia') then
    create type public.financeiro_recorrencia_frequencia as enum ('semanal','mensal','bimestral','trimestral','semestral','anual');
  end if;
  if not exists (select 1 from pg_type where typname = 'financeiro_recorrencia_ajuste_dia_util') then
    create type public.financeiro_recorrencia_ajuste_dia_util as enum ('nao_ajustar','proximo_dia_util','dia_util_anterior');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1) Contas a pagar: adicionar origem_tipo/origem_id (idempotência) + índice
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.financeiro_contas_pagar') is null then
    return;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='financeiro_contas_pagar' and column_name='origem_tipo'
  ) then
    alter table public.financeiro_contas_pagar add column origem_tipo text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='financeiro_contas_pagar' and column_name='origem_id'
  ) then
    alter table public.financeiro_contas_pagar add column origem_id uuid;
  end if;
end $$;

create unique index if not exists financeiro_contas_pagar_origem_unique
  on public.financeiro_contas_pagar (empresa_id, origem_tipo, origem_id)
  where origem_tipo is not null and origem_id is not null;

-- -----------------------------------------------------------------------------
-- 1b) Contas a receber: garantir origem_tipo/origem_id (idempotência) + índice
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.contas_a_receber') is null then
    return;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='contas_a_receber' and column_name='origem_tipo'
  ) then
    alter table public.contas_a_receber add column origem_tipo text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='contas_a_receber' and column_name='origem_id'
  ) then
    alter table public.contas_a_receber add column origem_id uuid;
  end if;
end $$;

create unique index if not exists contas_a_receber_origem_unique
  on public.contas_a_receber (empresa_id, origem_tipo, origem_id)
  where origem_tipo is not null and origem_id is not null;

-- -----------------------------------------------------------------------------
-- 2) Tabelas: templates + ocorrências
-- -----------------------------------------------------------------------------

create table if not exists public.financeiro_recorrencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  tipo public.financeiro_recorrencia_tipo not null,
  ativo boolean not null default true,
  frequencia public.financeiro_recorrencia_frequencia not null,
  ajuste_dia_util public.financeiro_recorrencia_ajuste_dia_util not null default 'proximo_dia_util',
  start_date date not null,
  end_date date,
  -- semanal: 0=domingo ... 6=sábado
  weekday int,
  -- mensal/bimestral/trimestral/semestral/anual: 1..31 (clamp para último dia do mês)
  day_of_month int,
  -- Payload comum
  descricao text not null,
  documento_ref text,
  observacoes text,
  centro_de_custo_id uuid,
  -- pagar
  fornecedor_id uuid,
  valor_total numeric(15,2),
  categoria text,
  forma_pagamento text,
  -- receber
  cliente_id uuid,
  valor numeric(15,2),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint financeiro_recorrencias_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade
);

create index if not exists idx_fin_recorrencias_empresa_tipo
  on public.financeiro_recorrencias (empresa_id, tipo, ativo);

create index if not exists idx_fin_recorrencias_empresa_search
  on public.financeiro_recorrencias (empresa_id, descricao);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_financeiro_recorrencias'
      and tgrelid = 'public.financeiro_recorrencias'::regclass
  ) then
    create trigger handle_updated_at_financeiro_recorrencias
      before update on public.financeiro_recorrencias
      for each row execute procedure public.tg_set_updated_at();
  end if;
end $$;

alter table public.financeiro_recorrencias enable row level security;

drop policy if exists fin_rec_select on public.financeiro_recorrencias;
drop policy if exists fin_rec_insert on public.financeiro_recorrencias;
drop policy if exists fin_rec_update on public.financeiro_recorrencias;
drop policy if exists fin_rec_delete on public.financeiro_recorrencias;

create policy fin_rec_select on public.financeiro_recorrencias
  for select using (empresa_id = public.current_empresa_id());
create policy fin_rec_insert on public.financeiro_recorrencias
  for insert with check (empresa_id = public.current_empresa_id());
create policy fin_rec_update on public.financeiro_recorrencias
  for update using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());
create policy fin_rec_delete on public.financeiro_recorrencias
  for delete using (empresa_id = public.current_empresa_id());

create table if not exists public.financeiro_recorrencias_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  recorrencia_id uuid not null references public.financeiro_recorrencias(id) on delete cascade,
  seq int not null,
  data_vencimento date not null,
  conta_pagar_id uuid,
  conta_receber_id uuid,
  created_at timestamptz default now(),
  unique (empresa_id, recorrencia_id, seq)
);

create index if not exists idx_fin_rec_ocorr_emp_rec
  on public.financeiro_recorrencias_ocorrencias (empresa_id, recorrencia_id, data_vencimento);

create index if not exists idx_fin_rec_ocorr_emp_venc
  on public.financeiro_recorrencias_ocorrencias (empresa_id, data_vencimento);

alter table public.financeiro_recorrencias_ocorrencias enable row level security;
-- não expor diretamente

-- -----------------------------------------------------------------------------
-- 3) Helpers: ajuste dia útil + add_months com clamp de DOM
-- -----------------------------------------------------------------------------

drop function if exists public.financeiro__adjust_business_day(date, public.financeiro_recorrencia_ajuste_dia_util);
create or replace function public.financeiro__adjust_business_day(
  p_date date,
  p_policy public.financeiro_recorrencia_ajuste_dia_util
)
returns date
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v date := p_date;
  v_dow int;
begin
  if p_policy = 'nao_ajustar' then
    return v;
  end if;

  loop
    v_dow := extract(dow from v)::int;
    exit when v_dow not in (0, 6);
    if p_policy = 'dia_util_anterior' then
      v := v - 1;
    else
      v := v + 1;
    end if;
  end loop;

  return v;
end;
$$;

drop function if exists public.financeiro__add_months_clamp_dom(date, int, int);
create or replace function public.financeiro__add_months_clamp_dom(
  p_anchor date,
  p_months int,
  p_day_of_month int
)
returns date
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  y int := extract(year from p_anchor)::int;
  m int := extract(month from p_anchor)::int;
  v_total int := (y * 12 + (m - 1)) + p_months;
  y2 int := (v_total / 12);
  m2 int := (v_total % 12) + 1;
  dom int := greatest(1, least(31, p_day_of_month));
  last_dom int;
  first_day date;
begin
  first_day := make_date(y2, m2, 1);
  last_dom := extract(day from (date_trunc('month', first_day + interval '1 month') - interval '1 day'))::int;
  return make_date(y2, m2, least(dom, last_dom));
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) RPCs: upsert/list/get/activate/deactivate + generate (idempotente)
-- -----------------------------------------------------------------------------

drop function if exists public.financeiro_recorrencias_upsert(jsonb);
create or replace function public.financeiro_recorrencias_upsert(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_tipo public.financeiro_recorrencia_tipo := coalesce(nullif(p_payload->>'tipo',''),'pagar')::public.financeiro_recorrencia_tipo;
  v_freq public.financeiro_recorrencia_frequencia := coalesce(nullif(p_payload->>'frequencia',''),'mensal')::public.financeiro_recorrencia_frequencia;
  v_ajuste public.financeiro_recorrencia_ajuste_dia_util := coalesce(nullif(p_payload->>'ajuste_dia_util',''),'proximo_dia_util')::public.financeiro_recorrencia_ajuste_dia_util;
  v_start date := nullif(p_payload->>'start_date','')::date;
  v_end date := nullif(p_payload->>'end_date','')::date;
  v_weekday int := nullif(p_payload->>'weekday','')::int;
  v_dom int := nullif(p_payload->>'day_of_month','')::int;
  v_desc text := coalesce(nullif(p_payload->>'descricao',''), '');
  v_active boolean := coalesce((p_payload->>'ativo')::boolean, true);
  v_centro uuid := nullif(p_payload->>'centro_de_custo_id','')::uuid;
  v_res jsonb;
begin
  if v_empresa is null then
    raise exception '[FIN][REC] Nenhuma empresa ativa encontrada.' using errcode='42501';
  end if;

  -- permissões por tipo
  if v_tipo = 'pagar' then
    if v_id is null then
      perform public.require_permission_for_current_user('contas_a_pagar','create');
    else
      perform public.require_permission_for_current_user('contas_a_pagar','update');
    end if;
  else
    if v_id is null then
      perform public.require_permission_for_current_user('contas_a_receber','create');
    else
      perform public.require_permission_for_current_user('contas_a_receber','update');
    end if;
  end if;

  if v_desc = '' then
    raise exception '[FIN][REC] descricao é obrigatória.' using errcode='P0001';
  end if;
  if v_start is null then
    raise exception '[FIN][REC] start_date é obrigatória.' using errcode='P0001';
  end if;
  if v_end is not null and v_end < v_start then
    raise exception '[FIN][REC] end_date não pode ser anterior ao start_date.' using errcode='P0001';
  end if;

  if v_freq = 'semanal' then
    if v_weekday is null then
      v_weekday := extract(dow from v_start)::int;
    end if;
    if v_weekday < 0 or v_weekday > 6 then
      raise exception '[FIN][REC] weekday inválido.' using errcode='P0001';
    end if;
    v_dom := null;
  else
    if v_dom is null then
      v_dom := extract(day from v_start)::int;
    end if;
    if v_dom < 1 or v_dom > 31 then
      raise exception '[FIN][REC] day_of_month inválido.' using errcode='P0001';
    end if;
    v_weekday := null;
  end if;

  -- Valida payload mínimo por tipo
  if v_tipo = 'pagar' then
    if nullif(p_payload->>'fornecedor_id','') is null then
      raise exception '[FIN][REC] fornecedor_id é obrigatório para recorrências a pagar.' using errcode='P0001';
    end if;
    if nullif(p_payload->>'valor_total','') is null then
      raise exception '[FIN][REC] valor_total é obrigatório para recorrências a pagar.' using errcode='P0001';
    end if;
  else
    if nullif(p_payload->>'cliente_id','') is null then
      raise exception '[FIN][REC] cliente_id é obrigatório para recorrências a receber.' using errcode='P0001';
    end if;
    if nullif(p_payload->>'valor','') is null then
      raise exception '[FIN][REC] valor é obrigatório para recorrências a receber.' using errcode='P0001';
    end if;
  end if;

  if v_id is null then
    insert into public.financeiro_recorrencias (
      empresa_id, tipo, ativo, frequencia, ajuste_dia_util, start_date, end_date, weekday, day_of_month,
      descricao, documento_ref, observacoes, centro_de_custo_id,
      fornecedor_id, valor_total, categoria, forma_pagamento,
      cliente_id, valor
    ) values (
      v_empresa, v_tipo, v_active, v_freq, v_ajuste, v_start, v_end, v_weekday, v_dom,
      v_desc,
      nullif(p_payload->>'documento_ref',''),
      nullif(p_payload->>'observacoes',''),
      v_centro,
      nullif(p_payload->>'fornecedor_id','')::uuid,
      nullif(p_payload->>'valor_total','')::numeric,
      nullif(p_payload->>'categoria',''),
      nullif(p_payload->>'forma_pagamento',''),
      nullif(p_payload->>'cliente_id','')::uuid,
      nullif(p_payload->>'valor','')::numeric
    )
    returning id into v_id;
  else
    update public.financeiro_recorrencias r
       set ativo = v_active,
           frequencia = v_freq,
           ajuste_dia_util = v_ajuste,
           start_date = v_start,
           end_date = v_end,
           weekday = v_weekday,
           day_of_month = v_dom,
           descricao = v_desc,
           documento_ref = case when p_payload ? 'documento_ref' then nullif(p_payload->>'documento_ref','') else r.documento_ref end,
           observacoes = case when p_payload ? 'observacoes' then nullif(p_payload->>'observacoes','') else r.observacoes end,
           centro_de_custo_id = case when p_payload ? 'centro_de_custo_id' then v_centro else r.centro_de_custo_id end,
           fornecedor_id = case when p_payload ? 'fornecedor_id' then nullif(p_payload->>'fornecedor_id','')::uuid else r.fornecedor_id end,
           valor_total = case when p_payload ? 'valor_total' then nullif(p_payload->>'valor_total','')::numeric else r.valor_total end,
           categoria = case when p_payload ? 'categoria' then nullif(p_payload->>'categoria','') else r.categoria end,
           forma_pagamento = case when p_payload ? 'forma_pagamento' then nullif(p_payload->>'forma_pagamento','') else r.forma_pagamento end,
           cliente_id = case when p_payload ? 'cliente_id' then nullif(p_payload->>'cliente_id','')::uuid else r.cliente_id end,
           valor = case when p_payload ? 'valor' then nullif(p_payload->>'valor','')::numeric else r.valor end,
           updated_at = now()
     where r.id = v_id
       and r.empresa_id = v_empresa
     returning r.id into v_id;

    if v_id is null then
      raise exception '[FIN][REC] Registro não encontrado ou acesso negado.' using errcode='P0002';
    end if;
  end if;

  select to_jsonb(r.*) into v_res
  from public.financeiro_recorrencias r
  where r.id = v_id and r.empresa_id = v_empresa;

  return v_res;
end;
$$;

revoke all on function public.financeiro_recorrencias_upsert(jsonb) from public, anon;
grant execute on function public.financeiro_recorrencias_upsert(jsonb) to authenticated, service_role;

drop function if exists public.financeiro_recorrencias_list(public.financeiro_recorrencia_tipo, boolean, int, int, text);
create or replace function public.financeiro_recorrencias_list(
  p_tipo public.financeiro_recorrencia_tipo default null,
  p_ativo boolean default null,
  p_limit int default 50,
  p_offset int default 0,
  p_q text default null
)
returns table(
  id uuid,
  tipo public.financeiro_recorrencia_tipo,
  ativo boolean,
  frequencia public.financeiro_recorrencia_frequencia,
  start_date date,
  end_date date,
  descricao text,
  valor numeric,
  valor_total numeric,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  if p_tipo is null then
    perform public.require_permission_for_current_user('contas_a_pagar','view');
    perform public.require_permission_for_current_user('contas_a_receber','view');
  elsif p_tipo = 'pagar' then
    perform public.require_permission_for_current_user('contas_a_pagar','view');
  else
    perform public.require_permission_for_current_user('contas_a_receber','view');
  end if;

  return query
  select
    r.id,
    r.tipo,
    r.ativo,
    r.frequencia,
    r.start_date,
    r.end_date,
    r.descricao,
    r.valor,
    r.valor_total,
    count(*) over() as total_count
  from public.financeiro_recorrencias r
  where r.empresa_id = v_empresa
    and (p_tipo is null or r.tipo = p_tipo)
    and (p_ativo is null or r.ativo = p_ativo)
    and (
      p_q is null
      or r.descricao ilike '%'||p_q||'%'
      or coalesce(r.documento_ref,'') ilike '%'||p_q||'%'
    )
  order by r.ativo desc, r.created_at desc
  limit greatest(1, least(p_limit, 200))
  offset greatest(0, p_offset);
end;
$$;

revoke all on function public.financeiro_recorrencias_list(public.financeiro_recorrencia_tipo, boolean, int, int, text) from public, anon;
grant execute on function public.financeiro_recorrencias_list(public.financeiro_recorrencia_tipo, boolean, int, int, text) to authenticated, service_role;

drop function if exists public.financeiro_recorrencias_get(uuid);
create or replace function public.financeiro_recorrencias_get(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_tipo public.financeiro_recorrencia_tipo;
  v_res jsonb;
begin
  select r.tipo into v_tipo
  from public.financeiro_recorrencias r
  where r.id = p_id and r.empresa_id = v_empresa;

  if v_tipo is null then
    raise exception '[FIN][REC] Registro não encontrado.' using errcode='P0002';
  end if;

  if v_tipo = 'pagar' then
    perform public.require_permission_for_current_user('contas_a_pagar','view');
  else
    perform public.require_permission_for_current_user('contas_a_receber','view');
  end if;

  select to_jsonb(r.*) into v_res
  from public.financeiro_recorrencias r
  where r.id = p_id and r.empresa_id = v_empresa;

  return v_res;
end;
$$;

revoke all on function public.financeiro_recorrencias_get(uuid) from public, anon;
grant execute on function public.financeiro_recorrencias_get(uuid) to authenticated, service_role;

drop function if exists public.financeiro_recorrencias_set_active(uuid, boolean);
create or replace function public.financeiro_recorrencias_set_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_tipo public.financeiro_recorrencia_tipo;
begin
  select r.tipo into v_tipo
  from public.financeiro_recorrencias r
  where r.id = p_id and r.empresa_id = v_empresa;

  if v_tipo is null then
    raise exception '[FIN][REC] Registro não encontrado.' using errcode='P0002';
  end if;

  if v_tipo = 'pagar' then
    perform public.require_permission_for_current_user('contas_a_pagar','update');
  else
    perform public.require_permission_for_current_user('contas_a_receber','update');
  end if;

  update public.financeiro_recorrencias
     set ativo = p_active,
         updated_at = now()
   where id = p_id and empresa_id = v_empresa;
end;
$$;

revoke all on function public.financeiro_recorrencias_set_active(uuid, boolean) from public, anon;
grant execute on function public.financeiro_recorrencias_set_active(uuid, boolean) to authenticated, service_role;

drop function if exists public.financeiro_recorrencias_generate(uuid, date, int);
create or replace function public.financeiro_recorrencias_generate(
  p_recorrencia_id uuid,
  p_until date default null,
  p_max int default 24
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  r public.financeiro_recorrencias;
  v_created_occ int := 0;
  v_created_accounts int := 0;
  v_repaired_accounts int := 0;
  v_rowcount int := 0;
  v_seq_start int := 0;
  v_seq int := 0;
  v_due_nominal date;
  v_due date;
  v_months_step int;
  v_existing record;
  v_occ_id uuid;
  v_account_id uuid;
  v_has_centro_cp boolean;
  v_has_centro_cr boolean;
begin
  select * into r
  from public.financeiro_recorrencias
  where id = p_recorrencia_id and empresa_id = v_empresa;

  if not found then
    raise exception '[FIN][REC] Recorrência não encontrada.' using errcode='P0002';
  end if;

  if r.tipo = 'pagar' then
    perform public.require_permission_for_current_user('contas_a_pagar','create');
  else
    perform public.require_permission_for_current_user('contas_a_receber','create');
  end if;

  if not r.ativo then
    return jsonb_build_object('status','skipped','reason','inactive');
  end if;

  if r.tipo = 'pagar' then
    if r.fornecedor_id is null then
      raise exception '[FIN][REC] fornecedor_id é obrigatório.' using errcode='P0001';
    end if;
    if r.valor_total is null then
      raise exception '[FIN][REC] valor_total é obrigatório.' using errcode='P0001';
    end if;
  else
    if r.cliente_id is null then
      raise exception '[FIN][REC] cliente_id é obrigatório.' using errcode='P0001';
    end if;
    if r.valor is null then
      raise exception '[FIN][REC] valor é obrigatório.' using errcode='P0001';
    end if;
  end if;

  select coalesce(max(o.seq), -1) + 1 into v_seq_start
  from public.financeiro_recorrencias_ocorrencias o
  where o.empresa_id = v_empresa and o.recorrencia_id = r.id;

  -- Detecta coluna centro_de_custo_id nos alvos (compat drift)
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='financeiro_contas_pagar' and column_name='centro_de_custo_id'
  ) into v_has_centro_cp;
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='contas_a_receber' and column_name='centro_de_custo_id'
  ) into v_has_centro_cr;

  v_months_step := case r.frequencia
    when 'mensal' then 1
    when 'bimestral' then 2
    when 'trimestral' then 3
    when 'semestral' then 6
    when 'anual' then 12
    else null
  end;

  -- Loop: gera até p_until (ou p_max novas ocorrências) respeitando end_date.
  v_seq := v_seq_start;
  while v_created_occ < greatest(1, least(p_max, 240)) loop
    if r.frequencia = 'semanal' then
      -- primeira data: alinhar para o weekday a partir do start_date
      v_due_nominal := (r.start_date + ((7 + r.weekday - extract(dow from r.start_date)::int) % 7)) + (v_seq * 7);
    else
      v_due_nominal := public.financeiro__add_months_clamp_dom(r.start_date, v_seq * v_months_step, r.day_of_month);
    end if;

    v_due := public.financeiro__adjust_business_day(v_due_nominal, r.ajuste_dia_util);

    exit when r.end_date is not null and v_due > r.end_date;
    exit when p_until is not null and v_due > p_until;

    -- Insere ocorrência (idempotente) e captura id
    insert into public.financeiro_recorrencias_ocorrencias (empresa_id, recorrencia_id, seq, data_vencimento)
    values (v_empresa, r.id, v_seq, v_due)
    on conflict (empresa_id, recorrencia_id, seq) do nothing;

    get diagnostics v_rowcount = row_count;
    v_created_occ := v_created_occ + v_rowcount;

    select o.id, o.conta_pagar_id, o.conta_receber_id
      into v_existing
      from public.financeiro_recorrencias_ocorrencias o
     where o.empresa_id = v_empresa and o.recorrencia_id = r.id and o.seq = v_seq
     limit 1;

    v_occ_id := v_existing.id;

    -- Gera conta se ainda não existe / não está vinculada
    if r.tipo = 'pagar' then
      if v_existing.conta_pagar_id is null then
        v_account_id := null;

        if v_has_centro_cp then
          execute $q$
            insert into public.financeiro_contas_pagar (
              empresa_id, fornecedor_id, documento_ref, descricao, data_emissao, data_vencimento,
              valor_total, valor_pago, multa, juros, desconto, forma_pagamento, categoria, status, observacoes,
              origem_tipo, origem_id, centro_de_custo_id
            ) values (
              $1,$2,$3,$4,$5,$6,
              $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
              $17,$18,$19
            )
            returning id
          $q$
          using
            v_empresa,
            r.fornecedor_id,
            r.documento_ref,
            r.descricao,
            null::date,
            v_due,
            coalesce(r.valor_total, 0),
            0::numeric,
            0::numeric,
            0::numeric,
            0::numeric,
            r.forma_pagamento,
            r.categoria,
            'aberta',
            r.observacoes,
            'RECORRENCIA',
            v_occ_id,
            r.centro_de_custo_id
          into v_account_id;
        else
          execute $q$
            insert into public.financeiro_contas_pagar (
              empresa_id, fornecedor_id, documento_ref, descricao, data_emissao, data_vencimento,
              valor_total, valor_pago, multa, juros, desconto, forma_pagamento, categoria, status, observacoes,
              origem_tipo, origem_id
            ) values (
              $1,$2,$3,$4,$5,$6,
              $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
              $17,$18
            )
            returning id
          $q$
          using
            v_empresa,
            r.fornecedor_id,
            r.documento_ref,
            r.descricao,
            null::date,
            v_due,
            coalesce(r.valor_total, 0),
            0::numeric,
            0::numeric,
            0::numeric,
            0::numeric,
            r.forma_pagamento,
            r.categoria,
            'aberta',
            r.observacoes,
            'RECORRENCIA',
            v_occ_id
          into v_account_id;
        end if;

        update public.financeiro_recorrencias_ocorrencias
           set conta_pagar_id = v_account_id
         where empresa_id = v_empresa and id = v_existing.id;

        v_created_accounts := v_created_accounts + 1;
      end if;
    else
      if v_existing.conta_receber_id is null then
        v_account_id := null;

        if v_has_centro_cr then
          execute $q$
            insert into public.contas_a_receber (
              empresa_id, cliente_id, descricao, valor, data_vencimento, status, observacoes,
              origem_tipo, origem_id, centro_de_custo_id
            ) values (
              $1,$2,$3,$4,$5,$6,$7,
              $8,$9,$10
            )
            returning id
          $q$
          using
            v_empresa,
            r.cliente_id,
            r.descricao,
            coalesce(r.valor, 0),
            v_due,
            'pendente'::public.status_conta_receber,
            r.observacoes,
            'RECORRENCIA',
            v_existing.id,
            r.centro_de_custo_id
          into v_account_id;
        else
          execute $q$
            insert into public.contas_a_receber (
              empresa_id, cliente_id, descricao, valor, data_vencimento, status, observacoes,
              origem_tipo, origem_id
            ) values (
              $1,$2,$3,$4,$5,$6,$7,
              $8,$9
            )
            returning id
          $q$
          using
            v_empresa,
            r.cliente_id,
            r.descricao,
            coalesce(r.valor, 0),
            v_due,
            'pendente'::public.status_conta_receber,
            r.observacoes,
            'RECORRENCIA',
            v_existing.id
          into v_account_id;
        end if;

        update public.financeiro_recorrencias_ocorrencias
           set conta_receber_id = v_account_id
         where empresa_id = v_empresa and id = v_existing.id;

        v_created_accounts := v_created_accounts + 1;
      end if;
    end if;

    v_seq := v_seq + 1;
  end loop;

  -- Backfill: se houver ocorrências antigas sem conta, tenta criar e vincular (idempotente).
  if r.tipo = 'pagar' then
    for v_existing in
      select o.id, o.data_vencimento
      from public.financeiro_recorrencias_ocorrencias o
      where o.empresa_id = v_empresa
        and o.recorrencia_id = r.id
        and o.conta_pagar_id is null
        and (p_until is null or o.data_vencimento <= p_until)
        and (r.end_date is null or o.data_vencimento <= r.end_date)
      order by o.seq
      limit 500
    loop
      select cp.id into v_account_id
      from public.financeiro_contas_pagar cp
      where cp.empresa_id = v_empresa
        and cp.origem_tipo = 'RECORRENCIA'
        and cp.origem_id = v_existing.id
      limit 1;

      if v_account_id is null then
        if v_has_centro_cp then
          execute $q$
            insert into public.financeiro_contas_pagar (
              empresa_id, fornecedor_id, documento_ref, descricao, data_emissao, data_vencimento,
              valor_total, valor_pago, multa, juros, desconto, forma_pagamento, categoria, status, observacoes,
              origem_tipo, origem_id, centro_de_custo_id
            ) values (
              $1,$2,$3,$4,$5,$6,
              $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
              $17,$18,$19
            )
            returning id
          $q$
          using
            v_empresa,
            r.fornecedor_id,
            r.documento_ref,
            r.descricao,
            null::date,
            v_existing.data_vencimento,
            coalesce(r.valor_total, 0),
            0::numeric, 0::numeric, 0::numeric, 0::numeric,
            r.forma_pagamento,
            r.categoria,
            'aberta',
            r.observacoes,
            'RECORRENCIA',
            v_existing.id,
            r.centro_de_custo_id
          into v_account_id;
        else
          execute $q$
            insert into public.financeiro_contas_pagar (
              empresa_id, fornecedor_id, documento_ref, descricao, data_emissao, data_vencimento,
              valor_total, valor_pago, multa, juros, desconto, forma_pagamento, categoria, status, observacoes,
              origem_tipo, origem_id
            ) values (
              $1,$2,$3,$4,$5,$6,
              $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
              $17,$18
            )
            returning id
          $q$
          using
            v_empresa,
            r.fornecedor_id,
            r.documento_ref,
            r.descricao,
            null::date,
            v_existing.data_vencimento,
            coalesce(r.valor_total, 0),
            0::numeric, 0::numeric, 0::numeric, 0::numeric,
            r.forma_pagamento,
            r.categoria,
            'aberta',
            r.observacoes,
            'RECORRENCIA',
            v_existing.id
          into v_account_id;
        end if;
      end if;

      if v_account_id is not null then
        update public.financeiro_recorrencias_ocorrencias
           set conta_pagar_id = v_account_id
         where empresa_id = v_empresa and id = v_existing.id;
        v_repaired_accounts := v_repaired_accounts + 1;
      end if;
    end loop;
  else
    for v_existing in
      select o.id, o.data_vencimento
      from public.financeiro_recorrencias_ocorrencias o
      where o.empresa_id = v_empresa
        and o.recorrencia_id = r.id
        and o.conta_receber_id is null
        and (p_until is null or o.data_vencimento <= p_until)
        and (r.end_date is null or o.data_vencimento <= r.end_date)
      order by o.seq
      limit 500
    loop
      select cr.id into v_account_id
      from public.contas_a_receber cr
      where cr.empresa_id = v_empresa
        and cr.origem_tipo = 'RECORRENCIA'
        and cr.origem_id = v_existing.id
      limit 1;

      if v_account_id is null then
        if v_has_centro_cr then
          execute $q$
            insert into public.contas_a_receber (
              empresa_id, cliente_id, descricao, valor, data_vencimento, status, observacoes,
              origem_tipo, origem_id, centro_de_custo_id
            ) values (
              $1,$2,$3,$4,$5,$6,$7,
              $8,$9,$10
            )
            returning id
          $q$
          using
            v_empresa,
            r.cliente_id,
            r.descricao,
            coalesce(r.valor, 0),
            v_existing.data_vencimento,
            'pendente'::public.status_conta_receber,
            r.observacoes,
            'RECORRENCIA',
            v_existing.id,
            r.centro_de_custo_id
          into v_account_id;
        else
          execute $q$
            insert into public.contas_a_receber (
              empresa_id, cliente_id, descricao, valor, data_vencimento, status, observacoes,
              origem_tipo, origem_id
            ) values (
              $1,$2,$3,$4,$5,$6,$7,
              $8,$9
            )
            returning id
          $q$
          using
            v_empresa,
            r.cliente_id,
            r.descricao,
            coalesce(r.valor, 0),
            v_existing.data_vencimento,
            'pendente'::public.status_conta_receber,
            r.observacoes,
            'RECORRENCIA',
            v_existing.id
          into v_account_id;
        end if;
      end if;

      if v_account_id is not null then
        update public.financeiro_recorrencias_ocorrencias
           set conta_receber_id = v_account_id
         where empresa_id = v_empresa and id = v_existing.id;
        v_repaired_accounts := v_repaired_accounts + 1;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'status','ok',
    'ocorrencias_novas',v_created_occ,
    'contas_geradas',v_created_accounts,
    'contas_reparadas',v_repaired_accounts
  );
end;
$$;

revoke all on function public.financeiro_recorrencias_generate(uuid, date, int) from public, anon;
grant execute on function public.financeiro_recorrencias_generate(uuid, date, int) to authenticated, service_role;

commit;
