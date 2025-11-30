/*
  # Fix Conferir Logic (Upsert vs Sum)
  
  ## Description
  Fixes the issue where updating a count would sum with the previous value instead of replacing it.
  
  1. Removes duplicate conference records for the same user/item (keeping the latest).
  2. Adds a UNIQUE constraint on (recebimento_item_id, usuario_id).
  3. Updates `conferir_item_recebimento` to use INSERT ... ON CONFLICT DO UPDATE.
*/

-- 1. Clean up duplicates (keep the one with the highest ID, assuming UUID v7 or just arbitrary since we want unique)
-- Actually, let's keep the most recent one based on created_at if possible, or just one of them.
-- Since we are fixing logic, deleting duplicates is necessary to apply the constraint.
delete from public.recebimento_conferencias a
using public.recebimento_conferencias b
where a.id < b.id
  and a.recebimento_item_id = b.recebimento_item_id
  and a.usuario_id = b.usuario_id;

-- 2. Add Unique Constraint
alter table public.recebimento_conferencias
  add constraint recebimento_conf_unique unique (recebimento_item_id, usuario_id);

-- 3. Update RPC to use Upsert
create or replace function public.conferir_item_recebimento(
  p_recebimento_item_id uuid,
  p_quantidade numeric
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_total numeric;
begin
  -- Upsert conference record (Replace value for this user)
  insert into public.recebimento_conferencias (
    empresa_id, recebimento_item_id, quantidade_contada, usuario_id
  ) values (
    v_emp, p_recebimento_item_id, p_quantidade, public.current_user_id()
  )
  on conflict (recebimento_item_id, usuario_id)
  do update set
    quantidade_contada = excluded.quantidade_contada,
    created_at = now();

  -- Update total checked in item (Sum of all users' counts)
  select sum(quantidade_contada) into v_total
  from public.recebimento_conferencias
  where recebimento_item_id = p_recebimento_item_id;

  update public.recebimento_itens
  set quantidade_conferida = coalesce(v_total, 0),
      updated_at = now()
  where id = p_recebimento_item_id
    and empresa_id = v_emp;
    
  -- Update status of item
  update public.recebimento_itens
  set status = case 
      when quantidade_conferida >= quantidade_xml then 'ok'
      else 'divergente' -- Changed from 'pendente' to 'divergente' if not OK, to be more explicit
    end
  where id = p_recebimento_item_id
    and empresa_id = v_emp;
end;
$$;
