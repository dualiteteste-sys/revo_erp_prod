/*
  # Financeiro - Centro de Custos (hierárquico, multi-tenant)

  ## Query Description
  Cria o módulo de Centros de Custos para uso em lançamentos financeiros
  (Contas a Pagar/Receber/Tesouraria), com:
  - Tabela principal financeiro_centros_custos (estrutura em árvore simples).
  - RLS por operação filtrando por empresa_id.
  - RPCs de listagem paginada, detalhes, upsert e delete seguro.

  ## Impact Summary
  - Segurança:
    - RLS por operação (SELECT/INSERT/UPDATE/DELETE).
    - Todas as RPCs com SECURITY DEFINER e search_path = pg_catalog, public.
    - Uso de public.current_empresa_id() para isolamento de empresa.
  - Compatibilidade:
    - create table/index if not exists.
    - drop function if exists antes de recriar RPCs.
    - Não altera estruturas atuais de Contas a Pagar/Receber/Movimentações.
  - Reversibilidade:
    - Tabela, índices, policies e funções podem ser dropadas em migração futura.
  - Performance:
    - Índices em empresa_id, (empresa_id, tipo, ativo) e (empresa_id, parent_id).
    - Listagem paginada com count(*) over().
*/

-- =============================================
-- 0) Limpeza segura de RPCs legadas (se houver)
-- =============================================

drop function if exists public.financeiro_centros_custos_list(
  text, text, boolean, int, int
);
drop function if exists public.financeiro_centros_custos_get(uuid);
drop function if exists public.financeiro_centros_custos_upsert(jsonb);
drop function if exists public.financeiro_centros_custos_delete(uuid);

-- =============================================
-- 1) Tabela principal: Centros de Custos
-- =============================================

create table if not exists public.financeiro_centros_custos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null default public.current_empresa_id(),
  parent_id      uuid,
  codigo         text,                 -- ex: 1.01.003
  nome           text not null,
  tipo           text not null default 'despesa'
                 check (tipo in ('receita','despesa','investimento','outro')),
  nivel          int  not null default 1,      -- 1 = raiz, 2 = filho etc.
  ordem          int  not null default 0,      -- ordenação manual dentro do nível
  ativo          boolean not null default true,
  observacoes    text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),

  constraint fin_ccustos_empresa_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint fin_ccustos_parent_fkey
    foreign key (parent_id) references public.financeiro_centros_custos(id)
      on delete restrict,
  constraint fin_ccustos_empresa_codigo_uk
    unique (empresa_id, codigo),
  constraint fin_ccustos_empresa_nome_parent_uk
    unique (empresa_id, parent_id, nome)
);

-- Índices
create index if not exists idx_fin_ccustos_empresa
  on public.financeiro_centros_custos (empresa_id);

create index if not exists idx_fin_ccustos_empresa_tipo_ativo
  on public.financeiro_centros_custos (empresa_id, tipo, ativo);

create index if not exists idx_fin_ccustos_empresa_parent
  on public.financeiro_centros_custos (empresa_id, parent_id, ordem);

-- Trigger updated_at
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_financeiro_centros_custos'
      and tgrelid = 'public.financeiro_centros_custos'::regclass
  ) then
    create trigger handle_updated_at_financeiro_centros_custos
      before update on public.financeiro_centros_custos
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- =============================================
-- 2) RLS por operação
-- =============================================

alter table public.financeiro_centros_custos enable row level security;

drop policy if exists "fin_ccustos_select" on public.financeiro_centros_custos;
drop policy if exists "fin_ccustos_insert" on public.financeiro_centros_custos;
drop policy if exists "fin_ccustos_update" on public.financeiro_centros_custos;
drop policy if exists "fin_ccustos_delete" on public.financeiro_centros_custos;

create policy "fin_ccustos_select"
  on public.financeiro_centros_custos
  for select
  using (empresa_id = public.current_empresa_id());

create policy "fin_ccustos_insert"
  on public.financeiro_centros_custos
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "fin_ccustos_update"
  on public.financeiro_centros_custos
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "fin_ccustos_delete"
  on public.financeiro_centros_custos
  for delete
  using (empresa_id = public.current_empresa_id());

-- =============================================
-- 3) RPCs - Centros de Custos
-- =============================================

-- 3.1) Listar (paginado, opcionalmente filtrando por tipo/ativo/search)
create or replace function public.financeiro_centros_custos_list(
  p_search text   default null,
  p_tipo   text   default null,   -- 'receita' | 'despesa' | 'investimento' | 'outro'
  p_ativo  boolean default null,
  p_limit  int    default 200,
  p_offset int    default 0
)
returns table (
  id          uuid,
  parent_id   uuid,
  codigo      text,
  nome        text,
  tipo        text,
  nivel       int,
  ordem       int,
  ativo       boolean,
  observacoes text,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  if p_tipo is not null and p_tipo not in ('receita','despesa','investimento','outro') then
    raise exception 'Tipo de centro de custo inválido.';
  end if;

  return query
  select
    c.id,
    c.parent_id,
    c.codigo,
    c.nome,
    c.tipo,
    c.nivel,
    c.ordem,
    c.ativo,
    c.observacoes,
    count(*) over() as total_count
  from public.financeiro_centros_custos c
  where c.empresa_id = v_empresa
    and (p_tipo  is null or c.tipo  = p_tipo)
    and (p_ativo is null or c.ativo = p_ativo)
    and (
      p_search is null
      or c.nome   ilike '%'||p_search||'%'
      or coalesce(c.codigo,'') ilike '%'||p_search||'%'
      or coalesce(c.observacoes,'') ilike '%'||p_search||'%'
    )
  order by
    c.nivel asc,
    c.parent_id nulls first,
    c.ordem asc,
    c.nome asc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.financeiro_centros_custos_list from public;
grant execute on function public.financeiro_centros_custos_list to authenticated, service_role;


-- 3.2) Detalhes de centro de custo
create or replace function public.financeiro_centros_custos_get(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_result  jsonb;
  v_has_children boolean;
begin
  select exists (
    select 1
    from public.financeiro_centros_custos c2
    where c2.empresa_id = v_empresa
      and c2.parent_id = p_id
  )
  into v_has_children;

  select
    to_jsonb(c.*)
    || jsonb_build_object(
         'parent_nome', p.nome,
         'has_children', coalesce(v_has_children, false)
       )
  into v_result
  from public.financeiro_centros_custos c
  left join public.financeiro_centros_custos p
    on p.id = c.parent_id
   and p.empresa_id = v_empresa
  where c.id = p_id
    and c.empresa_id = v_empresa;

  return v_result;
end;
$$;

revoke all on function public.financeiro_centros_custos_get from public;
grant execute on function public.financeiro_centros_custos_get to authenticated, service_role;


-- 3.3) Upsert centro de custo
create or replace function public.financeiro_centros_custos_upsert(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_id      uuid;
  v_parent  uuid;
  v_tipo    text;
  v_nivel   int;
  v_ordem   int;
begin
  if p_payload->>'nome' is null or trim(p_payload->>'nome') = '' then
    raise exception 'Nome do centro de custo é obrigatório.';
  end if;

  v_parent := (p_payload->>'parent_id')::uuid;
  v_tipo   := coalesce(p_payload->>'tipo', 'despesa');

  if v_tipo not in ('receita','despesa','investimento','outro') then
    raise exception 'Tipo de centro de custo inválido.';
  end if;

  -- valida parent da mesma empresa (quando informado)
  if v_parent is not null then
    perform 1
    from public.financeiro_centros_custos c
    where c.id = v_parent
      and c.empresa_id = v_empresa;

    if not found then
      raise exception 'Centro de custo pai não encontrado ou acesso negado.';
    end if;
  end if;

  -- calcula nível
  if v_parent is null then
    v_nivel := 1;
  else
    select coalesce(nivel, 1) + 1
    into v_nivel
    from public.financeiro_centros_custos
    where id = v_parent
      and empresa_id = v_empresa;
  end if;

  v_ordem := coalesce((p_payload->>'ordem')::int, 0);

  if p_payload->>'id' is not null then
    update public.financeiro_centros_custos c
    set
      parent_id   = v_parent,
      codigo      = p_payload->>'codigo',
      nome        = p_payload->>'nome',
      tipo        = v_tipo,
      nivel       = v_nivel,
      ordem       = v_ordem,
      ativo       = coalesce((p_payload->>'ativo')::boolean, ativo),
      observacoes = p_payload->>'observacoes'
    where c.id = (p_payload->>'id')::uuid
      and c.empresa_id = v_empresa
    returning c.id into v_id;
  else
    insert into public.financeiro_centros_custos (
      empresa_id,
      parent_id,
      codigo,
      nome,
      tipo,
      nivel,
      ordem,
      ativo,
      observacoes
    ) values (
      v_empresa,
      v_parent,
      p_payload->>'codigo',
      p_payload->>'nome',
      v_tipo,
      v_nivel,
      v_ordem,
      coalesce((p_payload->>'ativo')::boolean, true),
      p_payload->>'observacoes'
    )
    returning id into v_id;
  end if;

  perform pg_notify(
    'app_log',
    '[RPC] financeiro_centros_custos_upsert: ' || v_id
  );

  return public.financeiro_centros_custos_get(v_id);
end;
$$;

revoke all on function public.financeiro_centros_custos_upsert from public;
grant execute on function public.financeiro_centros_custos_upsert to authenticated, service_role;


-- 3.4) Delete (bloqueia se houver filhos)
create or replace function public.financeiro_centros_custos_delete(
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_has_children boolean;
begin
  select exists (
    select 1
    from public.financeiro_centros_custos c
    where c.empresa_id = v_empresa
      and c.parent_id = p_id
  )
  into v_has_children;

  if v_has_children then
    raise exception 'Centro de custo possui sub-centros vinculados. Remova ou remaneje os filhos antes de excluir.';
  end if;

  delete from public.financeiro_centros_custos
  where id = p_id
    and empresa_id = v_empresa;

  perform pg_notify(
    'app_log',
    '[RPC] financeiro_centros_custos_delete: ' || p_id
  );
end;
$$;

revoke all on function public.financeiro_centros_custos_delete from public;
grant execute on function public.financeiro_centros_custos_delete to authenticated, service_role;
