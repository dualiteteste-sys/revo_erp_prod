-- No-op (compat): esta migração existiu para sincronizar `empresa_usuarios.role`, mas o schema remoto possui
-- CHECK constraint em `empresa_usuarios.role` com valores que variam por ambiente.
-- A resolução de permissão é feita via `useEmpresaRole()` (join em roles) + `current_empresa_role()` no banco.

BEGIN;

COMMIT;
