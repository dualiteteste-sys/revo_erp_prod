-- 20251103_084500_os_items_triggers.sql
-- Corrige cálculo de itens e recálculo de totais da O.S.
-- Logs: [DB][OS][ITEMS][TRG] [OS][TOTALS]

/*
  ## Query Description: Installs Triggers for OS Item Totals
  This migration creates/recreates the necessary trigger functions and triggers on the `ordem_servico_itens` table to automatically calculate item totals and recalculate the grand totals in the `ordem_servicos` header table. This ensures data consistency after any INSERT, UPDATE, or DELETE operation on OS items.

  ## Metadata:
  - Schema-Category: "Structural"
  - Impact-Level: "Low"
  - Requires-Backup: false
  - Reversible: true (DROP TRIGGER...; DROP FUNCTION...)

  ## Structure Details:
  - Functions Created/Modified:
    - public.tg_os_item_total_and_recalc()
    - public.tg_os_item_after_recalc()
  - Triggers Created:
    - tg_os_item_before (BEFORE INSERT OR UPDATE)
    - tg_os_item_after_ins (AFTER INSERT)
    - tg_os_item_after_upd (AFTER UPDATE)
    - tg_os_item_after_del (AFTER DELETE)

  ## Security Implications:
  - RLS Status: Not directly affected. The `os_recalc_totals` helper function already respects RLS.
  - Policy Changes: No
  - Auth Requirements: Operations are performed by triggers, inheriting the permissions of the user performing the DML.

  ## Performance Impact:
  - Indexes: None
  - Triggers: Added. AFTER triggers will fire once per row modification, causing a recalculation on the parent OS. The cost is proportional to the number of items in the specific OS being modified.
  - Estimated Impact: Low, as it's scoped to a single OS per operation.
*/

-- 1) (Re)cria BEFORE trigger para calcular total da linha com a helper existente
--    Garante que a função tg_os_item_total_and_recalc tem search_path fixo.
create or replace function public.tg_os_item_total_and_recalc()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- calcula o total do item (quantidade * preço * (1 - desconto))
  new.total := public.os_calc_item_total(new.quantidade, new.preco, new.desconto_pct);
  return new;
end;
$$;

drop trigger if exists tg_os_item_before on public.ordem_servico_itens;
create trigger tg_os_item_before
before insert or update on public.ordem_servico_itens
for each row
execute function public.tg_os_item_total_and_recalc();

-- 2) Função AFTER para recálculo de totais do cabeçalho (INSERT/UPDATE/DELETE)
create or replace function public.tg_os_item_after_recalc()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
$$;

-- 3) AFTER triggers para manter totais coerentes
drop trigger if exists tg_os_item_after_ins on public.ordem_servico_itens;
drop trigger if exists tg_os_item_after_upd on public.ordem_servico_itens;
drop trigger if exists tg_os_item_after_del on public.ordem_servico_itens;

create trigger tg_os_item_after_ins
after insert on public.ordem_servico_itens
for each row
execute function public.tg_os_item_after_recalc();

create trigger tg_os_item_after_upd
after update on public.ordem_servico_itens
for each row
execute function public.tg_os_item_after_recalc();

create trigger tg_os_item_after_del
after delete on public.ordem_servico_itens
for each row
execute function public.tg_os_item_after_recalc();
