-- Regras de automação (por empresa) + RPCs de configuração
begin;

create table if not exists public.industria_automacao_regras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  chave text not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_ind_automacao_empresa_chave
  on public.industria_automacao_regras(empresa_id, chave);

alter table public.industria_automacao_regras enable row level security;

drop policy if exists "ind_auto_select" on public.industria_automacao_regras;
create policy "ind_auto_select" on public.industria_automacao_regras
  for select using (empresa_id = public.current_empresa_id());

drop policy if exists "ind_auto_insert" on public.industria_automacao_regras;
create policy "ind_auto_insert" on public.industria_automacao_regras
  for insert with check (empresa_id = public.current_empresa_id());

drop policy if exists "ind_auto_update" on public.industria_automacao_regras;
create policy "ind_auto_update" on public.industria_automacao_regras
  for update using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists "ind_auto_delete" on public.industria_automacao_regras;
create policy "ind_auto_delete" on public.industria_automacao_regras
  for delete using (empresa_id = public.current_empresa_id());

drop trigger if exists tg_ind_automacao_updated_at on public.industria_automacao_regras;
create trigger tg_ind_automacao_updated_at
before update on public.industria_automacao_regras
for each row execute function public.tg_set_updated_at();

-- Upsert
drop function if exists public.industria_automacao_upsert(text, boolean, jsonb);
create or replace function public.industria_automacao_upsert(
  p_chave text,
  p_enabled boolean,
  p_config jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.industria_automacao_regras (empresa_id, chave, enabled, config)
  values (public.current_empresa_id(), p_chave, coalesce(p_enabled, true), coalesce(p_config, '{}'::jsonb))
  on conflict (empresa_id, chave)
  do update set
    enabled = excluded.enabled,
    config = excluded.config,
    updated_at = now();
end;
$$;

-- List
drop function if exists public.industria_automacao_list();
create or replace function public.industria_automacao_list()
returns table (
  chave text,
  enabled boolean,
  config jsonb,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select r.chave, r.enabled, r.config, r.updated_at
    from public.industria_automacao_regras r
   where r.empresa_id = public.current_empresa_id()
   order by r.chave asc;
$$;

-- Get config consolidado com defaults
drop function if exists public.industria_automacao_get();
create or replace function public.industria_automacao_get()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_auto boolean := true;
  v_parada_min int := 20;
  v_refugo_percent numeric := 5;
  v_row record;
begin
  for v_row in
    select chave, enabled, config
      from public.industria_automacao_regras
     where empresa_id = v_emp
  loop
    if v_row.chave = 'auto_avancar' then
      v_auto := coalesce(v_row.enabled, v_auto);
    elsif v_row.chave = 'alerta_parada' then
      v_parada_min := coalesce((v_row.config->>'minutos')::int, v_parada_min);
    elsif v_row.chave = 'alerta_refugo' then
      v_refugo_percent := coalesce((v_row.config->>'percent')::numeric, v_refugo_percent);
    end if;
  end loop;

  return jsonb_build_object(
    'auto_avancar', v_auto,
    'alerta_parada_minutos', v_parada_min,
    'alerta_refugo_percent', v_refugo_percent
  );
end;
$$;

revoke all on function public.industria_automacao_upsert(text, boolean, jsonb) from public;
grant execute on function public.industria_automacao_upsert(text, boolean, jsonb) to authenticated, service_role;

revoke all on function public.industria_automacao_list() from public;
grant execute on function public.industria_automacao_list() to authenticated, service_role;

revoke all on function public.industria_automacao_get() from public;
grant execute on function public.industria_automacao_get() to authenticated, service_role;

commit;

