-- =========================================================
-- Patch Permissões RPCs Beneficiamento (robusto a sobrecargas)
-- - Corrige erro "function name ... is not unique" no REVOKE/GRANT
-- - Aplica REVOKE/GRANT dinamicamente para todas as sobrecargas
-- - Garante GRANT explícito na assinatura atual das funções
-- Segurança: apenas ACLs; não altera código das RPCs
-- Reversibilidade: basta reexecutar GRANTs desejados
-- =========================================================

set search_path = pg_catalog, public;

-- 1) REVOKE dinâmico para TODAS as sobrecargas destes nomes
do $$
declare
  r record;
begin
  for r in
    select
      n.nspname                          as schema_name,
      p.proname                          as func_name,
      p.oid                              as func_oid,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'industria_benef_list_ordens',
        'industria_benef_update_status',
        'industria_benef_manage_componente',
        'industria_benef_manage_entrega'
      )
  loop
    execute format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC',
                   r.schema_name, r.func_name, r.args);
    -- Opcional: também remover grants antigos de roles padrão
    execute format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM authenticated, service_role',
                   r.schema_name, r.func_name, r.args);
  end loop;
end $$;

-- 2) GRANT explícito nas assinaturas ATUAIS das RPCs (ajuste se assinaturas mudarem)
--    industria_benef_list_ordens(p_search text, p_status text, p_limit int, p_offset int)
grant execute on function public.industria_benef_list_ordens(text, text, int, int)
  to authenticated, service_role;

--    industria_benef_update_status(p_id uuid, p_status text, p_prioridade int)
grant execute on function public.industria_benef_update_status(uuid, text, int)
  to authenticated, service_role;

--    industria_benef_manage_componente(p_ordem_id uuid, p_componente_id uuid, p_produto_id uuid,
--                                      p_quantidade_planejada numeric, p_unidade text, p_action text)
grant execute on function public.industria_benef_manage_componente(
  uuid, uuid, uuid, numeric, text, text
) to authenticated, service_role;

--    industria_benef_manage_entrega(p_ordem_id uuid, p_entrega_id uuid, p_data_entrega date,
--                                   p_quantidade_entregue numeric, p_status_faturamento text,
--                                   p_documento_entrega text, p_documento_faturamento text,
--                                   p_observacoes text, p_action text)
grant execute on function public.industria_benef_manage_entrega(
  uuid, uuid, date, numeric, text, text, text, text, text
) to authenticated, service_role;

-- 3) (Opcional) Se houver sobrecargas legadas que você deseja remover, descomente os DROPs abaixo
-- drop function if exists public.industria_benef_list_ordens();
-- drop function if exists public.industria_benef_list_ordens(text, text);

-- 4) Reload do schema cache do PostgREST
notify pgrst, 'reload schema';
