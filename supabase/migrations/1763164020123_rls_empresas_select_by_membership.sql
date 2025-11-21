/*
# [RLS] Empresas: leitura restrita por vínculo

## O que faz:
- Ativa RLS em public.empresas.
- Concede SELECT para authenticated/service_role (controle fino via policy).
- Policy: permite SELECT apenas se existir vínculo em public.empresa_usuarios
  entre a empresa e o usuário autenticado.

## Segurança:
- Mantém isolamento multi-tenant: usuário só enxerga suas empresas.
- Não libera INSERT/UPDATE/DELETE.

## Compatibilidade:
- Atende AuthProvider.refreshEmpresas e onboarding.
*/

begin;

-- 1) Habilitar RLS (idempotente)
alter table public.empresas enable row level security;

-- 2) Garantir GRANT de leitura (controle final via policy)
grant select on table public.empresas to authenticated, service_role;

-- 3) (Re)criar policy de SELECT por vínculo
drop policy if exists "empresas_select_by_membership" on public.empresas;

create policy "empresas_select_by_membership"
on public.empresas
for select
using (
  exists (
    select 1
    from public.empresa_usuarios eu
    where eu.empresa_id = public.empresas.id
      and eu.user_id = auth.uid()
  )
);

commit;
