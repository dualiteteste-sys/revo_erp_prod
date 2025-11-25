-- fix_industria_benef_ordens_fk_material_cliente.sql
-- Remove FK incorreto para produtos e garante FK correto para industria_materiais_cliente

set search_path = pg_catalog, public;

-- 1) Remover o FK errado, se existir
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'ind_benef_ordens_prod_mat_fkey'
      and conrelid = 'public.industria_benef_ordens'::regclass
  ) then
    alter table public.industria_benef_ordens
      drop constraint ind_benef_ordens_prod_mat_fkey;
  end if;
end;
$$;

-- 2) Garantir que o FK correto exista
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ind_benef_ordens_matcli_fkey'
      and conrelid = 'public.industria_benef_ordens'::regclass
  ) then
    alter table public.industria_benef_ordens
      add constraint ind_benef_ordens_matcli_fkey
      foreign key (produto_material_cliente_id)
      references public.industria_materiais_cliente(id);
  end if;
end;
$$;

-- 3) Reload do cache do PostgREST (exposição imediata do schema atualizado)
notify pgrst, 'reload schema';
