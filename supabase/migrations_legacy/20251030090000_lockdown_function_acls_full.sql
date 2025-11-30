-- Crie… endurecimento de ACLs de funções no schema public
-- Objetivo: remover EXECUTE de anon/public e re-conceder por grupo (cliente, helper RLS, serviço)
-- Padrão de segurança: search_path já normalizado para pg_catalog, public nas funções

-------------------------
-- 0) Utilitário: revoga EXECUTE de TODAS as funções do schema public (idempotente)
-------------------------
do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name,
           p.proname as func_name,
           pg_get_function_identity_arguments(p.oid) as func_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke execute on function %I.%I(%s) from public', r.schema_name, r.func_name, r.func_args);
    execute format('revoke execute on function %I.%I(%s) from anon',   r.schema_name, r.func_name, r.func_args);
  end loop;
end
$$ language plpgsql;

-------------------------
-- 1) Grupo CLIENTE (UI) — RPCs expostas à aplicação logada
--    Concede EXECUTE para authenticated (+ service_role, postgres)
-------------------------
grant execute on function public.create_product_for_current_user(payload jsonb)             to authenticated, service_role, postgres;
grant execute on function public.update_product_for_current_user(p_id uuid, patch jsonb)    to authenticated, service_role, postgres;
grant execute on function public.delete_product_for_current_user(p_id uuid)                 to authenticated, service_role, postgres;
grant execute on function public.produtos_list_for_current_user()                           to authenticated, service_role, postgres;
grant execute on function public.set_principal_product_image(p_produto_id uuid, p_imagem_id uuid) to authenticated, service_role, postgres;
grant execute on function public.validate_fiscais(ncm_in text, cest_in text)                to authenticated, service_role, postgres;
-- grant execute on function public.list_members_of_company(p_empresa uuid)                    to authenticated, service_role, postgres; -- NOTE: Function does not exist
-- grant execute on function public.whoami()                                                   to authenticated, service_role, postgres; -- NOTE: Function does not exist
-- grant execute on function public.plan_from_price(p_price_id text)                           to authenticated, service_role, postgres; -- NOTE: Function does not exist
-- grant execute on function public.create_empresa_and_link_owner(p_razao_social text, p_fantasia text, p_cnpj text) to authenticated, service_role, postgres; -- NOTE: Function does not exist
grant execute on function public.provision_empresa_for_current_user(p_razao_social text, p_fantasia text, p_email text) to authenticated, service_role, postgres;

-------------------------
-- 2) Grupo HELPERS de RLS/identidade — usados em políticas/checagens
--    Precisam EXECUTE para authenticated (para que as políticas executem sob o usuário)
-------------------------
grant execute on function public.current_user_id()                                         to authenticated, service_role, postgres;
grant execute on function public.current_empresa_id()                                      to authenticated, service_role, postgres;
grant execute on function public.is_user_member_of(p_empresa_id uuid)                      to authenticated, service_role, postgres;
-- grant execute on function public.is_admin_of_empresa(p_empresa_id uuid)                    to authenticated, service_role, postgres; -- NOTE: Function does not exist
grant execute on function public.enforce_same_empresa_produto_ou_fornecedor()              to authenticated, service_role, postgres;

-------------------------
-- 3) Grupo SERVIÇO (apenas backend/owner) — NÃO expor à authenticated
--    Webhooks/triggers/rotinas internas
-------------------------
-- grant execute on function public.handle_new_user()                                         to service_role, postgres; -- NOTE: Function does not exist
-- grant execute on function public.handle_products_updated_at()                              to service_role, postgres; -- NOTE: Function does not exist
grant execute on function public.tg_set_updated_at()                                       to service_role, postgres;
-- grant execute on function public.touch_updated_at()                                        to service_role, postgres; -- NOTE: Function does not exist
grant execute on function public.purge_legacy_products(p_empresa_id uuid, p_dry_run boolean, p_note text) to service_role, postgres;
grant execute on function public.delete_product_image_db(p_image_id uuid)                  to service_role, postgres;
-- grant execute on function public.upsert_subscription(
--   p_empresa_id uuid,
--   p_status public.sub_status,
--   p_current_period_end timestamptz,
--   p_price_id text,
--   p_sub_id text,
--   p_plan_slug text,
--   p_billing_cycle public.billing_cycle,
--   p_cancel_at_period_end boolean
-- ) to service_role, postgres; -- NOTE: Types sub_status and billing_cycle do not exist

-------------------------
-- 4) DEFAULT PRIVILEGES — novas funções não ganham EXECUTE em PUBLIC/anon
-------------------------
-- Ajuste 'postgres' caso o owner das funções seja outro role no seu projeto
alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

alter default privileges for role postgres in schema public grant execute on functions to authenticated;
alter default privileges for role postgres in schema public grant execute on functions to service_role;
alter default privileges for role postgres in schema public grant execute on functions to postgres;
