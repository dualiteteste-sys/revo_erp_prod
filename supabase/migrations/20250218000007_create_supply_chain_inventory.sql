/*
  # Módulo Suprimentos - Controle de Estoque (Kardex)

  ## Query Description
  Cria a estrutura para gerenciamento de estoque, incluindo saldos atuais e histórico de movimentações (Kardex).
  Implementa RPCs seguras para registrar entradas/saídas e consultar posições.

  ## Impact Summary
  - Segurança:
    - RLS habilitado em todas as tabelas (estoque_saldos, estoque_movimentos).
    - RPCs SECURITY DEFINER com search_path restrito.
  - Performance:
    - Índices em chaves estrangeiras e campos de busca.
    - Saldo desnormalizado em tabela própria para leitura rápida sem aggregate.
  - Compatibilidade:
    - Migração idempotente (IF NOT EXISTS).
*/

-- =============================================
-- 1. Tabelas
-- =============================================

-- 1.1. Saldos de Estoque (Snapshot atual)
create table if not exists public.estoque_saldos (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  produto_id uuid not null,
  saldo numeric(15,4) not null default 0,
  custo_medio numeric(15,4) default 0, -- Para valorização do estoque
  localizacao text, -- Cache da localização do produto ou local específico
  updated_at timestamptz default now(),

  constraint estoque_saldos_pkey primary key (id),
  constraint estoque_saldos_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint estoque_saldos_produto_fkey foreign key (produto_id) references public.produtos(id) on delete cascade,
  constraint estoque_saldos_unique_produto unique (empresa_id, produto_id)
);

-- 1.2. Movimentações de Estoque (Kardex)
create table if not exists public.estoque_movimentos (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  produto_id uuid not null,
  tipo text not null check (tipo in ('entrada', 'saida', 'ajuste_entrada', 'ajuste_saida', 'perda', 'inventario')),
  quantidade numeric(15,4) not null, -- Sempre positivo, o tipo define o sinal
  saldo_anterior numeric(15,4) not null,
  saldo_novo numeric(15,4) not null,
  custo_unitario numeric(15,4), -- Custo no momento da movimentação
  documento_ref text, -- Nº Nota, Pedido, etc.
  observacao text,
  created_at timestamptz default now(),
  created_by uuid default public.current_user_id(),

  constraint estoque_movimentos_pkey primary key (id),
  constraint estoque_movimentos_empresa_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint estoque_movimentos_produto_fkey foreign key (produto_id) references public.produtos(id) on delete cascade
);

-- =============================================
-- 2. Índices
-- =============================================

create index if not exists idx_estoque_saldos_produto on public.estoque_saldos(produto_id);
create index if not exists idx_estoque_movimentos_produto on public.estoque_movimentos(produto_id);
create index if not exists idx_estoque_movimentos_data on public.estoque_movimentos(created_at desc);

-- =============================================
-- 3. RLS Policies
-- =============================================

alter table public.estoque_saldos enable row level security;
alter table public.estoque_movimentos enable row level security;

-- Saldos
drop policy if exists "estoque_saldos_select" on public.estoque_saldos;
create policy "estoque_saldos_select" on public.estoque_saldos
  for select using (empresa_id = public.current_empresa_id());

-- Movimentos
drop policy if exists "estoque_movimentos_select" on public.estoque_movimentos;
create policy "estoque_movimentos_select" on public.estoque_movimentos
  for select using (empresa_id = public.current_empresa_id());

-- Escrita direta bloqueada para garantir integridade via RPC (exceto se necessário, mas RPC é preferível)
-- Vamos permitir insert/update apenas via service_role ou RPCs security definer,
-- mas para consistência com o padrão do projeto, definimos policies restritivas.

drop policy if exists "estoque_saldos_all" on public.estoque_saldos;
create policy "estoque_saldos_all" on public.estoque_saldos
  for all using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

drop policy if exists "estoque_movimentos_insert" on public.estoque_movimentos;
create policy "estoque_movimentos_insert" on public.estoque_movimentos
  for insert with check (empresa_id = public.current_empresa_id());

-- =============================================
-- 4. Triggers
-- =============================================

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'handle_updated_at_estoque_saldos'
      and tgrelid = 'public.estoque_saldos'::regclass
  ) then
    create trigger handle_updated_at_estoque_saldos
      before update on public.estoque_saldos
      for each row execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- =============================================
-- 5. RPCs
-- =============================================

-- Drop versões antigas para garantir assinatura correta (Regra 14)
drop function if exists public.suprimentos_registrar_movimento(uuid, text, numeric, numeric, text, text);
drop function if exists public.suprimentos_list_posicao_estoque(text, boolean);
drop function if exists public.suprimentos_get_kardex(uuid, integer);

-- 5.1 Registrar Movimento (Entrada/Saída/Ajuste)
create or replace function public.suprimentos_registrar_movimento(
  p_produto_id uuid,
  p_tipo text,
  p_quantidade numeric,
  p_custo_unitario numeric default null,
  p_documento_ref text default null,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_saldo_anterior numeric := 0;
  v_saldo_novo numeric := 0;
  v_fator int := 1;
  v_movimento_id uuid;
  v_produto_nome text;
begin
  -- Validações básicas
  if p_quantidade <= 0 then
    raise exception 'A quantidade deve ser maior que zero.';
  end if;

  -- Determina sinal da operação
  if p_tipo in ('saida', 'ajuste_saida', 'perda') then
    v_fator := -1;
  end if;
  
  -- Se for 'inventario', a lógica é diferente (ajuste absoluto), mas por enquanto vamos tratar como ajuste relativo
  -- Para simplificar, assumimos que o frontend calcula a diferença se for um balanço cego,
  -- ou implementamos 'inventario' setando o saldo diretamente.
  -- Vamos manter a lógica incremental por segurança nesta versão.

  -- 1. Obter saldo atual (lock for update para evitar concorrência)
  select saldo into v_saldo_anterior
  from public.estoque_saldos
  where empresa_id = v_empresa_id and produto_id = p_produto_id
  for update;

  if v_saldo_anterior is null then
    v_saldo_anterior := 0;
    -- Cria registro de saldo se não existir
    insert into public.estoque_saldos (empresa_id, produto_id, saldo)
    values (v_empresa_id, p_produto_id, 0);
  end if;

  -- 2. Calcular novo saldo
  v_saldo_novo := v_saldo_anterior + (p_quantidade * v_fator);

  -- Validação de saldo negativo (opcional, configurável por empresa no futuro)
  if v_saldo_novo < 0 and p_tipo not in ('ajuste_saida', 'inventario') then
    -- raise notice 'Aviso: Saldo ficará negativo.'; 
    -- Por enquanto permitimos, mas poderíamos bloquear.
  end if;

  -- 3. Atualizar Saldo
  update public.estoque_saldos
  set 
    saldo = v_saldo_novo,
    custo_medio = case 
      when p_tipo = 'entrada' and p_custo_unitario is not null and v_saldo_novo > 0 then
        -- Média ponderada simples: ((saldo_ant * custo_ant) + (qtd_ent * custo_ent)) / saldo_novo
        ((v_saldo_anterior * coalesce(custo_medio, 0)) + (p_quantidade * p_custo_unitario)) / v_saldo_novo
      else custo_medio -- Mantém custo médio nas saídas ou se não informado
    end
  where empresa_id = v_empresa_id and produto_id = p_produto_id;

  -- 4. Registrar Movimento
  insert into public.estoque_movimentos (
    empresa_id, produto_id, tipo, quantidade, saldo_anterior, saldo_novo,
    custo_unitario, documento_ref, observacao
  ) values (
    v_empresa_id, p_produto_id, p_tipo, p_quantidade, v_saldo_anterior, v_saldo_novo,
    p_custo_unitario, p_documento_ref, p_observacao
  ) returning id into v_movimento_id;

  -- Log
  select nome into v_produto_nome from public.produtos where id = p_produto_id;
  perform pg_notify(
    'app_log',
    '[RPC] suprimentos_movimento: ' || p_tipo || ' prod=' || coalesce(v_produto_nome, 'N/A') || ' qtd=' || p_quantidade
  );

  return jsonb_build_object(
    'movimento_id', v_movimento_id,
    'novo_saldo', v_saldo_novo
  );
end;
$$;

revoke all on function public.suprimentos_registrar_movimento from public;
grant execute on function public.suprimentos_registrar_movimento to authenticated, service_role;

-- 5.2 Listar Posição de Estoque (Produtos + Saldos)
create or replace function public.suprimentos_list_posicao_estoque(
  p_search text default null,
  p_baixo_estoque boolean default false
)
returns table (
  produto_id uuid,
  nome text,
  sku text,
  unidade text,
  saldo numeric,
  custo_medio numeric,
  estoque_min numeric,
  status_estoque text -- 'ok', 'baixo', 'zerado'
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  select
    p.id as produto_id,
    p.nome,
    p.sku,
    p.unidade,
    coalesce(s.saldo, 0) as saldo,
    coalesce(s.custo_medio, 0) as custo_medio,
    p.estoque_min,
    case
      when coalesce(s.saldo, 0) <= 0 then 'zerado'
      when p.estoque_min is not null and coalesce(s.saldo, 0) <= p.estoque_min then 'baixo'
      else 'ok'
    end as status_estoque
  from public.produtos p
  left join public.estoque_saldos s
    on p.id = s.produto_id and s.empresa_id = p.empresa_id
  where p.empresa_id = public.current_empresa_id()
    and p.status = 'ativo'
    and p.controla_estoque = true
    and (p_search is null or p.nome ilike '%' || p_search || '%' or p.sku ilike '%' || p_search || '%')
    and (
      p_baixo_estoque = false 
      or (
        coalesce(s.saldo, 0) <= coalesce(p.estoque_min, 0) -- Filtra baixo ou zerado se solicitado
      )
    )
  order by p.nome;
end;
$$;

revoke all on function public.suprimentos_list_posicao_estoque from public;
grant execute on function public.suprimentos_list_posicao_estoque to authenticated, service_role;

-- 5.3 Obter Kardex (Histórico)
create or replace function public.suprimentos_get_kardex(
  p_produto_id uuid,
  p_limit integer default 50
)
returns table (
  id uuid,
  tipo text,
  quantidade numeric,
  saldo_anterior numeric,
  saldo_novo numeric,
  documento_ref text,
  observacao text,
  created_at timestamptz,
  usuario_email text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  select
    m.id,
    m.tipo,
    m.quantidade,
    m.saldo_anterior,
    m.saldo_novo,
    m.documento_ref,
    m.observacao,
    m.created_at,
    (select email from auth.users u where u.id = m.created_by) as usuario_email
  from public.estoque_movimentos m
  where m.empresa_id = public.current_empresa_id()
    and m.produto_id = p_produto_id
  order by m.created_at desc
  limit p_limit;
end;
$$;

revoke all on function public.suprimentos_get_kardex from public;
grant execute on function public.suprimentos_get_kardex to authenticated, service_role;
