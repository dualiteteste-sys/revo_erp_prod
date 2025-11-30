-- 20251103_073500_fix_search_path_helpers.sql
-- Fix: todas as helpers com search_path fixo
-- Logs: [DB][HELPERS]

/*
  ## Query Description
  Recria as funções apontadas pelo linter com `set search_path = pg_catalog, public`:
  - public.months_from(int) -> int[]
  - public.str_tokenize(text) -> text[]
  - public.os_calc_item_total(numeric, numeric, numeric) -> numeric

  ## Segurança
  - Define search_path fixo (pg_catalog, public) para evitar captura de objetos maliciosos no path.
  - Não altera permissões (helpers puras / STABLE/IMMUTABLE).

  ## Performance
  - Funções puras e baratas; sem impacto perceptível.

  ## Compatibilidade
  - Assinaturas preservadas (parâmetros e tipos). Lógica idêntica à já utilizada no código.
*/

-- 1) months_from(int) -> int[]  (IMMUTABLE)
create or replace function public.months_from(p_n int)
returns int[]
language sql
immutable
set search_path = pg_catalog, public
as $$
  select array_agg(g) from generate_series(0, greatest(p_n-1,0)) g;
$$;

-- 2) str_tokenize(text) -> text[]  (IMMUTABLE)
create or replace function public.str_tokenize(p_text text)
returns text[]
language sql
immutable
set search_path = pg_catalog, public
as $$
  select coalesce(
           regexp_split_to_array(
             regexp_replace(coalesce(p_text,''), '\s*,\s*', ' ', 'g'),
             '\s+'
           ),
           '{}'
         );
$$;

-- 3) os_calc_item_total(qtd numeric, preco numeric, desconto_pct numeric) -> numeric  (STABLE)
-- Mantém a regra usada nas RPCs: total = round( max(qtd, 0.0001)*preco * (1 - desconto%/100), 2 )
create or replace function public.os_calc_item_total(
  p_qtd numeric,
  p_preco numeric,
  p_desconto_pct numeric
)
returns numeric
language sql
stable
set search_path = pg_catalog, public
as $$
  select round( greatest(coalesce(p_qtd,1), 0.0001) * coalesce(p_preco,0) * (1 - coalesce(p_desconto_pct,0)/100.0), 2 );
$$;
