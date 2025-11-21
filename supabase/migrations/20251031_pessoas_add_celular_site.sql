-- [SCHEMA DELTA] pessoas: adiciona celular e site (nullable, compatível)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='pessoas' and column_name='celular'
  ) then
    alter table public.pessoas add column celular text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='pessoas' and column_name='site'
  ) then
    alter table public.pessoas add column site text;
  end if;
end$$;

-- Opcional futuro: validar formatos via CHECK (comentado):
-- alter table public.pessoas add constraint ck_pessoas_site_url check (site ~ '^https?://');
-- alter table public.pessoas add constraint ck_pessoas_celular_fmt check (celular ~ '^[0-9()+\-\\s]{8,20}$');
