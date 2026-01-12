/*
  Indústria: enforcement de OB (beneficiamento) no banco

  Objetivo:
  - Garantir que ordens de tipo 'beneficiamento' não sejam gravadas sem:
    - cliente_id
    - material_cliente_id
    - usa_material_cliente = true

  Observação:
  - Usamos CHECK constraints com NOT VALID para não falhar em ambientes que já tenham
    dados históricos inconsistentes (mas passam a valer para novos inserts/updates).
*/

begin;

do $$
begin
  if to_regclass('public.industria_ordens') is null then
    return;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ck_ind_ordens_benef_cliente_required') then
    alter table public.industria_ordens
      add constraint ck_ind_ordens_benef_cliente_required
      check (tipo_ordem <> 'beneficiamento' or cliente_id is not null)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ck_ind_ordens_benef_material_required') then
    alter table public.industria_ordens
      add constraint ck_ind_ordens_benef_material_required
      check (tipo_ordem <> 'beneficiamento' or material_cliente_id is not null)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ck_ind_ordens_benef_usa_material_required') then
    alter table public.industria_ordens
      add constraint ck_ind_ordens_benef_usa_material_required
      check (tipo_ordem <> 'beneficiamento' or coalesce(usa_material_cliente, false) = true)
      not valid;
  end if;
end $$;

commit;

