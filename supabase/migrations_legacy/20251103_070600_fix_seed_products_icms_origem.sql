-- 20251103_070600_fix_seed_products_icms_origem.sql
-- Fix: Adiciona icms_origem à seed de produtos
-- Logs: [SEED] [PRODUTOS]

/*
  ## Query Description
  - Corrige a função `_seed_products_for_empresa` para incluir o campo `icms_origem` (NOT NULL).
  - Define o valor padrão `0` (Nacional) para os produtos de exemplo.
  - Mantém a idempotência e as regras de segurança da versão anterior.

  ## Segurança
  - Nenhuma alteração. A função continua SECURITY DEFINER com search_path fixo.

  ## Compatibilidade
  - Corrige a incompatibilidade com o schema da tabela `produtos` que exige `icms_origem`.
*/

-- Helper interna: upsert para uma empresa (CORRIGIDA)
create or replace function public._seed_products_for_empresa(p_empresa_id uuid)
returns setof public.produtos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_has_tipo boolean;
begin
  if p_empresa_id is null then
    raise exception '[SEED][PRODUTOS] empresa_id nulo' using errcode='22004';
  end if;

  -- Detecta se a coluna 'tipo' existe e é do tipo enum 'public.tipo_produto'
  select exists(
    select 1
    from information_schema.columns c
    join pg_type t on t.typname = 'tipo_produto'
    where c.table_schema = 'public' and c.table_name = 'produtos' and c.column_name = 'tipo'
  ) into v_has_tipo;

  -- Payload base com icms_origem
  with payload(sku, nome, preco, unidade, status, icms_origem) as (
    values
      ('PROD-001','Camiseta Algodão Pima',           89.90, 'UN', 'ativo', 0),
      ('PROD-002','Calça Jeans Slim',               189.90, 'UN', 'ativo', 0),
      ('PROD-003','Tênis de Corrida Leve',         299.50, 'UN', 'ativo', 0),
      ('PROD-004','Mochila Urbana Impermeável',    150.00, 'UN', 'ativo', 0),
      ('PROD-005','Garrafa Térmica Inox 500ml',     75.00, 'UN', 'ativo', 0),
      ('PROD-006','Fone Bluetooth TWS',            250.00, 'UN', 'ativo', 0),
      ('PROD-007','Mouse Sem Fio Ergonômico',      120.00, 'UN', 'ativo', 0),
      ('PROD-008','Teclado Mecânico Compacto',     350.00, 'UN', 'ativo', 0),
      ('PROD-009','Monitor 24" Full HD',           899.90, 'UN', 'ativo', 0),
      ('PROD-010','Cadeira Escritório Ergonômica', 999.00, 'UN', 'ativo', 0)
  )
  -- Inserção com enum casts explícitos e icms_origem
  insert into public.produtos (
    empresa_id, nome, sku, preco_venda, unidade, status, icms_origem
  )
  select
    p_empresa_id,
    p.nome,
    p.sku,
    p.preco,
    p.unidade,
    (p.status)::public.status_produto,
    p.icms_origem
  from payload p
  on conflict (empresa_id, sku) where sku is not null
  do update set
    nome        = excluded.nome,
    preco_venda = excluded.preco_venda,
    unidade     = excluded.unidade,
    status      = excluded.status,
    icms_origem = excluded.icms_origem, -- Adicionado
    updated_at  = now();

  -- Caso exista 'tipo' (enum public.tipo_produto) e aceite 'simples', ajuste em lote idempotente
  if v_has_tipo then
    update public.produtos
       set tipo = 'simples'::public.tipo_produto,
           updated_at = now()
     where empresa_id = p_empresa_id
       and sku in ('PROD-001','PROD-002','PROD-003','PROD-004','PROD-005','PROD-006','PROD-007','PROD-008','PROD-009','PROD-010')
       and (tipo is null or tipo <> 'simples'::public.tipo_produto);
  end if;

  perform pg_notify('app_log', '[SEED] [PRODUTOS] upsert concluído para empresa ' || p_empresa_id::text);

  return query
    select s.*
    from public.produtos s
    where s.empresa_id = p_empresa_id
      and s.sku in ('PROD-001','PROD-002','PROD-003','PROD-004','PROD-005','PROD-006','PROD-007','PROD-008','PROD-009','PROD-010')
    order by s.sku;
end;
$$;

revoke all on function public._seed_products_for_empresa(uuid) from public;
grant execute on function public._seed_products_for_empresa(uuid) to service_role;

-- Versão ADMIN
create or replace function public.seed_products_for_empresa(p_empresa_id uuid)
returns setof public.produtos
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select * from public._seed_products_for_empresa(p_empresa_id);
$$;

revoke all on function public.seed_products_for_empresa(uuid) from public;
grant execute on function public.seed_products_for_empresa(uuid) to service_role;

-- Versão USER
create or replace function public.seed_products_for_current_user()
returns setof public.produtos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
begin
  if v_emp is null then
    raise exception '[SEED][PRODUTOS] empresa_id inválido para a sessão' using errcode='42501';
  end if;

  return query select * from public._seed_products_for_empresa(v_emp);
end;
$$;

revoke all on function public.seed_products_for_current_user() from public;
grant execute on function public.seed_products_for_current_user() to authenticated;
grant execute on function public.seed_products_for_current_user() to service_role;
