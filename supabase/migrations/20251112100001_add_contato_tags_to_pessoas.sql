-- [SCHEMA DELTA] pessoas: adiciona contato_tags (text[]) se não existir
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='pessoas'
      and column_name='contato_tags'
  ) then
    alter table public.pessoas
      add column contato_tags text[] null;
  end if;
end$$;
