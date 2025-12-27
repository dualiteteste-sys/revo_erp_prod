/*
  RBAC: normalizar papéis extras (FINANCE/OPS/READONLY)

  Problema:
  - O frontend usa `roleAtLeast()` (owner/admin/member/viewer) para travas rápidas de UI.
  - Papéis extras (FINANCE, OPS) devem se comportar como "member" e READONLY como "viewer".
  - A função `public.current_empresa_role()` depende de `normalize_empresa_role()` para esse mapeamento.

  Objetivo (CFG-03):
  - Garantir que perfis Member/Viewer funcionem corretamente mesmo com papéis especializados.
*/

BEGIN;

create or replace function public.normalize_empresa_role(p_role text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(p_role, ''))
    when 'owner' then 'owner'
    when 'dono' then 'owner'
    when 'admin' then 'admin'
    when 'administrador' then 'admin'
    when 'member' then 'member'
    when 'membro' then 'member'
    when 'ops' then 'member'
    when 'operador' then 'member'
    when 'finance' then 'member'
    when 'financeiro' then 'member'
    when 'readonly' then 'viewer'
    when 'read_only' then 'viewer'
    when 'read-only' then 'viewer'
    when 'viewer' then 'viewer'
    when 'leitura' then 'viewer'
    else null
  end;
$$;

revoke all on function public.normalize_empresa_role(text) from public, anon;
grant execute on function public.normalize_empresa_role(text) to authenticated, service_role, postgres;

select pg_notify('pgrst','reload schema');

COMMIT;

