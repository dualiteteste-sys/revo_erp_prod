/*
  # Indústria - Módulo Fichas Técnicas / Estruturas (BOM)

  ## Query Description
  Cria o módulo de Fichas Técnicas / Estruturas (BOM) para Indústria,
  permitindo definir estruturas padrão de produtos para Produção e Beneficiamento
  e aplicar essas estruturas em ordens já existentes.

  ## Impact Summary
  - Segurança:
    - Tabelas com RLS por operação (SELECT/INSERT/UPDATE/DELETE) filtrando por empresa_id.
    - RPCs SECURITY DEFINER com search_path fixo (pg_catalog, public).
    - Uso consistente de public.current_empresa_id().
  - Compatibilidade:
    - create table if not exists, create index if not exists.
    - drop function if exists para redefinição segura de RPCs.
  - Reversibilidade:
    - Todas as tabelas, índices, policies e funções podem ser dropadas em migração futura.
  - Performance:
    - Índices em empresa_id, chaves estrangeiras e campos de filtro/busca.
*/

-- =============================================
-- 0. Limpeza de funções legadas (Regra 14)
-- =============================================

drop function if exists public.industria_bom_list(
  text, uuid, text, boolean, int, int
);
drop function if exists public.industria_bom_get_details(uuid);
drop function if exists public.industria_bom_upsert(jsonb);
drop function if exists public.industria_bom_manage_componente(
  uuid, uuid, uuid, numeric, text, numeric, boolean, text, text
);
drop function if exists public.industria_aplicar_bom_em_ordem_producao(
  uuid, uuid, text
);
drop function if exists public.industria_aplicar_bom_em_ordem_beneficiamento(
  uuid, uuid, text
);

-- =============================================
-- 1. Tabelas BOM
-- =============================================

-- 1.1 Tabela principal de BOM
create table if not exists public.industria_boms (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  produto_final_id uuid not null,
  tipo_bom text not null check (tipo_bom in ('producao', 'beneficiamento')),
  codigo text,
  descricao text,
  versao int not null default 1,
  ativo boolean not null default true,
  padrao_para_producao boolean not null default false,
  padrao_para_beneficiamento boolean not null default false,
  data_inicio_vigencia date,
  data_fim_vigencia date,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint industria_boms_pkey primary key (id),
  constraint industria_boms_empresa_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint industria_boms_produto_fkey
    foreign key (produto_final_id) references public.produtos(id)
);

-- 1.2 Componentes da BOM
create table if not exists public.industria_boms_componentes (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  bom_id uuid not null,
  produto_id uuid not null,
  quantidade numeric(15,4) not null check (quantidade &gt; 0),
  unidade text not null,
  perda_percentual numeric(6,2) not null default 0 check (perda_percentual &gt;= 0 and perda_percentual &lt;= 100),
  obrigatorio boolean not null default true,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint industria_boms_comp_pkey primary key (id),
  constraint industria_boms_comp_empresa_fkey
    foreign key (empresa_id) references public.empresas(id) on delete cascade,
  constraint industria_boms_comp_bom_fkey
    foreign key (bom_id) references public.industria_boms(id) on delete cascade,
  constraint industria_boms_comp_produto_fkey
    foreign key (produto_id) references public.produtos(id)
);

-- =============================================
-- 2. Índices
-- =============================================

-- BOM header
create index if not exists idx_ind_boms_empresa
  on public.industria_boms(empresa_id);

create index if not exists idx_ind_boms_produto_tipo
  on public.industria_boms(empresa_id, produto_final_id, tipo_bom);

create unique index if not exists idx_ind_boms_empresa_produto_tipo_versao
  on public.industria_boms(empresa_id, produto_final_id, tipo_bom, versao);

-- Componentes
create index if not exists idx_ind_boms_comp_empresa_bom
  on public.industria_boms_componentes(empresa_id, bom_id);

create index if not exists idx_ind_boms_comp_empresa_produto
  on public.industria_boms_componentes(empresa_id, produto_id);

-- =============================================
-- 3. Triggers updated_at
-- =============================================

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'handle_updated_at_industria_boms'
      and tgrelid = 'public.industria_boms'::regclass
  ) then
    create trigger handle_updated_at_industria_boms
      before update on public.industria_boms
      for each row
      execute procedure public.tg_set_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'handle_updated_at_industria_boms_componentes'
      and tgrelid = 'public.industria_boms_componentes'::regclass
  ) then
    create trigger handle_updated_at_industria_boms_componentes
      before update on public.industria_boms_componentes
      for each row
      execute procedure public.tg_set_updated_at();
  end if;
end;
$$;

-- =============================================
-- 4. RLS (por operação)
-- =============================================

alter table public.industria_boms               enable row level security;
alter table public.industria_boms_componentes   enable row level security;

-- industria_boms
drop policy if exists "ind_boms_select" on public.industria_boms;
drop policy if exists "ind_boms_insert" on public.industria_boms;
drop policy if exists "ind_boms_update" on public.industria_boms;
drop policy if exists "ind_boms_delete" on public.industria_boms;

create policy "ind_boms_select"
  on public.industria_boms
  for select
  using (empresa_id = public.current_empresa_id());

create policy "ind_boms_insert"
  on public.industria_boms
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "ind_boms_update"
  on public.industria_boms
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "ind_boms_delete"
  on public.industria_boms
  for delete
  using (empresa_id = public.current_empresa_id());

-- industria_boms_componentes
drop policy if exists "ind_boms_comp_select" on public.industria_boms_componentes;
drop policy if exists "ind_boms_comp_insert" on public.industria_boms_componentes;
drop policy if exists "ind_boms_comp_update" on public.industria_boms_componentes;
drop policy if exists "ind_boms_comp_delete" on public.industria_boms_componentes;

create policy "ind_boms_comp_select"
  on public.industria_boms_componentes
  for select
  using (empresa_id = public.current_empresa_id());

create policy "ind_boms_comp_insert"
  on public.industria_boms_componentes
  for insert
  with check (empresa_id = public.current_empresa_id());

create policy "ind_boms_comp_update"
  on public.industria_boms_componentes
  for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());

create policy "ind_boms_comp_delete"
  on public.industria_boms_componentes
  for delete
  using (empresa_id = public.current_empresa_id());

-- =============================================
-- 5. RPCs - Listagem e Detalhes de BOM
-- =============================================

-- 5.1 Listar BOMs
create or replace function public.industria_bom_list(
  p_search        text   default null,
  p_produto_id    uuid   default null,
  p_tipo_bom      text   default null,   -- 'producao' | 'beneficiamento'
  p_ativo         boolean default null,
  p_limit         int    default 50,
  p_offset        int    default 0
)
returns table (
  id                         uuid,
  produto_final_id           uuid,
  produto_nome               text,
  tipo_bom                   text,
  codigo                     text,
  versao                     int,
  ativo                      boolean,
  padrao_para_producao       boolean,
  padrao_para_beneficiamento boolean,
  data_inicio_vigencia       date,
  data_fim_vigencia          date
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  return query
  select
    b.id,
    b.produto_final_id,
    p.nome as produto_nome,
    b.tipo_bom,
    b.codigo,
    b.versao,
    b.ativo,
    b.padrao_para_producao,
    b.padrao_para_beneficiamento,
    b.data_inicio_vigencia,
    b.data_fim_vigencia
  from public.industria_boms b
  join public.produtos p
    on b.produto_final_id = p.id
  where b.empresa_id = v_empresa_id
    and (p_produto_id is null or b.produto_final_id = p_produto_id)
    and (p_tipo_bom  is null or b.tipo_bom         = p_tipo_bom)
    and (
      p_ativo is null
      or b.ativo = p_ativo
    )
    and (
      p_search is null
      or b.codigo    ilike '%' || p_search || '%'
      or b.descricao ilike '%' || p_search || '%'
      or p.nome      ilike '%' || p_search || '%'
    )
  order by
    produto_nome asc,
    b.tipo_bom,
    b.versao desc,
    b.created_at desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.industria_bom_list from public;
grant execute on function public.industria_bom_list to authenticated, service_role;

-- 5.2 Detalhes da BOM
create or replace function public.industria_bom_get_details(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id  uuid := public.current_empresa_id();
  v_bom         jsonb;
  v_componentes jsonb;
begin
  -- Header
  select
    to_jsonb(b.*)
    || jsonb_build_object('produto_nome', p.nome)
  into v_bom
  from public.industria_boms b
  join public.produtos p
    on b.produto_final_id = p.id
  where b.id = p_id
    and b.empresa_id = v_empresa_id;

  if v_bom is null then
    return null;
  end if;

  -- Componentes
  select jsonb_agg(
           to_jsonb(c.*)
           || jsonb_build_object('produto_nome', prod.nome)
         )
  into v_componentes
  from public.industria_boms_componentes c
  join public.produtos prod
    on c.produto_id = prod.id
  where c.bom_id     = p_id
    and c.empresa_id = v_empresa_id;

  return v_bom
         || jsonb_build_object(
              'componentes', coalesce(v_componentes, '[]'::jsonb)
            );
end;
$$;

revoke all on function public.industria_bom_get_details from public;
grant execute on function public.industria_bom_get_details to authenticated, service_role;

-- =============================================
-- 6. RPC - Upsert de BOM (header)
-- =============================================

create or replace function public.industria_bom_upsert(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id                        uuid;
  v_empresa_id                uuid := public.current_empresa_id();
  v_tipo_bom                  text;
  v_padrao_para_producao      boolean;
  v_padrao_para_beneficiamento boolean;
begin
  v_tipo_bom := p_payload-&gt;&gt;'tipo_bom';

  if v_tipo_bom is null or v_tipo_bom not in ('producao', 'beneficiamento') then
    raise exception 'tipo_bom inválido. Use ''producao'' ou ''beneficiamento''.';
  end if;

  v_padrao_para_producao :=
    coalesce((p_payload-&gt;&gt;'padrao_para_producao')::boolean, false);
  v_padrao_para_beneficiamento :=
    coalesce((p_payload-&gt;&gt;'padrao_para_beneficiamento')::boolean, false);

  -- Normaliza flags de padrão de acordo com o tipo
  if v_tipo_bom = 'producao' then
    v_padrao_para_beneficiamento := false;
  elsif v_tipo_bom = 'beneficiamento' then
    v_padrao_para_producao := false;
  end if;

  if p_payload-&gt;&gt;'id' is not null then
    update public.industria_boms
    set
      produto_final_id           = (p_payload-&gt;&gt;'produto_final_id')::uuid,
      tipo_bom                   = v_tipo_bom,
      codigo                     = p_payload-&gt;&gt;'codigo',
      descricao                  = p_payload-&gt;&gt;'descricao',
      versao                     = coalesce((p_payload-&gt;&gt;'versao')::int, versao),
      ativo                      = coalesce((p_payload-&gt;&gt;'ativo')::boolean, ativo),
      padrao_para_producao       = v_padrao_para_producao,
      padrao_para_beneficiamento = v_padrao_para_beneficiamento,
      data_inicio_vigencia       = (p_payload-&gt;&gt;'data_inicio_vigencia')::date,
      data_fim_vigencia          = (p_payload-&gt;&gt;'data_fim_vigencia')::date,
      observacoes                = p_payload-&gt;&gt;'observacoes'
    where id = (p_payload-&gt;&gt;'id')::uuid
      and empresa_id = v_empresa_id
    returning id into v_id;
  else
    insert into public.industria_boms (
      empresa_id,
      produto_final_id,
      tipo_bom,
      codigo,
      descricao,
      versao,
      ativo,
      padrao_para_producao,
      padrao_para_beneficiamento,
      data_inicio_vigencia,
      data_fim_vigencia,
      observacoes
    ) values (
      v_empresa_id,
      (p_payload-&gt;&gt;'produto_final_id')::uuid,
      v_tipo_bom,
      p_payload-&gt;&gt;'codigo',
      p_payload-&gt;&gt;'descricao',
      coalesce((p_payload-&gt;&gt;'versao')::int, 1),
      coalesce((p_payload-&gt;&gt;'ativo')::boolean, true),
      v_padrao_para_producao,
      v_padrao_para_beneficiamento,
      (p_payload-&gt;&gt;'data_inicio_vigencia')::date,
      (p_payload-&gt;&gt;'data_fim_vigencia')::date,
      p_payload-&gt;&gt;'observacoes'
    )
    returning id into v_id;
  end if;

  perform pg_notify(
    'app_log',
    '[RPC] industria_bom_upsert: ' || v_id
  );

  return public.industria_bom_get_details(v_id);
end;
$$;

revoke all on function public.industria_bom_upsert from public;
grant execute on function public.industria_bom_upsert to authenticated, service_role;

-- =============================================
-- 7. RPC - Gerenciar componente da BOM
-- =============================================

create or replace function public.industria_bom_manage_componente(
  p_bom_id             uuid,
  p_componente_id      uuid,    -- null se insert
  p_produto_id         uuid,
  p_quantidade         numeric,
  p_unidade            text,
  p_perda_percentual   numeric,
  p_obrigatorio        boolean,
  p_observacoes        text,
  p_action             text     -- 'upsert' ou 'delete'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id        uuid    := public.current_empresa_id();
  v_quantidade        numeric := p_quantidade;
  v_perda             numeric := coalesce(p_perda_percentual, 0);
begin
  -- Valida BOM da empresa
  if not exists (
    select 1
    from public.industria_boms b
    where b.id = p_bom_id
      and b.empresa_id = v_empresa_id
  ) then
    raise exception 'BOM não encontrada ou acesso negado.';
  end if;

  if p_action = 'delete' then
    delete from public.industria_boms_componentes
    where id = p_componente_id
      and empresa_id = v_empresa_id;
    return;
  end if;

  -- Valida quantidade / perda
  if v_quantidade is null or v_quantidade &lt;= 0 then
    raise exception 'Quantidade do componente deve ser maior que zero.';
  end if;

  if v_perda &lt; 0 or v_perda &gt; 100 then
    raise exception 'perda_percentual deve estar entre 0 e 100.';
  end if;

  if p_componente_id is not null then
    update public.industria_boms_componentes
    set
      produto_id       = p_produto_id,
      quantidade       = v_quantidade,
      unidade          = p_unidade,
      perda_percentual = v_perda,
      obrigatorio      = coalesce(p_obrigatorio, true),
      observacoes      = p_observacoes
    where id = p_componente_id
      and empresa_id = v_empresa_id;
  else
    insert into public.industria_boms_componentes (
      empresa_id,
      bom_id,
      produto_id,
      quantidade,
      unidade,
      perda_percentual,
      obrigatorio,
      observacoes
    ) values (
      v_empresa_id,
      p_bom_id,
      p_produto_id,
      v_quantidade,
      p_unidade,
      v_perda,
      coalesce(p_obrigatorio, true),
      p_observacoes
    );
  end if;
end;
$$;

revoke all on function public.industria_bom_manage_componente from public;
grant execute on function public.industria_bom_manage_componente to authenticated, service_role;

-- =============================================
-- 8. RPC - Aplicar BOM em Ordem de Produção
-- =============================================

create or replace function public.industria_aplicar_bom_em_ordem_producao(
  p_bom_id   uuid,
  p_ordem_id uuid,
  p_modo     text default 'substituir'  -- 'substituir' | 'adicionar'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id          uuid   := public.current_empresa_id();
  v_produto_bom         uuid;
  v_produto_ordem       uuid;
  v_qtd_planejada_ordem numeric;
begin
  -- Valida BOM
  select b.produto_final_id
  into v_produto_bom
  from public.industria_boms b
  where b.id = p_bom_id
    and b.empresa_id = v_empresa_id
    and b.tipo_bom = 'producao';

  if v_produto_bom is null then
    raise exception 'BOM não encontrada, não pertence à empresa atual ou não é de tipo producao.';
  end if;

  -- Valida Ordem de Produção
  select o.produto_final_id, o.quantidade_planejada
  into v_produto_ordem, v_qtd_planejada_ordem
  from public.industria_producao_ordens o
  where o.id = p_ordem_id
    and o.empresa_id = v_empresa_id;

  if v_produto_ordem is null then
    raise exception 'Ordem de produção não encontrada ou acesso negado.';
  end if;

  if v_produto_bom &lt;&gt; v_produto_ordem then
    raise exception 'Produto da BOM difere do produto da ordem de produção.';
  end if;

  if v_qtd_planejada_ordem is null or v_qtd_planejada_ordem &lt;= 0 then
    raise exception 'Quantidade planejada da ordem de produção inválida.';
  end if;

  -- Modo: substituir → remove componentes de origem bom_padrao
  if p_modo = 'substituir' then
    delete from public.industria_producao_componentes c
    where c.empresa_id = v_empresa_id
      and c.ordem_id   = p_ordem_id
      and c.origem     = 'bom_padrao';
  elsif p_modo &lt;&gt; 'adicionar' then
    raise exception 'Modo inválido. Use ''substituir'' ou ''adicionar''.';
  end if;

  -- Insere componentes calculados a partir da BOM
  insert into public.industria_producao_componentes (
    empresa_id,
    ordem_id,
    produto_id,
    quantidade_planejada,
    quantidade_consumida,
    unidade,
    origem
  )
  select
    v_empresa_id,
    p_ordem_id,
    c.produto_id,
    c.quantidade * v_qtd_planejada_ordem,
    0::numeric,
    c.unidade,
    'bom_padrao'
  from public.industria_boms_componentes c
  where c.bom_id     = p_bom_id
    and c.empresa_id = v_empresa_id;

  perform pg_notify(
    'app_log',
    '[RPC] industria_aplicar_bom_em_ordem_producao: bom=' || p_bom_id || ' ordem=' || p_ordem_id
  );
end;
$$;

revoke all on function public.industria_aplicar_bom_em_ordem_producao from public;
grant execute on function public.industria_aplicar_bom_em_ordem_producao to authenticated, service_role;

-- =============================================
-- 9. RPC - Aplicar BOM em Ordem de Beneficiamento
-- =============================================

create or replace function public.industria_aplicar_bom_em_ordem_beneficiamento(
  p_bom_id   uuid,
  p_ordem_id uuid,
  p_modo     text default 'substituir'  -- 'substituir' | 'adicionar'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id            uuid   := public.current_empresa_id();
  v_produto_bom           uuid;
  v_produto_servico_ordem uuid;
  v_qtd_planejada_ordem   numeric;
begin
  -- Valida BOM (tipo beneficiamento)
  select b.produto_final_id
  into v_produto_bom
  from public.industria_boms b
  where b.id = p_bom_id
    and b.empresa_id = v_empresa_id
    and b.tipo_bom = 'beneficiamento';

  if v_produto_bom is null then
    raise exception 'BOM não encontrada, não pertence à empresa atual ou não é de tipo beneficiamento.';
  end if;

  -- Valida Ordem de Beneficiamento
  select o.produto_servico_id, o.quantidade_planejada
  into v_produto_servico_ordem, v_qtd_planejada_ordem
  from public.industria_benef_ordens o
  where o.id = p_ordem_id
    and o.empresa_id = v_empresa_id;

  if v_produto_servico_ordem is null then
    raise exception 'Ordem de beneficiamento não encontrada ou acesso negado.';
  end if;

  if v_produto_bom &lt;&gt; v_produto_servico_ordem then
    raise exception 'Produto/serviço da BOM difere do produto_servico da ordem de beneficiamento.';
  end if;

  if v_qtd_planejada_ordem is null or v_qtd_planejada_ordem &lt;= 0 then
    raise exception 'Quantidade planejada da ordem de beneficiamento inválida.';
  end if;

  -- Modo: substituir → remove componentes de origem bom_padrao
  if p_modo = 'substituir' then
    delete from public.industria_benef_componentes c
    where c.empresa_id = v_empresa_id
      and c.ordem_id   = p_ordem_id
      and c.origem     = 'bom_padrao';
  elsif p_modo &lt;&gt; 'adicionar' then
    raise exception 'Modo inválido. Use ''substituir'' ou ''adicionar''.';
  end if;

  -- Insere componentes calculados a partir da BOM
  insert into public.industria_benef_componentes (
    empresa_id,
    ordem_id,
    produto_id,
    quantidade_planejada,
    quantidade_consumida,
    unidade,
    origem
  )
  select
    v_empresa_id,
    p_ordem_id,
    c.produto_id,
    c.quantidade * v_qtd_planejada_ordem,
    0::numeric,
    c.unidade,
    'bom_padrao'
  from public.industria_boms_componentes c
  where c.bom_id     = p_bom_id
    and c.empresa_id = v_empresa_id;

  perform pg_notify(
    'app_log',
    '[RPC] industria_aplicar_bom_em_ordem_beneficiamento: bom=' || p_bom_id || ' ordem=' || p_ordem_id
  );
end;
$$;

revoke all on function public.industria_aplicar_bom_em_ordem_beneficiamento from public;
grant execute on function public.industria_aplicar_bom_em_ordem_beneficiamento to authenticated, service_role;
