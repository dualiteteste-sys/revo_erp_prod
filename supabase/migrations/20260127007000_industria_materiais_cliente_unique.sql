/*
  # Materiais de Clientes: garantir unique para upsert do recebimento

  Problema:
  - A RPC `recebimento_sync_materiais_cliente` usa `ON CONFLICT (empresa_id, cliente_id, produto_id, codigo_cliente)`.
  - Em alguns ambientes, `public.industria_materiais_cliente` existe, mas NÃO possui unique/exclusion
    nesses campos, gerando erro: "there is no unique or exclusion constraint matching the ON CONFLICT specification".

  Solução:
  - Garante a tabela (se ausente) com os campos usados pela aplicação.
  - Remove duplicidades (se existirem) para permitir criar o índice único.
  - Cria um índice UNIQUE em (empresa_id, cliente_id, produto_id, codigo_cliente).
*/

create schema if not exists public;

-- 1) Cria a tabela caso não exista (alguns ambientes tinham drift)
create table if not exists public.industria_materiais_cliente (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id(),
  cliente_id uuid not null,
  produto_id uuid not null,
  codigo_cliente text,
  nome_cliente text,
  unidade text,
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- FKs (best-effort)
do $$
begin
  if to_regclass('public.pessoas') is not null then
    if not exists (
      select 1 from pg_constraint
      where conname = 'industria_materiais_cliente_cliente_fkey'
        and conrelid = 'public.industria_materiais_cliente'::regclass
    ) then
      alter table public.industria_materiais_cliente
        add constraint industria_materiais_cliente_cliente_fkey
        foreign key (cliente_id) references public.pessoas(id);
    end if;
  end if;

  if to_regclass('public.produtos') is not null then
    if not exists (
      select 1 from pg_constraint
      where conname = 'industria_materiais_cliente_produto_fkey'
        and conrelid = 'public.industria_materiais_cliente'::regclass
    ) then
      alter table public.industria_materiais_cliente
        add constraint industria_materiais_cliente_produto_fkey
        foreign key (produto_id) references public.produtos(id);
    end if;
  end if;
exception when others then
  -- não bloqueia: ambientes podem ter nomes/constraints diferentes
  null;
end $$;

-- 2) Dedup (se houver) antes de criar UNIQUE
do $$
declare
  v_has_updated boolean := false;
  v_has_created boolean := false;
  v_sql text;
begin
  if to_regclass('public.industria_materiais_cliente') is null then
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='industria_materiais_cliente' and column_name='updated_at'
  ) into v_has_updated;
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='industria_materiais_cliente' and column_name='created_at'
  ) into v_has_created;

  if v_has_updated then
    v_sql := $q$
      delete from public.industria_materiais_cliente mc
      using (
        select id,
               row_number() over (
                 partition by empresa_id, cliente_id, produto_id, codigo_cliente
                 order by updated_at desc nulls last
               ) as rn
        from public.industria_materiais_cliente
      ) d
      where mc.id = d.id and d.rn > 1;
    $q$;
  elsif v_has_created then
    v_sql := $q$
      delete from public.industria_materiais_cliente mc
      using (
        select id,
               row_number() over (
                 partition by empresa_id, cliente_id, produto_id, codigo_cliente
                 order by created_at desc nulls last
               ) as rn
        from public.industria_materiais_cliente
      ) d
      where mc.id = d.id and d.rn > 1;
    $q$;
  else
    v_sql := $q$
      delete from public.industria_materiais_cliente mc
      using (
        select id,
               row_number() over (
                 partition by empresa_id, cliente_id, produto_id, codigo_cliente
                 order by id
               ) as rn
        from public.industria_materiais_cliente
      ) d
      where mc.id = d.id and d.rn > 1;
    $q$;
  end if;

  begin
    execute v_sql;
  exception when undefined_column then
    -- fallback ultraconservador se o schema for diferente: não dedupa
    null;
  end;
end $$;

-- 3) Índice UNIQUE usado pelo ON CONFLICT
create unique index if not exists ux_industria_materiais_cliente_key
  on public.industria_materiais_cliente (empresa_id, cliente_id, produto_id, codigo_cliente);

