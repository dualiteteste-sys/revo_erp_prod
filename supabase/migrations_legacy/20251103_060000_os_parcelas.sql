-- 20251103_060000_os_parcelas.sql (CORRIGIDA)
-- Módulo OS: parcelas automáticas
-- Logs: [RPC] [OS][PARCELAS] [AUTH]

-- =========================
-- ENUM status da parcela (idempotente)
-- =========================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'status_parcela') then
    create type public.status_parcela as enum ('aberta','paga','cancelada');
  end if;
end$$;

-- =========================
-- Tabela de parcelas
-- =========================
create table if not exists public.ordem_servico_parcelas (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresas(id) on delete cascade,
  ordem_servico_id  uuid not null references public.ordem_servicos(id) on delete cascade,
  numero_parcela    int  not null,
  vencimento        date not null,
  valor             numeric(14,2) not null default 0,
  status            public.status_parcela not null default 'aberta',
  pago_em           date,
  observacoes       text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (empresa_id, ordem_servico_id, numero_parcela)
);

-- Trigger updated_at (idempotente)
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

drop trigger if exists tg_os_parcela_set_updated_at on public.ordem_servico_parcelas;
create trigger tg_os_parcela_set_updated_at
before update on public.ordem_servico_parcelas
for each row execute function public.tg_set_updated_at();

-- Índices
create index if not exists idx_os_parcela_empresa on public.ordem_servico_parcelas(empresa_id);
create index if not exists idx_os_parcela_os on public.ordem_servico_parcelas(ordem_servico_id);

-- =========================
-- RLS por operação
-- =========================
alter table public.ordem_servico_parcelas enable row level security;

drop policy if exists sel_os_parcelas_by_empresa on public.ordem_servico_parcelas;
create policy sel_os_parcelas_by_empresa
  on public.ordem_servico_parcelas
  for select using (empresa_id = public.current_empresa_id());

drop policy if exists ins_os_parcelas_same_empresa on public.ordem_servico_parcelas;
create policy ins_os_parcelas_same_empresa
  on public.ordem_servico_parcelas
  for insert with check (
    empresa_id = public.current_empresa_id()
    and ordem_servico_id in (select id from public.ordem_servicos where empresa_id = public.current_empresa_id())
  );

drop policy if exists upd_os_parcelas_same_empresa on public.ordem_servico_parcelas;
create policy upd_os_parcelas_same_empresa
  on public.ordem_servico_parcelas
  for update using (
    empresa_id = public.current_empresa_id()
    and ordem_servico_id in (select id from public.ordem_servicos where empresa_id = public.current_empresa_id())
  )
  with check (empresa_id = public.current_empresa_id());

drop policy if exists del_os_parcelas_same_empresa on public.ordem_servico_parcelas;
create policy del_os_parcelas_same_empresa
  on public.ordem_servico_parcelas
  for delete using (
    empresa_id = public.current_empresa_id()
    and ordem_servico_id in (select id from public.ordem_servicos where empresa_id = public.current_empresa_id())
  );

-- =========================
-- Helpers: split e parse
-- =========================
create or replace function public.str_tokenize(p_text text)
returns text[]
language sql
immutable
as $$
  select coalesce(
           regexp_split_to_array(
             regexp_replace(coalesce(p_text,''), '\s*,\s*', ' ', 'g'),
             '\s+'
           ),
           '{}'
         );
$$;

-- Retorna offsets (em meses) progressivos, partindo de uma base (0-based)
-- Ex.: months_from(3) => {0,1,2}
create or replace function public.months_from(p_n int)
returns int[]
language sql
immutable
as $$
  select array_agg(g) from generate_series(0, greatest(p_n-1,0)) g;
$$;

-- =========================
-- RPC: gerar parcelas a partir de condicao_pagamento/total
-- =========================
create or replace function public.os_generate_parcels_for_current_user(
  p_os_id uuid,
  p_cond text default null,           -- se null usa condicao_pagamento da OS
  p_total numeric default null,       -- se null usa total_geral da OS
  p_base_date date default null       -- se null usa coalesce(data_inicio, current_date)
)
returns setof public.ordem_servico_parcelas
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_os public.ordem_servicos;
  v_cond text;
  v_total numeric(14,2);
  v_base date;
  v_tokens text[];
  v_due_dates date[] := '{}';
  v_last_due date;
  v_t text;
  v_n int;
  v_i int;
  v_sum numeric(14,2);
  v_each numeric(14,2);
  v_rest numeric(14,2);
  v_rows int;
  v_due date; -- <-- DECLARAÇÃO NECESSÁRIA PARA O FOREACH
begin
  if v_emp is null then
    raise exception '[RPC][OS][PARCELAS] empresa_id inválido' using errcode='42501';
  end if;

  select * into v_os
  from public.ordem_servicos
  where id = p_os_id and empresa_id = v_emp;

  if not found then
    raise exception '[RPC][OS][PARCELAS] OS não encontrada' using errcode='P0002';
  end if;

  v_cond  := coalesce(nullif(p_cond,''), v_os.condicao_pagamento);
  v_total := coalesce(p_total, v_os.total_geral);
  v_base  := coalesce(p_base_date, v_os.data_inicio, current_date);

  if coalesce(v_total,0) <= 0 then
    raise exception '[RPC][OS][PARCELAS] Total da OS inválido (<= 0)' using errcode='22003';
  end if;

  if v_cond is null or btrim(v_cond) = '' then
    -- fallback: 1x no base_date
    v_due_dates := array_append(v_due_dates, v_base::date);
  else
    v_tokens := public.str_tokenize(v_cond);

    v_last_due := null;  -- última data criada
    foreach v_t in array v_tokens loop
      v_t := btrim(v_t);

      -- inteiro → dias
      if v_t ~ '^\d+$' then
        v_due_dates := array_append(v_due_dates, (v_base + (v_t::int) * interval '1 day')::date);
        v_last_due  := (v_base + (v_t::int) * interval '1 day')::date;

      -- +Nx → acrescenta N meses depois da última data (ou base se nenhuma)
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

      -- Nx → N parcelas mensais; se já tiver datas anteriores, começa após a última
      elsif v_t ~ '^\d+x$' then
        v_n := regexp_replace(v_t, '[^\d]', '', 'g')::int;
        if v_n > 0 then
          if v_last_due is null then
            -- inicia na base
            v_last_due := v_base;
            v_due_dates := array_append(v_due_dates, v_last_due::date);
            for v_i in 2..v_n loop
              v_last_due := (v_last_due + interval '1 month')::date;
              v_due_dates := array_append(v_due_dates, v_last_due::date);
            end loop;
          else
            -- já existe: continua mensal após a última
            for v_i in 1..v_n loop
              v_last_due := (v_last_due + interval '1 month')::date;
              v_due_dates := array_append(v_due_dates, v_last_due::date);
            end loop;
          end if;
        end if;

      else
        -- ignora tokens inválidos (MVP)
        continue;
      end if;
    end loop;

    if array_length(v_due_dates,1) is null then
      v_due_dates := array_append(v_due_dates, v_base::date);
    end if;
  end if;

  -- distribuição de valores: parcelas iguais, ajustando o restante na última
  v_rows := array_length(v_due_dates,1);
  v_each := round((v_total / v_rows)::numeric, 2);
  v_sum  := v_each * v_rows;
  v_rest := round(v_total - v_sum, 2);  -- ajuste de centavos

  -- Remove parcelas existentes da OS (na empresa) e recria
  delete from public.ordem_servico_parcelas
  where empresa_id = v_emp and ordem_servico_id = v_os.id;

  v_i := 0;
  foreach v_due in array v_due_dates loop
    v_i := v_i + 1;
    insert into public.ordem_servico_parcelas (
      empresa_id, ordem_servico_id, numero_parcela, vencimento, valor, status
    ) values (
      v_emp, v_os.id, v_i, v_due::date, v_each + case when v_i = v_rows then v_rest else 0 end, 'aberta'
    );
  end loop;

  perform public.os_recalc_totals(v_os.id);

  perform pg_notify('app_log', '[RPC] [OS][PARCELAS] ' || v_os.id::text || ' - ' || v_rows::text || ' parcela(s) geradas');

  return query
  select *
  from public.ordem_servico_parcelas
  where empresa_id = v_emp and ordem_servico_id = v_os.id
  order by numero_parcela;
end;
$$;

revoke all on function public.os_generate_parcels_for_current_user(uuid, text, numeric, date) from public;
grant execute on function public.os_generate_parcels_for_current_user(uuid, text, numeric, date) to authenticated;
grant execute on function public.os_generate_parcels_for_current_user(uuid, text, numeric, date) to service_role;

-- =========================
-- RPC: listar parcelas da OS
-- =========================
create or replace function public.list_os_parcels_for_current_user(p_os_id uuid)
returns setof public.ordem_servico_parcelas
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select *
  from public.ordem_servico_parcelas
  where empresa_id = public.current_empresa_id()
    and ordem_servico_id = p_os_id
  order by numero_parcela;
$$;

revoke all on function public.list_os_parcels_for_current_user(uuid) from public;
grant execute on function public.list_os_parcels_for_current_user(uuid) to authenticated;
grant execute on function public.list_os_parcels_for_current_user(uuid) to service_role;
