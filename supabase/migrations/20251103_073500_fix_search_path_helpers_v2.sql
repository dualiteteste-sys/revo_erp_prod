-- 20251103_073500_fix_search_path_helpers_v2.sql
-- Corrige search_path fixo nas helpers e evita erro 42P13 com DROP/CREATE
-- Logs: [DB][HELPERS]

/*
  ## Query Description
  - Recria com search_path fixo (pg_catalog, public) as funções:
    * public.months_from(int) -> int[] (IMMUTABLE)
    * public.str_tokenize(text) -> text[] (IMMUTABLE)
    * public.os_calc_item_total(numeric,numeric,numeric) -> numeric (STABLE)
  - Para os_calc_item_total, usa DROP FUNCTION IF EXISTS antes do CREATE
    para evitar "cannot change name of input parameter".

  ## Segurança
  - search_path fixo (pg_catalog, public).

  ## Compatibilidade
  - Assinaturas inalteradas. Para os_calc_item_total, parâmetros nomeados
    como na versão anterior: (p_qty numeric, p_price numeric, p_discount_pct numeric).

  ## Performance
  - Neutro (funções baratas).
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

-- 3) os_calc_item_total(numeric,numeric,numeric) -> numeric  (STABLE)
-- Evita 42P13: drop explícito da assinatura antes de criar
drop function if exists public.os_calc_item_total(numeric, numeric, numeric);

create function public.os_calc_item_total(
  p_qty numeric,
  p_price numeric,
  p_discount_pct numeric
)
returns numeric
language sql
stable
set search_path = pg_catalog, public
as $$
  select round( greatest(coalesce(p_qty,1), 0.0001) * coalesce(p_price,0) * (1 - coalesce(p_discount_pct,0)/100.0), 2 );
$$;
