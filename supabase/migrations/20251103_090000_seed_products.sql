/*
  ## Query Description
  Adiciona um índice UNIQUE e duas RPCs de seed para produtos:
  - seed_products_for_current_user(): insere 10 produtos na empresa do usuário atual (JWT).
  - seed_products_for_empresa(p_empresa_id): variante admin para rodar no SQL editor (service_role).

  Idempotente: usa UPSERT por (empresa_id, sku).

  ## Metadata
  - Schema-Category: ["Data", "Structural"]
  - Impact-Level: ["Low"]
  - Requires-Backup: [false]
  - Reversible: [true] (basta deletar os 10 SKUs PROD-001..010 por empresa)

  ## Structure Details
  - Adiciona índice UNIQUE em (empresa_id, sku) para garantir a idempotência.
  - Usa tabela existente public.produtos.
  - Insere 10 linhas com dados padrão.

  ## Security Implications
  - RLS permanece ativo.
  - RPCs são SECURITY DEFINER com search_path fixo.
  - Versão admin só é executável por service_role.

  ## Performance Impact
  - Criação de um índice. Inserção pequena (10 linhas). Sem impacto de performance.
*/

-- Garantir UNIQUE idempotente para ON CONFLICT
create unique index if not exists idx_produtos_empresa_id_sku_not_null
on public.produtos (empresa_id, sku)
where sku is not null;

-- Helper interno: realiza upsert para um empresa_id informado
create or replace function public._seed_products_for_empresa(p_empresa_id uuid)
returns setof public.produtos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_empresa_id is null then
    raise exception '[SEED][PRODUTOS] empresa_id nulo' using errcode='22004';
  end if;

  insert into public.produtos (
    empresa_id, nome, sku, preco_venda, unidade, status, tipo, icms_origem, controla_estoque
  )
  values
    (p_empresa_id, 'Camiseta Algodão Pima', 'PROD-001', 89.90, 'un', 'ativo', 'simples', 0, true),
    (p_empresa_id, 'Calça Jeans Slim', 'PROD-002', 189.90, 'un', 'ativo', 'simples', 0, true),
    (p_empresa_id, 'Tênis de Corrida Leve', 'PROD-003', 299.50, 'un', 'ativo', 'simples', 0, true),
    (p_empresa_id, 'Mochila Urbana Impermeável', 'PROD-004', 150.00, 'un', 'ativo', 'simples', 0, true),
    (p_empresa_id, 'Garrafa Térmica Inox 500ml', 'PROD-005', 75.00, 'un', 'ativo', 'simples', 0, true),
    (p_empresa_id, 'Fone de Ouvido Bluetooth TWS', 'PROD-006', 250.00, 'un', 'ativo', 'simples', 0, true),
    (p_empresa_id, 'Mouse Sem Fio Ergonômico', 'PROD-007', 120.00, 'un', 'ativo', 'simples', 0, true),
    (p_empresa_id, 'Teclado Mecânico Compacto', 'PROD-008', 350.00, 'un', 'ativo', 'simples', 0, true),
    (p_empresa_id, 'Monitor 24" Full HD', 'PROD-009', 899.90, 'un', 'ativo', 'simples', 0, true),
    (p_empresa_id, 'Cadeira de Escritório Ergonômica', 'PROD-010', 999.00, 'un', 'ativo', 'simples', 0, true)
  on conflict (empresa_id, sku) where sku is not null
  do update set
    nome             = excluded.nome,
    preco_venda      = excluded.preco_venda,
    unidade          = excluded.unidade,
    status           = excluded.status,
    updated_at       = now();

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

-- Versão ADMIN: seed por empresa_id (utilizar no SQL editor, sem JWT)
create or replace function public.seed_products_for_empresa(p_empresa_id uuid)
returns setof public.produtos
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select * from public._seed_products_for_empresa(p_empresa_id)
$$;

revoke all on function public.seed_products_for_empresa(uuid) from public;
grant execute on function public.seed_products_for_empresa(uuid) to service_role;

-- Versão USER: seed na empresa do usuário atual (JWT necessário)
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
