-- 20251103_020000_create_os_module.sql
-- Módulo: ORDEM DE SERVIÇO (multi-tenant com RLS por operação)
-- Logs temporários: [RPC] [CREATE_*] [OS] [OS_ITEM] [AUTH]

-- =========================
-- ENUMs (idempotente)
-- =========================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'status_os') then
    create type public.status_os as enum (
      'orcamento',     -- orçamento (não faturado)
      'aberta',        -- aberta/em execução
      'concluida',     -- finalizada
      'cancelada'      -- cancelada
    );
  end if;
end$$;

-- =========================
-- Tabelas
-- =========================
create table if not exists public.ordem_servicos (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresas(id) on delete cascade,

  numero             bigint not null,                 -- número sequencial por empresa
  cliente_id         uuid,                             -- FK p/ pessoas/parceiros (seu schema). Opcional no MVP
  status             public.status_os not null default 'orcamento',

  descricao          text,                             -- "Descrição do serviço"
  consideracoes_finais text,

  data_inicio        date,
  data_prevista      date,
  hora               time,
  data_conclusao     date,

  total_itens        numeric(14,2) not null default 0,
  desconto_valor     numeric(14,2) not null default 0,
  total_geral        numeric(14,2) not null default 0,

  vendedor           text,
  comissao_percentual numeric(5,2),
  comissao_valor     numeric(14,2),
  tecnico            text,
  orcar              boolean default false,

  forma_recebimento  text,      -- ex.: Boleto, Pix (MVP texto)
  meio               text,      -- ex.: Banco, Cartão (MVP texto)
  conta_bancaria     text,      -- MVP texto
  categoria_financeira text,    -- MVP texto
  condicao_pagamento text,      -- ex.: "30 60, 3x"

  observacoes        text,
  observacoes_internas text,

  anexos             text[],    -- MVP: array de URLs (opcional)
  marcadores         text[],    -- tags

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (empresa_id, numero)
);

create table if not exists public.ordem_servico_itens (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  ordem_servico_id   uuid not null references public.ordem_servicos(id) on delete cascade,

  servico_id         uuid,    -- ref public.servicos.id (opcional: pode ser linha livre)
  descricao          text not null,
  codigo             text,
  quantidade         numeric(14,3) not null default 1,
  preco              numeric(14,2) not null default 0,
  desconto_pct       numeric(6,3)  not null default 0,     -- 0..100
  total              numeric(14,2) not null default 0,

  orcar              boolean default false,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- =========================
-- Trigger updated_at (idempotente)
-- =========================
do $$
begin
  if not exists (
    select 1 from pg_proc
    where proname = 'tg_set_updated_at' and pronamespace = 'public'::regnamespace
  ) then
    create or replace function public.tg_set_updated_at()
    returns trigger
    language plpgsql
    set search_path = pg_catalog, public
    as $fn$
    begin
      new.updated_at := now();
      return new;
    end;
    $fn$;
  end if;
end$$;

drop trigger if exists tg_os_set_updated_at on public.ordem_servicos;
create trigger tg_os_set_updated_at
before update on public.ordem_servicos
for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_os_item_set_updated_at on public.ordem_servico_itens;
create trigger tg_os_item_set_updated_at
before update on public.ordem_servico_itens
for each row execute function public.tg_set_updated_at();

-- =========================
-- Índices
-- =========================
create index if not exists idx_os_empresa on public.ordem_servicos(empresa_id);
create index if not exists idx_os_empresa_status on public.ordem_servicos(empresa_id, status);
create index if not exists idx_os_empresa_cliente on public.ordem_servicos(empresa_id, cliente_id);

create index if not exists idx_os_itens_empresa on public.ordem_servico_itens(empresa_id);
create index if not exists idx_os_itens_os on public.ordem_servico_itens(ordem_servico_id);

-- =========================
-- RLS por operação
-- =========================
alter table public.ordem_servicos enable row level security;
alter table public.ordem_servico_itens enable row level security;

-- OS
drop policy if exists sel_os_by_empresa on public.ordem_servicos;
create policy sel_os_by_empresa
  on public.ordem_servicos for select
  using (empresa_id = public.current_empresa_id());

drop policy if exists ins_os_same_empresa on public.ordem_servicos;
create policy ins_os_same_empresa
  on public.ordem_servicos for insert
  with check (empresa_id = public.current_empresa_id());

drop policy if exists upd_os_same_empresa on public.ordem_servicos;
create policy upd_os_same_empresa
  on public.ordem_servicos for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists del_os_same_empresa on public.ordem_servicos;
create policy del_os_same_empresa
  on public.ordem_servicos for delete
  using (empresa_id = public.current_empresa_id());

-- ITENS
drop policy if exists sel_os_itens_by_empresa on public.ordem_servico_itens;
create policy sel_os_itens_by_empresa
  on public.ordem_servico_itens for select
  using (empresa_id = public.current_empresa_id());

drop policy if exists ins_os_itens_same_empresa on public.ordem_servico_itens;
create policy ins_os_itens_same_empresa
  on public.ordem_servico_itens for insert
  with check (
    empresa_id = public.current_empresa_id()
    and ordem_servico_id in (select id from public.ordem_servicos where empresa_id = public.current_empresa_id())
  );

drop policy if exists upd_os_itens_same_empresa on public.ordem_servico_itens;
create policy upd_os_itens_same_empresa
  on public.ordem_servico_itens for update
  using (
    empresa_id = public.current_empresa_id()
    and ordem_servico_id in (select id from public.ordem_servicos where empresa_id = public.current_empresa_id())
  )
  with check (empresa_id = public.current_empresa_id());

drop policy if exists del_os_itens_same_empresa on public.ordem_servico_itens;
create policy del_os_itens_same_empresa
  on public.ordem_servico_itens for delete
  using (
    empresa_id = public.current_empresa_id()
    and ordem_servico_id in (select id from public.ordem_servicos where empresa_id = public.current_empresa_id())
  );

-- =========================
-- Helpers: numeração e recálculo
-- =========================

-- Gera o próximo número por empresa com lock por empresa (advisory)
create or replace function public.next_os_number_for_current_empresa()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_num bigint;
begin
  if v_empresa_id is null then
    raise exception '[OS] empresa_id inválido' using errcode='42501';
  end if;

  -- lock por empresa para evitar corrida
  perform pg_advisory_xact_lock(('x'||substr(replace(v_empresa_id::text,'-',''),1,16))::bit(64)::bigint);

  select coalesce(max(numero), 0) + 1
    into v_num
  from public.ordem_servicos
  where empresa_id = v_empresa_id;

  return v_num;
end;
$$;

-- Recalcula totais da OS a partir dos itens
create or replace function public.os_recalc_totals(p_os_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_tot_itens numeric(14,2);
  v_desc     numeric(14,2);
begin
  if v_empresa_id is null then
    raise exception '[OS][RECALC] empresa_id inválido' using errcode='42501';
  end if;

  select coalesce(sum(total),0) into v_tot_itens
  from public.ordem_servico_itens
  where ordem_servico_id = p_os_id
    and empresa_id = v_empresa_id;

  -- Desconto é campo da OS; mantém valor já gravado
  select desconto_valor into v_desc
  from public.ordem_servicos
  where id = p_os_id and empresa_id = v_empresa_id;

  update public.ordem_servicos
     set total_itens = v_tot_itens,
         total_geral = greatest(v_tot_itens - coalesce(v_desc,0), 0)
   where id = p_os_id
     and empresa_id = v_empresa_id;
end;
$$;

-- Calcula total do item (preco * quantidade * (1 - desconto%/100))
create or replace function public.os_calc_item_total(p_qty numeric, p_price numeric, p_disc numeric)
returns numeric
language sql
immutable
as $$
  select round( coalesce(p_qty,0) * coalesce(p_price,0) * (1 - coalesce(p_disc,0)/100.0), 2)
$$;

-- Trigger para calcular total do item e recalc da OS
create or replace function public.tg_os_item_total_and_recalc()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.total := public.os_calc_item_total(new.quantidade, new.preco, new.desconto_pct);
  return new;
end;
$$;

drop trigger if exists tg_os_item_calc_total on public.ordem_servico_itens;
create trigger tg_os_item_calc_total
before insert or update on public.ordem_servico_itens
for each row execute function public.tg_os_item_total_and_recalc();

-- Após mudar itens, recalc totais da OS
create or replace function public.tg_os_after_change_recalc()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform public.os_recalc_totals(coalesce(new.ordem_servico_id, old.ordem_servico_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists tg_os_item_after_change on public.ordem_servico_itens;
create trigger tg_os_item_after_change
after insert or update or delete on public.ordem_servico_itens
for each row execute function public.tg_os_after_change_recalc();

-- =========================
-- RPCs seguras (SECURITY DEFINER)
-- =========================

-- CREATE OS
create or replace function public.create_os_for_current_user(payload jsonb)
returns public.ordem_servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  rec public.ordem_servicos;
begin
  if v_empresa_id is null then
    raise exception '[RPC][CREATE_OS] empresa_id inválido' using errcode='42501';
  end if;

  insert into public.ordem_servicos (
    id, empresa_id, numero, cliente_id, status,
    descricao, consideracoes_finais,
    data_inicio, data_prevista, hora, data_conclusao,
    desconto_valor, vendedor, comissao_percentual, comissao_valor,
    tecnico, orcar, forma_recebimento, meio, conta_bancaria, categoria_financeira,
    condicao_pagamento, observacoes, observacoes_internas, anexos, marcadores
  )
  values (
    gen_random_uuid(),
    v_empresa_id,
    coalesce( nullif(payload->>'numero','')::bigint, public.next_os_number_for_current_empresa() ),
    nullif(payload->>'cliente_id','')::uuid,
    coalesce(nullif(payload->>'status','')::public.status_os, 'orcamento'),
    payload->>'descricao',
    payload->>'consideracoes_finais',
    nullif(payload->>'data_inicio','')::date,
    nullif(payload->>'data_prevista','')::date,
    nullif(payload->>'hora','')::time,
    nullif(payload->>'data_conclusao','')::date,
    coalesce(nullif(payload->>'desconto_valor','')::numeric,0),
    payload->>'vendedor',
    nullif(payload->>'comissao_percentual','')::numeric,
    nullif(payload->>'comissao_valor','')::numeric,
    payload->>'tecnico',
    coalesce(nullif(payload->>'orcar','')::boolean,false),
    payload->>'forma_recebimento',
    payload->>'meio',
    payload->>'conta_bancaria',
    payload->>'categoria_financeira',
    payload->>'condicao_pagamento',
    payload->>'observacoes',
    payload->>'observacoes_internas',
    case when payload ? 'anexos' then string_to_array(payload->>'anexos', ',') else null end,
    case when payload ? 'marcadores' then string_to_array(payload->>'marcadores', ',') else null end
  )
  returning * into rec;

  perform pg_notify('app_log', '[RPC] [CREATE_OS] ' || rec.id::text);
  return rec;
end;
$$;

revoke all on function public.create_os_for_current_user(jsonb) from public;
grant execute on function public.create_os_for_current_user(jsonb) to authenticated;
grant execute on function public.create_os_for_current_user(jsonb) to service_role;

-- UPDATE OS
create or replace function public.update_os_for_current_user(p_id uuid, payload jsonb)
returns public.ordem_servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  rec public.ordem_servicos;
begin
  if v_emp is null then
    raise exception '[RPC][UPDATE_OS] empresa_id inválido' using errcode='42501';
  end if;

  update public.ordem_servicos os
     set numero              = coalesce(nullif(payload->>'numero','')::bigint, os.numero),
         cliente_id          = coalesce(nullif(payload->>'cliente_id','')::uuid, os.cliente_id),
         status              = coalesce(nullif(payload->>'status','')::public.status_os, os.status),
         descricao           = coalesce(nullif(payload->>'descricao',''), os.descricao),
         consideracoes_finais= coalesce(nullif(payload->>'consideracoes_finais',''), os.consideracoes_finais),
         data_inicio         = coalesce(nullif(payload->>'data_inicio','')::date, os.data_inicio),
         data_prevista       = coalesce(nullif(payload->>'data_prevista','')::date, os.data_prevista),
         hora                = coalesce(nullif(payload->>'hora','')::time, os.hora),
         data_conclusao      = coalesce(nullif(payload->>'data_conclusao','')::date, os.data_conclusao),
         desconto_valor      = coalesce(nullif(payload->>'desconto_valor','')::numeric, os.desconto_valor),
         vendedor            = coalesce(nullif(payload->>'vendedor',''), os.vendedor),
         comissao_percentual = coalesce(nullif(payload->>'comissao_percentual','')::numeric, os.comissao_percentual),
         comissao_valor      = coalesce(nullif(payload->>'comissao_valor','')::numeric, os.comissao_valor),
         tecnico             = coalesce(nullif(payload->>'tecnico',''), os.tecnico),
         orcar               = coalesce(nullif(payload->>'orcar','')::boolean, os.orcar),
         forma_recebimento   = coalesce(nullif(payload->>'forma_recebimento',''), os.forma_recebimento),
         meio                = coalesce(nullif(payload->>'meio',''), os.meio),
         conta_bancaria      = coalesce(nullif(payload->>'conta_bancaria',''), os.conta_bancaria),
         categoria_financeira= coalesce(nullif(payload->>'categoria_financeira',''), os.categoria_financeira),
         condicao_pagamento  = coalesce(nullif(payload->>'condicao_pagamento',''), os.condicao_pagamento),
         observacoes         = coalesce(nullif(payload->>'observacoes',''), os.observacoes),
         observacoes_internas= coalesce(nullif(payload->>'observacoes_internas',''), os.observacoes_internas)
   where os.id = p_id and os.empresa_id = v_emp
  returning * into rec;

  if not found then
    raise exception '[RPC][UPDATE_OS] OS não encontrada' using errcode='P0002';
  end if;

  -- recalc após possível mudança de desconto
  perform public.os_recalc_totals(p_id);

  perform pg_notify('app_log', '[RPC] [UPDATE_OS] ' || rec.id::text);
  return rec;
end;
$$;

revoke all on function public.update_os_for_current_user(uuid, jsonb) from public;
grant execute on function public.update_os_for_current_user(uuid, jsonb) to authenticated;
grant execute on function public.update_os_for_current_user(uuid, jsonb) to service_role;

-- DELETE OS
create or replace function public.delete_os_for_current_user(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.ordem_servicos os
  where os.id = p_id
    and os.empresa_id = public.current_empresa_id();

  if not found then
    raise exception '[RPC][DELETE_OS] OS não encontrada' using errcode='P0002';
  end if;

  perform pg_notify('app_log', '[RPC] [DELETE_OS] ' || p_id::text);
end;
$$;

revoke all on function public.delete_os_for_current_user(uuid) from public;
grant execute on function public.delete_os_for_current_user(uuid) to authenticated;
grant execute on function public.delete_os_for_current_user(uuid) to service_role;

-- CRUD de ITENS
create or replace function public.add_os_item_for_current_user(p_os_id uuid, payload jsonb)
returns public.ordem_servico_itens
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  rec public.ordem_servico_itens;
begin
  if v_emp is null then
    raise exception '[RPC][OS_ITEM][ADD] empresa_id inválido' using errcode='42501';
  end if;

  -- confere vínculo da OS com a empresa
  if not exists (select 1 from public.ordem_servicos where id = p_os_id and empresa_id = v_emp) then
    raise exception '[RPC][OS_ITEM][ADD] OS fora da empresa atual' using errcode='42501';
  end if;

  insert into public.ordem_servico_itens (
    empresa_id, ordem_servico_id, servico_id, descricao, codigo,
    quantidade, preco, desconto_pct, total, orcar
  )
  values (
    v_emp, p_os_id,
    nullif(payload->>'servico_id','')::uuid,
    coalesce(nullif(payload->>'descricao',''), 'Serviço'),
    nullif(payload->>'codigo',''),
    coalesce(nullif(payload->>'quantidade','')::numeric, 1),
    coalesce(nullif(payload->>'preco','')::numeric, 0),
    coalesce(nullif(payload->>'desconto_pct','')::numeric, 0),
    0, -- calculado no BEFORE trigger
    coalesce(nullif(payload->>'orcar','')::boolean, false)
  )
  returning * into rec;

  -- trigger AFTER já recalcula totais
  perform pg_notify('app_log', '[RPC] [OS_ITEM][ADD] ' || rec.id::text);
  return rec;
end;
$$;

revoke all on function public.add_os_item_for_current_user(uuid, jsonb) from public;
grant execute on function public.add_os_item_for_current_user(uuid, jsonb) to authenticated;
grant execute on function public.add_os_item_for_current_user(uuid, jsonb) to service_role;

create or replace function public.update_os_item_for_current_user(p_item_id uuid, payload jsonb)
returns public.ordem_servico_itens
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  rec public.ordem_servico_itens;
begin
  update public.ordem_servico_itens i
     set servico_id   = coalesce(nullif(payload->>'servico_id','')::uuid, i.servico_id),
         descricao    = coalesce(nullif(payload->>'descricao',''), i.descricao),
         codigo       = case when payload ? 'codigo' then nullif(payload->>'codigo','') else i.codigo end,
         quantidade   = coalesce(nullif(payload->>'quantidade','')::numeric, i.quantidade),
         preco        = coalesce(nullif(payload->>'preco','')::numeric, i.preco),
         desconto_pct = coalesce(nullif(payload->>'desconto_pct','')::numeric, i.desconto_pct),
         orcar        = coalesce(nullif(payload->>'orcar','')::boolean, i.orcar)
   where i.id = p_item_id
     and i.empresa_id = v_emp
  returning * into rec;

  if not found then
    raise exception '[RPC][OS_ITEM][UPDATE] Item não encontrado' using errcode='P0002';
  end if;

  perform pg_notify('app_log', '[RPC] [OS_ITEM][UPDATE] ' || rec.id::text);
  return rec;
end;
$$;

revoke all on function public.update_os_item_for_current_user(uuid, jsonb) from public;
grant execute on function public.update_os_item_for_current_user(uuid, jsonb) to authenticated;
grant execute on function public.update_os_item_for_current_user(uuid, jsonb) to service_role;

create or replace function public.delete_os_item_for_current_user(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_os uuid;
begin
  select ordem_servico_id into v_os
  from public.ordem_servico_itens
  where id = p_item_id and empresa_id = v_emp;

  if not found then
    raise exception '[RPC][OS_ITEM][DELETE] Item não encontrado' using errcode='P0002';
  end if;

  delete from public.ordem_servico_itens where id = p_item_id and empresa_id = v_emp;

  -- recalc totais
  perform public.os_recalc_totals(v_os);

  perform pg_notify('app_log', '[RPC] [OS_ITEM][DELETE] ' || p_item_id::text);
end;
$$;

revoke all on function public.delete_os_item_for_current_user(uuid) from public;
grant execute on function public.delete_os_item_for_current_user(uuid) to authenticated;
grant execute on function public.delete_os_item_for_current_user(uuid) to service_role;

-- GET/LIST
create or replace function public.get_os_by_id_for_current_user(p_id uuid)
returns public.ordem_servicos
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select *
  from public.ordem_servicos
  where id = p_id and empresa_id = public.current_empresa_id()
  limit 1
$$;

revoke all on function public.get_os_by_id_for_current_user(uuid) from public;
grant execute on function public.get_os_by_id_for_current_user(uuid) to authenticated;
grant execute on function public.get_os_by_id_for_current_user(uuid) to service_role;

create or replace function public.list_os_for_current_user(
  p_search text default null,
  p_status public.status_os default null,
  p_limit int default 50,
  p_offset int default 0,
  p_order_by text default 'numero',
  p_order_dir text default 'desc'
)
returns setof public.ordem_servicos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_sql text;
begin
  if v_emp is null then
    raise exception '[RPC][LIST_OS] empresa_id inválido' using errcode='42501';
  end if;

  v_sql := format($q$
    select * from public.ordem_servicos
    where empresa_id = $1
      %s
      %s
    order by %I %s
    limit $2 offset $3
  $q$,
    case when p_search is null or btrim(p_search) = '' then ''
         else 'and (cast(numero as text) ilike ''%''||$4||''%'' or coalesce(descricao,'''') ilike ''%''||$4||''%'')' end,
    case when p_status is null then '' else 'and status = $5' end,
    p_order_by,
    case when lower(p_order_dir) = 'asc' then 'asc' else 'desc' end
  );

  return query execute v_sql using
    v_emp, p_limit, p_offset,
    case when p_search is null then null else p_search end,
    p_status;
end;
$$;

revoke all on function public.list_os_for_current_user(text, public.status_os, int, int, text, text) from public;
grant execute on function public.list_os_for_current_user(text, public.status_os, int, int, text, text) to authenticated;
grant execute on function public.list_os_for_current_user(text, public.status_os, int, int, text, text) to service_role;
