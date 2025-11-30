/*
# Módulo RH - ISO 9001 (Cargos, Pessoas e Competências)

## Query Description
Implementa a estrutura base para gestão de RH focada na ISO 9001 (5.3, 7.1.2, 7.2).
Inclui tabelas para Cargos, Colaboradores, Competências e seus relacionamentos (Requisitos e Avaliações).

## Impact Summary
- Segurança:
  - Ativa RLS em todas as tabelas do módulo, filtrando por empresa_id = public.current_empresa_id().
  - RPCs SECURITY DEFINER com search_path restrito a pg_catalog, public.
- Compatibilidade:
  - create table if not exists.
  - Constraints UNIQUE e triggers criados com checagens em catálogo (idempotentes).
  - Políticas RLS recriadas com drop policy if exists.
- Reversibilidade:
  - Apenas criação de estruturas novas (tabelas, índices, políticas, funções).
  - Remoção reversível via drop tabelas/funções/policies se necessário.
- Performance:
  - Índices básicos em empresa_id e FKs.
  - UNIQUE (empresa_id, ...) para suportar ON CONFLICT.
*/

-- =============================================
-- 1. Tabelas base
-- =============================================

-- 1.1. Tabela de Cargos
create table if not exists public.rh_cargos (
    id uuid not null default gen_random_uuid(),
    empresa_id uuid not null default public.current_empresa_id(),
    nome text not null,
    descricao text,
    responsabilidades text, -- ISO 9001 5.3
    autoridades text,       -- ISO 9001 5.3
    setor text,
    ativo boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),

    constraint rh_cargos_pkey primary key (id),
    constraint rh_cargos_empresa_id_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
    constraint rh_cargos_empresa_nome_key unique (empresa_id, nome)
);

-- 1.2. Tabela de Competências
create table if not exists public.rh_competencias (
    id uuid not null default gen_random_uuid(),
    empresa_id uuid not null default public.current_empresa_id(),
    nome text not null,
    descricao text,
    tipo text not null check (tipo in ('tecnica', 'comportamental', 'certificacao', 'idioma', 'outros')),
    critico_sgq boolean default false, -- Importante para ISO 9001
    ativo boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),

    constraint rh_competencias_pkey primary key (id),
    constraint rh_competencias_empresa_id_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
    constraint rh_competencias_empresa_nome_key unique (empresa_id, nome)
);

-- 1.3. Tabela de Colaboradores
create table if not exists public.rh_colaboradores (
    id uuid not null default gen_random_uuid(),
    empresa_id uuid not null default public.current_empresa_id(),
    nome text not null,
    email text,
    documento text, -- CPF ou outro
    data_admissao date,
    cargo_id uuid,
    ativo boolean default true,
    user_id uuid, -- Link opcional com auth.users se o colaborador tiver login
    created_at timestamptz default now(),
    updated_at timestamptz default now(),

    constraint rh_colaboradores_pkey primary key (id),
    constraint rh_colaboradores_empresa_id_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
    constraint rh_colaboradores_cargo_id_fkey foreign key (cargo_id) references public.rh_cargos(id) on delete set null,
    constraint rh_colaboradores_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null
);

-- 1.4. Vínculo Cargo <-> Competência (Requisitos)
create table if not exists public.rh_cargo_competencias (
    id uuid not null default gen_random_uuid(),
    empresa_id uuid not null default public.current_empresa_id(),
    cargo_id uuid not null,
    competencia_id uuid not null,
    nivel_requerido integer default 1 check (nivel_requerido between 1 and 5),
    obrigatorio boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),

    constraint rh_cargo_competencias_pkey primary key (id),
    constraint rh_cargo_competencias_empresa_id_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
    constraint rh_cargo_competencias_cargo_fkey foreign key (cargo_id) references public.rh_cargos(id) on delete cascade,
    constraint rh_cargo_competencias_comp_fkey foreign key (competencia_id) references public.rh_competencias(id) on delete cascade
);

-- Garante UNIQUE (empresa_id, cargo_id, competencia_id) mesmo se a tabela já existir sem a constraint
do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'rh_cargo_competencias_unique'
        and conrelid = 'public.rh_cargo_competencias'::regclass
    ) then
        alter table public.rh_cargo_competencias
        add constraint rh_cargo_competencias_unique unique (empresa_id, cargo_id, competencia_id);
    end if;
end;
$$;

-- 1.5. Vínculo Colaborador <-> Competência (Avaliação/Histórico)
create table if not exists public.rh_colaborador_competencias (
    id uuid not null default gen_random_uuid(),
    empresa_id uuid not null default public.current_empresa_id(),
    colaborador_id uuid not null,
    competencia_id uuid not null,
    nivel_atual integer default 1 check (nivel_atual between 1 and 5),
    data_avaliacao date default current_date,
    origem text, -- Ex: Treinamento, Experiência, Certificação
    validade date,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),

    constraint rh_col_competencias_pkey primary key (id),
    constraint rh_col_competencias_empresa_id_fkey foreign key (empresa_id) references public.empresas(id) on delete cascade,
    constraint rh_col_competencias_colab_fkey foreign key (colaborador_id) references public.rh_colaboradores(id) on delete cascade,
    constraint rh_col_competencias_comp_fkey foreign key (competencia_id) references public.rh_competencias(id) on delete cascade
);

-- Garante UNIQUE (empresa_id, colaborador_id, competencia_id) caso a tabela já exista sem a constraint
do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'rh_col_competencias_unique'
        and conrelid = 'public.rh_colaborador_competencias'::regclass
    ) then
        alter table public.rh_colaborador_competencias
        add constraint rh_col_competencias_unique unique (empresa_id, colaborador_id, competencia_id);
    end if;
end;
$$;

-- =============================================
-- 2. Índices para performance
-- =============================================

create index if not exists idx_rh_cargos_empresa            on public.rh_cargos(empresa_id);
create index if not exists idx_rh_colaboradores_empresa     on public.rh_colaboradores(empresa_id);
create index if not exists idx_rh_colaboradores_cargo       on public.rh_colaboradores(cargo_id);
create index if not exists idx_rh_competencias_empresa      on public.rh_competencias(empresa_id);
create index if not exists idx_rh_cargo_comp_cargo          on public.rh_cargo_competencias(cargo_id);
create index if not exists idx_rh_cargo_comp_empresa        on public.rh_cargo_competencias(empresa_id);
create index if not exists idx_rh_colab_comp_colab          on public.rh_colaborador_competencias(colaborador_id);
create index if not exists idx_rh_colab_comp_empresa        on public.rh_colaborador_competencias(empresa_id);

-- =============================================
-- 3. Triggers updated_at (idempotentes)
-- =============================================

do $$
begin
    if not exists (
        select 1 from pg_trigger
        where tgname = 'handle_updated_at_rh_cargos'
        and tgrelid = 'public.rh_cargos'::regclass
    ) then
        create trigger handle_updated_at_rh_cargos
        before update on public.rh_cargos
        for each row execute procedure public.tg_set_updated_at();
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1 from pg_trigger
        where tgname = 'handle_updated_at_rh_competencias'
        and tgrelid = 'public.rh_competencias'::regclass
    ) then
        create trigger handle_updated_at_rh_competencias
        before update on public.rh_competencias
        for each row execute procedure public.tg_set_updated_at();
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1 from pg_trigger
        where tgname = 'handle_updated_at_rh_colaboradores'
        and tgrelid = 'public.rh_colaboradores'::regclass
    ) then
        create trigger handle_updated_at_rh_colaboradores
        before update on public.rh_colaboradores
        for each row execute procedure public.tg_set_updated_at();
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1 from pg_trigger
        where tgname = 'handle_updated_at_rh_colab_comp'
        and tgrelid = 'public.rh_colaborador_competencias'::regclass
    ) then
        create trigger handle_updated_at_rh_colab_comp
        before update on public.rh_colaborador_competencias
        for each row execute procedure public.tg_set_updated_at();
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1 from pg_trigger
        where tgname = 'handle_updated_at_rh_cargo_comp'
        and tgrelid = 'public.rh_cargo_competencias'::regclass
    ) then
        create trigger handle_updated_at_rh_cargo_comp
        before update on public.rh_cargo_competencias
        for each row execute procedure public.tg_set_updated_at();
    end if;
end;
$$;

-- =============================================
-- 4. RLS Policies (Padrão estrito, com USING + WITH CHECK)
-- =============================================

alter table public.rh_cargos                  enable row level security;
alter table public.rh_competencias            enable row level security;
alter table public.rh_colaboradores           enable row level security;
alter table public.rh_cargo_competencias      enable row level security;
alter table public.rh_colaborador_competencias enable row level security;

-- rh_cargos
drop policy if exists "rh_cargos_select" on public.rh_cargos;
drop policy if exists "rh_cargos_insert" on public.rh_cargos;
drop policy if exists "rh_cargos_update" on public.rh_cargos;
drop policy if exists "rh_cargos_delete" on public.rh_cargos;

create policy "rh_cargos_select"
on public.rh_cargos
for select
using (empresa_id = public.current_empresa_id());

create policy "rh_cargos_insert"
on public.rh_cargos
for insert
with check (empresa_id = public.current_empresa_id());

create policy "rh_cargos_update"
on public.rh_cargos
for update
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

create policy "rh_cargos_delete"
on public.rh_cargos
for delete
using (empresa_id = public.current_empresa_id());

-- rh_competencias
drop policy if exists "rh_competencias_select" on public.rh_competencias;
drop policy if exists "rh_competencias_insert" on public.rh_competencias;
drop policy if exists "rh_competencias_update" on public.rh_competencias;
drop policy if exists "rh_competencias_delete" on public.rh_competencias;

create policy "rh_competencias_select"
on public.rh_competencias
for select
using (empresa_id = public.current_empresa_id());

create policy "rh_competencias_insert"
on public.rh_competencias
for insert
with check (empresa_id = public.current_empresa_id());

create policy "rh_competencias_update"
on public.rh_competencias
for update
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

create policy "rh_competencias_delete"
on public.rh_competencias
for delete
using (empresa_id = public.current_empresa_id());

-- rh_colaboradores
drop policy if exists "rh_colaboradores_select" on public.rh_colaboradores;
drop policy if exists "rh_colaboradores_insert" on public.rh_colaboradores;
drop policy if exists "rh_colaboradores_update" on public.rh_colaboradores;
drop policy if exists "rh_colaboradores_delete" on public.rh_colaboradores;

create policy "rh_colaboradores_select"
on public.rh_colaboradores
for select
using (empresa_id = public.current_empresa_id());

create policy "rh_colaboradores_insert"
on public.rh_colaboradores
for insert
with check (empresa_id = public.current_empresa_id());

create policy "rh_colaboradores_update"
on public.rh_colaboradores
for update
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

create policy "rh_colaboradores_delete"
on public.rh_colaboradores
for delete
using (empresa_id = public.current_empresa_id());

-- rh_cargo_competencias
drop policy if exists "rh_cargo_comp_select" on public.rh_cargo_competencias;
drop policy if exists "rh_cargo_comp_insert" on public.rh_cargo_competencias;
drop policy if exists "rh_cargo_comp_update" on public.rh_cargo_competencias;
drop policy if exists "rh_cargo_comp_delete" on public.rh_cargo_competencias;

create policy "rh_cargo_comp_select"
on public.rh_cargo_competencias
for select
using (empresa_id = public.current_empresa_id());

create policy "rh_cargo_comp_insert"
on public.rh_cargo_competencias
for insert
with check (empresa_id = public.current_empresa_id());

create policy "rh_cargo_comp_update"
on public.rh_cargo_competencias
for update
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

create policy "rh_cargo_comp_delete"
on public.rh_cargo_competencias
for delete
using (empresa_id = public.current_empresa_id());

-- rh_colaborador_competencias
drop policy if exists "rh_colab_comp_select" on public.rh_colaborador_competencias;
drop policy if exists "rh_colab_comp_insert" on public.rh_colaborador_competencias;
drop policy if exists "rh_colab_comp_update" on public.rh_colaborador_competencias;
drop policy if exists "rh_colab_comp_delete" on public.rh_colaborador_competencias;

create policy "rh_colab_comp_select"
on public.rh_colaborador_competencias
for select
using (empresa_id = public.current_empresa_id());

create policy "rh_colab_comp_insert"
on public.rh_colaborador_competencias
for insert
with check (empresa_id = public.current_empresa_id());

create policy "rh_colab_comp_update"
on public.rh_colaborador_competencias
for update
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

create policy "rh_colab_comp_delete"
on public.rh_colaborador_competencias
for delete
using (empresa_id = public.current_empresa_id());

-- =============================================
-- 5. RPCs: Cargos
-- =============================================

create or replace function public.rh_list_cargos(
    p_search text default null,
    p_ativo_only boolean default false
)
returns table (
    id uuid,
    nome text,
    descricao text,
    setor text,
    ativo boolean,
    total_colaboradores bigint,
    total_competencias bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
    return query
    select
        c.id,
        c.nome,
        c.descricao,
        c.setor,
        c.ativo,
        (
            select count(*)
            from public.rh_colaboradores col
            where col.cargo_id = c.id
            and col.empresa_id = public.current_empresa_id()
        ) as total_colaboradores,
        (
            select count(*)
            from public.rh_cargo_competencias cc
            where cc.cargo_id = c.id
            and cc.empresa_id = public.current_empresa_id()
        ) as total_competencias
    from public.rh_cargos c
    where c.empresa_id = public.current_empresa_id()
    and (p_search is null or c.nome ilike '%' || p_search || '%')
    and (p_ativo_only is false or c.ativo = true)
    order by c.nome;
end;
$$;

revoke all on function public.rh_list_cargos from public;
grant execute on function public.rh_list_cargos to authenticated, service_role;

create or replace function public.rh_get_cargo_details(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_cargo jsonb;
    v_competencias jsonb;
begin
    select to_jsonb(c.*) into v_cargo
    from public.rh_cargos c
    where c.id = p_id
    and c.empresa_id = public.current_empresa_id();

    if v_cargo is null then
        return null;
    end if;

    select jsonb_agg(
        jsonb_build_object(
            'id', cc.id,
            'competencia_id', comp.id,
            'nome', comp.nome,
            'tipo', comp.tipo,
            'nivel_requerido', cc.nivel_requerido,
            'obrigatorio', cc.obrigatorio
        )
    ) into v_competencias
    from public.rh_cargo_competencias cc
    join public.rh_competencias comp
    on cc.competencia_id = comp.id
    where cc.cargo_id = p_id
    and cc.empresa_id = public.current_empresa_id();

    return v_cargo
        || jsonb_build_object('competencias', coalesce(v_competencias, '[]'::jsonb));
end;
$$;

revoke all on function public.rh_get_cargo_details from public;
grant execute on function public.rh_get_cargo_details to authenticated, service_role;

create or replace function public.rh_upsert_cargo(
    p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_id uuid;
    v_empresa_id uuid := public.current_empresa_id();
    v_competencias jsonb;
    v_comp record;
begin
    if p_payload->>'id' is not null then
        update public.rh_cargos
        set
            nome = p_payload->>'nome',
            descricao = p_payload->>'descricao',
            responsabilidades = p_payload->>'responsabilidades',
            autoridades = p_payload->>'autoridades',
            setor = p_payload->>'setor',
            ativo = coalesce((p_payload->>'ativo')::boolean, true)
        where id = (p_payload->>'id')::uuid
        and empresa_id = v_empresa_id
        returning id into v_id;
    else
        insert into public.rh_cargos (
            empresa_id, nome, descricao, responsabilidades, autoridades, setor, ativo
        ) values (
            v_empresa_id,
            p_payload->>'nome',
            p_payload->>'descricao',
            p_payload->>'responsabilidades',
            p_payload->>'autoridades',
            p_payload->>'setor',
            coalesce((p_payload->>'ativo')::boolean, true)
        )
        returning id into v_id;
    end if;

    -- Atualizar competências se fornecidas
    v_competencias := p_payload->'competencias';
    if v_competencias is not null then
        -- Remove as que não estão na lista
        delete from public.rh_cargo_competencias
        where cargo_id = v_id
        and empresa_id = v_empresa_id
        and competencia_id not in (
            select (value->>'competencia_id')::uuid
            from jsonb_array_elements(v_competencias)
        );

        -- Insere ou atualiza (garantido por UNIQUE empresa_id, cargo_id, competencia_id)
        for v_comp in
            select * from jsonb_array_elements(v_competencias)
        loop
            insert into public.rh_cargo_competencias (
                empresa_id, cargo_id, competencia_id, nivel_requerido, obrigatorio
            ) values (
                v_empresa_id,
                v_id,
                (v_comp.value->>'competencia_id')::uuid,
                coalesce((v_comp.value->>'nivel_requerido')::int, 1),
                coalesce((v_comp.value->>'obrigatorio')::boolean, true)
            )
            on conflict (empresa_id, cargo_id, competencia_id) do update
            set 
                nivel_requerido = excluded.nivel_requerido,
                obrigatorio = excluded.obrigatorio;
        end loop;
    end if;

    perform pg_notify('app_log', '[RPC] rh_upsert_cargo: ' || v_id);
    return public.rh_get_cargo_details(v_id);
end;
$$;

revoke all on function public.rh_upsert_cargo from public;
grant execute on function public.rh_upsert_cargo to authenticated, service_role;

-- =============================================
-- 6. RPCs: Competências
-- =============================================

create or replace function public.rh_list_competencias(
    p_search text default null
)
returns table (
    id uuid,
    nome text,
    tipo text,
    descricao text,
    critico_sgq boolean,
    ativo boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
    return query
    select c.id, c.nome, c.tipo, c.descricao, c.critico_sgq, c.ativo
    from public.rh_competencias c
    where c.empresa_id = public.current_empresa_id()
    and (p_search is null or c.nome ilike '%' || p_search || '%')
    order by c.nome;
end;
$$;

revoke all on function public.rh_list_competencias from public;
grant execute on function public.rh_list_competencias to authenticated, service_role;

create or replace function public.rh_upsert_competencia(
    p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_id uuid;
    v_empresa_id uuid := public.current_empresa_id();
begin
    if p_payload->>'id' is not null then
        update public.rh_competencias
        set
            nome = p_payload->>'nome',
            descricao = p_payload->>'descricao',
            tipo = p_payload->>'tipo',
            critico_sgq = coalesce((p_payload->>'critico_sgq')::boolean, false),
            ativo = coalesce((p_payload->>'ativo')::boolean, true)
        where id = (p_payload->>'id')::uuid
        and empresa_id = v_empresa_id
        returning id into v_id;
    else
        insert into public.rh_competencias (
            empresa_id, nome, descricao, tipo, critico_sgq, ativo
        ) values (
            v_empresa_id,
            p_payload->>'nome',
            p_payload->>'descricao',
            p_payload->>'tipo',
            coalesce((p_payload->>'critico_sgq')::boolean, false),
            coalesce((p_payload->>'ativo')::boolean, true)
        )
        returning id into v_id;
    end if;

    perform pg_notify('app_log', '[RPC] rh_upsert_competencia: ' || v_id);

    return (
        select to_jsonb(c.*)
        from public.rh_competencias c
        where c.id = v_id
    );
end;
$$;

revoke all on function public.rh_upsert_competencia from public;
grant execute on function public.rh_upsert_competencia to authenticated, service_role;
