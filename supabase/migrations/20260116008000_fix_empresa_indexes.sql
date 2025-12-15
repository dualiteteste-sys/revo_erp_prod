-- Garante índices únicos padrão em empresa_addons e empresa_usuarios
-- (faltavam em alguns ambientes antigos).

begin;

create unique index if not exists empresa_addons_pkey
  on public.empresa_addons(id);

create unique index if not exists empresa_usuarios_pkey
  on public.empresa_usuarios(id);

commit;

