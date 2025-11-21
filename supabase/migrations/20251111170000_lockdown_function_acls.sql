-- [SECURITY] Endurecimento de ACLs de funções (restringe EXECUTE a roles necessárias)
-- Padrão: somente 'authenticated' (e service_role/postgres quando aplicável)

-- 1) Trancar função existente (RPC de delete)
revoke execute on function public.delete_product_for_current_user(uuid) from public;
revoke execute on function public.delete_product_for_current_user(uuid) from anon;

-- Conceder apenas aos papéis necessários
grant execute on function public.delete_product_for_current_user(uuid) to authenticated;
grant execute on function public.delete_product_for_current_user(uuid) to service_role;
grant execute on function public.delete_product_for_current_user(uuid) to postgres;

-- 2) Definir DEFAULT PRIVILEGES para futuras funções do owner (geralmente 'postgres')
-- Observação: DEFAULT PRIVILEGES são por "dono" (grantor). Ajuste aqui se o owner real for outro.
alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

alter default privileges for role postgres in schema public grant execute on functions to authenticated;
alter default privileges for role postgres in schema public grant execute on functions to service_role;
alter default privileges for role postgres in schema public grant execute on functions to postgres;
