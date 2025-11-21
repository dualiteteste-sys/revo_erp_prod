-- 20251104_1930_os_fix_compat_triggers.sql
-- Corrige compatibilidade de nomes e racionaliza triggers de O.S.
-- Logs: [DB][OS][COMPAT] [OS][TRIGGER] [RPC]

/*
  Segurança
  - search_path fixo nas funções.
  - Mantém escopo multi-tenant (os_recalc_totals já valida empresa via current_empresa_id()).

  Compatibilidade
  - Não altera assinaturas existentes (usa helpers já presentes).
  - Apenas cria/ajusta triggers idempotentes na tabela public.ordem_servico_itens.

  Reversibilidade
  - DROP TRIGGER ...; DROP FUNCTION public.tg_os_item_after_recalc();

  Performance
  - AFTER triggers recalculam totais uma vez por DML; custo proporcional ao nº de itens da O.S.
*/

-- ============================================================================
-- 0) Pré-requisitos: funções utilitárias (existentes)
--    current_user_id() / current_empresa_id() já estão corretas com SECURITY DEFINER.
-- ============================================================================

-- ============================================================================
-- 1) Compatibilidade de colunas via GENERATED (aliases)
--    - ordem_servico_itens: valor_unitario -> preco ; desconto -> desconto_pct ; os_id -> ordem_servico_id
--    - ordem_servicos: total_descontos -> desconto_valor
--    Observação:
--      - São colunas geradas STORED (somente leitura). Se o front tentar inserir nesses aliases,
--        o Postgres recusará (isso é desejado). Para escrita, use RPCs que populam as colunas reais.
-- ============================================================================

do $$
begin
  -- ordem_servico_itens.valor_unitario (se não existir)
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ordem_servico_itens' and column_name='valor_unitario'
  ) then
    execute $sql$
      alter table public.ordem_servico_itens
        add column valor_unitario numeric generated always as (preco) stored
    $sql$;
    raise notice '[DB][OS][COMPAT] coluna alias public.ordem_servico_itens.valor_unitario criada';
  end if;

  -- ordem_servico_itens.desconto (se não existir)
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ordem_servico_itens' and column_name='desconto'
  ) then
    execute $sql$
      alter table public.ordem_servico_itens
        add column desconto numeric generated always as (desconto_pct) stored
    $sql$;
    raise notice '[DB][OS][COMPAT] coluna alias public.ordem_servico_itens.desconto criada';
  end if;

  -- ordem_servico_itens.os_id (se não existir)
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ordem_servico_itens' and column_name='os_id'
  ) then
    execute $sql$
      alter table public.ordem_servico_itens
        add column os_id uuid generated always as (ordem_servico_id) stored
    $sql$;
    raise notice '[DB][OS][COMPAT] coluna alias public.ordem_servico_itens.os_id criada';
  end if;

  -- ordem_servicos.total_descontos (se não existir)
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ordem_servicos' and column_name='total_descontos'
  ) then
    execute $sql$
      alter table public.ordem_servicos
        add column total_descontos numeric generated always as (desconto_valor) stored
    $sql$;
    raise notice '[DB][OS][COMPAT] coluna alias public.ordem_servicos.total_descontos criada';
  end if;
end$$;

-- ============================================================================
-- 2) Função de cálculo de item (garantir DEFINER e search_path padrão)
--    - Mantém assinatura e lógica existentes; apenas reforça o contrato.
-- ============================================================================
create or replace function public.tg_os_item_total_and_recalc()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $fn$
begin
  -- calcula o total do item (quantidade * preco * (1 - desconto_pct))
  new.total := public.os_calc_item_total(new.quantidade, new.preco, new.desconto_pct);
  return new;
end;
$fn$;

comment on function public.tg_os_item_total_and_recalc()
  is '[DB][OS][TRIGGER] BEFORE: calcula total do item com base em preco/desconto_pct';

-- AFTER: recálculo de totais da O.S. inteira (já existente, só reforçando search_path e DEFINER)
create or replace function public.tg_os_item_after_recalc()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $fn$
declare
  v_os_id uuid;
begin
  if (tg_op = 'DELETE') then
    v_os_id := old.ordem_servico_id;
  else
    v_os_id := new.ordem_servico_id;
  end if;

  perform public.os_recalc_totals(v_os_id);
  return null;
end;
$fn$;

comment on function public.tg_os_item_after_recalc()
  is '[DB][OS][TRIGGER] AFTER: recálculo de totais no cabeçalho da O.S.';

-- ============================================================================
-- 3) Triggers: padronizar para evitar duplicidade de recálculo
--    - BEFORE: 1 trigger (cálculo do total do item)
--    - AFTER:  1 trigger (recalcular totais do cabeçalho)
-- ============================================================================
do $$
begin
  -- DROP dos triggers redundantes, se existirem
  if exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='ordem_servico_itens' and t.tgname='tg_os_item_after_ins') then
    execute 'drop trigger tg_os_item_after_ins on public.ordem_servico_itens';
  end if;
  if exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='ordem_servico_itens' and t.tgname='tg_os_item_after_upd') then
    execute 'drop trigger tg_os_item_after_upd on public.ordem_servico_itens';
  end if;
  if exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='ordem_servico_itens' and t.tgname='tg_os_item_after_del') then
    execute 'drop trigger tg_os_item_after_del on public.ordem_servico_itens';
  end if;

  -- Mantemos somente:
  -- BEFORE (calc total) - preferir nome estável "tg_os_item_before"
  if exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='ordem_servico_itens' and t.tgname='tg_os_item_calc_total') then
    execute 'drop trigger tg_os_item_calc_total on public.ordem_servico_itens';
  end if;

  -- (re)cria BEFORE único
  if exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='ordem_servico_itens' and t.tgname='tg_os_item_before') then
    execute 'drop trigger tg_os_item_before on public.ordem_servico_itens';
  end if;
  execute $sql$
    create trigger tg_os_item_before
    before insert or update on public.ordem_servico_itens
    for each row
    execute function public.tg_os_item_total_and_recalc()
  $sql$;

  -- AFTER único (INSERT/UPDATE/DELETE)
  if exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='ordem_servico_itens' and t.tgname='tg_os_item_after_change') then
    execute 'drop trigger tg_os_item_after_change on public.ordem_servico_itens';
  end if;

  execute $sql$
    create trigger tg_os_item_after_change
    after insert or update or delete on public.ordem_servico_itens
    for each row
    execute function public.tg_os_item_after_recalc()
  $sql$;

  raise notice '[DB][OS][TRIGGER] triggers normalizados: BEFORE=calc_total ; AFTER=recalc_totais';
end$$;

-- ============================================================================
-- 4) Observação de Grants
--    As funções de trigger não precisam de GRANT explícito para roles comuns;
--    RPCs de negócio já possuem GRANT EXECUTE ao role "authenticated".
-- ============================================================================

-- ============================================================================
-- 5) Validações rápidas (somente leitura)
-- ============================================================================
-- Totais nos itens devem seguir a fórmula padronizada
-- select id, quantidade, preco, desconto_pct, total from public.ordem_servico_itens order by created_at desc limit 50;

-- Checagem de aliases presentes
-- select valor_unitario, desconto, os_id from public.ordem_servico_itens limit 1;
-- select total_descontos from public.ordem_servicos limit 1;

-- Consistência itens x cabeçalho (usar nomes reais)
-- with itens as (
--   select ordem_servico_id, sum(coalesce(quantidade,0)*coalesce(preco,0) * (1 - coalesce(desconto_pct,0))) as soma_itens
--   from public.ordem_servico_itens
--   group by ordem_servico_id
-- )
-- select os.id as os_id, os.total_itens, os.total_geral, i.soma_itens as soma_itens_calc
-- from public.ordem_servicos os
-- left join itens i on i.ordem_servico_id = os.id
-- order by os.created_at desc
-- limit 50;
