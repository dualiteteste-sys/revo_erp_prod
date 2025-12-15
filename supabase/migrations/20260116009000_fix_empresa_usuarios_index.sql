-- Garante que o índice único padrão exista em public.empresa_usuarios (id).
-- Alguns ambientes antigos ficaram sem o índice explícito.

begin;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'empresa_usuarios'
      and indexname = 'empresa_usuarios_pkey'
  ) then
    execute 'create unique index empresa_usuarios_pkey on public.empresa_usuarios(id)';
  end if;
end $$;

commit;

