-- Consolidação de alinhamento DEV x PROD
-- Objetivo: garantir que PROD tenha todas as colunas/defaults/policies/views que o schema esperado usa,
-- sem apagar dados e de forma idempotente.

begin;

create extension if not exists pgcrypto;

-- -------------------------------------------------------------------
-- Enums auxiliares (idempotentes)
-- -------------------------------------------------------------------
do $$ begin
  create type public.tipo_rastreabilidade as enum ('nenhum', 'lote', 'serial');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tipo_produto as enum ('produto', 'servico', 'kit', 'materia_prima', 'semiacabado');
exception when duplicate_object then null; end $$;
do $$ begin
  alter type public.tipo_produto add value if not exists 'consumivel';
  alter type public.tipo_produto add value if not exists 'fantasma';
  alter type public.tipo_produto add value if not exists 'produto';
exception when undefined_object then null; end $$;

do $$ begin
  create type public.tipo_pessoa_enum as enum ('fisica', 'juridica', 'estrangeiro');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.contribuinte_icms_enum as enum ('1', '2', '9');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.pessoa_tipo as enum ('cliente', 'fornecedor', 'ambos', 'transportadora', 'colaborador');
exception when duplicate_object then null; end $$;

-- Enum de embalagens (alguns ambientes antigos ficaram sem valores)
do $$ begin
  alter type public.tipo_embalagem add value if not exists 'pacote';
exception when undefined_object then null; end $$;

-- -------------------------------------------------------------------
-- Tabelas/índices empresa_* (id, PK, defaults, unique)
-- -------------------------------------------------------------------
-- empresa_addons
alter table public.empresa_addons add column if not exists id uuid;
update public.empresa_addons set id = gen_random_uuid() where id is null;
alter table public.empresa_addons alter column id set default gen_random_uuid();
alter table public.empresa_addons alter column cancel_at_period_end set default false;
alter table public.empresa_addons alter column status set default 'active';
alter table public.empresa_addons alter column created_at set default now();
alter table public.empresa_addons alter column updated_at set default now();

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.empresa_addons'::regclass and contype = 'p'
  ) then
    alter table public.empresa_addons add constraint empresa_addons_pkey primary key (id);
  end if;
end $$;

create unique index if not exists empresa_addons_pkey on public.empresa_addons(id);

-- empresa_usuarios
alter table public.empresa_usuarios add column if not exists id uuid;
update public.empresa_usuarios set id = gen_random_uuid() where id is null;
alter table public.empresa_usuarios alter column id set default gen_random_uuid();
alter table public.empresa_usuarios alter column role set default 'member';
alter table public.empresa_usuarios alter column created_at set default now();
alter table public.empresa_usuarios alter column updated_at set default now();

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.empresa_usuarios'::regclass and contype = 'p'
  ) then
    alter table public.empresa_usuarios add constraint empresa_usuarios_pkey primary key (id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.empresa_usuarios'::regclass
      and conname = 'empresa_usuarios_empresa_id_user_id_key'
  ) then
    if exists (
      select 1 from pg_indexes
      where schemaname='public' and tablename='empresa_usuarios' and indexname='empresa_usuarios_empresa_id_user_id_key'
    ) then
      alter table public.empresa_usuarios
        add constraint empresa_usuarios_empresa_id_user_id_key
        unique using index empresa_usuarios_empresa_id_user_id_key;
    else
      alter table public.empresa_usuarios
        add constraint empresa_usuarios_empresa_id_user_id_key
        unique (empresa_id, user_id);
    end if;
  end if;
end $$;

create unique index if not exists empresa_usuarios_pkey on public.empresa_usuarios(id);
create unique index if not exists empresa_usuarios_empresa_id_user_id_key on public.empresa_usuarios(empresa_id, user_id);

-- -------------------------------------------------------------------
-- Produtos: default tolerante para tipo (enum/text)
-- -------------------------------------------------------------------
do $$
declare
  v_typ  regtype;
  v_enum regtype := to_regtype('public.tipo_produto');
begin
  select a.atttypid::regtype into v_typ
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'produtos'
     and a.attname = 'tipo'
     and a.attnum > 0
     and not a.attisdropped;

  if v_enum is not null and v_typ = v_enum then
    execute 'alter type public.tipo_produto add value if not exists ''produto''';
    begin
      execute 'alter table public.produtos alter column tipo set default ''produto''::public.tipo_produto';
    exception when others then
      raise notice 'Não foi possível ajustar default de produtos.tipo como enum (%). Mantendo default atual.', SQLERRM;
    end;
  else
    begin
      execute 'alter table public.produtos alter column tipo set default ''produto''::text';
    exception when others then
      raise notice 'Não foi possível ajustar default de produtos.tipo como text (%). Mantendo default atual.', SQLERRM;
    end;
  end if;
end $$;

-- -------------------------------------------------------------------
-- Industria roteiros: default versao tolerante (text/int)
-- -------------------------------------------------------------------
do $$
declare
  v_typ regtype;
begin
  select a.atttypid::regtype into v_typ
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'industria_roteiros'
     and a.attname = 'versao'
     and a.attnum > 0
     and not a.attisdropped;

  if v_typ::text in ('text','character varying') then
    begin
      execute 'alter table public.industria_roteiros alter column versao set default ''1.0''::text';
    exception when others then
      raise notice 'Não foi possível ajustar default de industria_roteiros.versao (text): %', SQLERRM;
    end;
  elsif v_typ::text = 'integer' then
    begin
      execute 'alter table public.industria_roteiros alter column versao set default 1';
    exception when others then
      raise notice 'Não foi possível ajustar default de industria_roteiros.versao (integer): %', SQLERRM;
    end;
  else
    raise notice 'Tipo de industria_roteiros.versao inesperado (%); default não alterado.', v_typ::text;
  end if;
end $$;

-- -------------------------------------------------------------------
-- Industria roteiros etapas: colunas e view canônica
-- -------------------------------------------------------------------
alter table public.industria_roteiros_etapas add column if not exists nome text;
alter table public.industria_roteiros_etapas add column if not exists descricao text;
alter table public.industria_roteiros_etapas add column if not exists tempo_setup numeric(15,4) default 0;
alter table public.industria_roteiros_etapas add column if not exists tempo_operacao numeric(15,4) default 0;
alter table public.industria_roteiros_etapas alter column sequencia set default 1;

alter table public.industria_roteiros_etapas enable row level security;
drop policy if exists "Enable all access" on public.industria_roteiros_etapas;
create policy "Enable all access" on public.industria_roteiros_etapas
  for all to public using (empresa_id = current_empresa_id());

drop view if exists public.industria_roteiro_etapas;
create view public.industria_roteiro_etapas as
select
  id,
  empresa_id,
  roteiro_id,
  sequencia,
  nome,
  centro_trabalho_id,
  descricao,
  tempo_setup,
  tempo_operacao,
  created_at,
  updated_at
from public.industria_roteiros_etapas;

comment on view public.industria_roteiro_etapas
  is 'Compat layer: mirror of industria_roteiros_etapas para funções legadas (colunas canônicas).';

-- Trigger de auditoria (alguns PROD antigos ficaram sem esse trigger em tabelas financeiras)
do $$
begin
  if to_regclass('public.financeiro_contas_pagar') is not null
     and to_regprocedure('public.process_audit_log()') is not null
     and not exists (
       select 1
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = 'financeiro_contas_pagar'
         and t.tgname = 'audit_logs_trigger'
         and not t.tgisinternal
     ) then
    execute 'create trigger audit_logs_trigger after insert or update or delete on public.financeiro_contas_pagar for each row execute function public.process_audit_log()';
  end if;
end $$;

-- -------------------------------------------------------------------
-- Colunas/defaults mínimas para produção (alinha com DEV)
-- -------------------------------------------------------------------
-- estoque_movimentos
alter table public.estoque_movimentos add column if not exists saldo_atual numeric(15,4);
alter table public.estoque_movimentos add column if not exists custo_medio numeric(15,4) default 0;
alter table public.estoque_movimentos add column if not exists origem text;
alter table public.estoque_movimentos add column if not exists data_movimento date default current_date;

-- industria_centros_trabalho
alter table public.industria_centros_trabalho add column if not exists custo_hora numeric(15,4) default 0;

-- industria_producao_componentes
alter table public.industria_producao_componentes alter column unidade set default 'un';

-- industria_producao_entregas
alter table public.industria_producao_entregas alter column quantidade_entregue set default 0;

-- industria_producao_ordens
alter table public.industria_producao_ordens alter column quantidade_planejada set default 0;
alter table public.industria_producao_ordens alter column unidade set default 'un';

-- produto_imagens
alter table public.produto_imagens alter column empresa_id set default current_empresa_id();
alter table public.produto_imagens add column if not exists position integer;
alter table public.produto_imagens alter column position set default 0;

-- pessoas
alter table public.pessoas add column if not exists deleted_at timestamptz;
alter table public.pessoas alter column empresa_id set default current_empresa_id();
alter table public.pessoas alter column tipo set default 'cliente'::public.pessoa_tipo;

commit;
