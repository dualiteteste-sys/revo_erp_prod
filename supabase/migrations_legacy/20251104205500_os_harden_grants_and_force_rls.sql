-- 20251104_2055_os_harden_grants_and_force_rls.sql
-- Endurece privilégios nas tabelas de Ordem de Serviço e força RLS
-- Logs: [DB][OS][GRANTS][RLS]

-- ============================================================================
-- 1) Forçar RLS (além de enabled) nas tabelas nucleares
-- ============================================================================
alter table if exists public.ordem_servicos       force row level security;
alter table if exists public.ordem_servico_itens  force row level security;

-- ============================================================================
-- 2) Revogar DML direto de anon/authenticated (idempotente)
--    Mantemos o fluxo exclusivamente via RPCs (SECURITY DEFINER).
-- ============================================================================
-- Ordem de Serviço (cabeçalho)
revoke insert, update, delete, truncate, trigger, references on table public.ordem_servicos from anon;
revoke insert, update, delete, truncate, trigger, references on table public.ordem_servicos from authenticated;

-- Itens de Ordem de Serviço
revoke insert, update, delete, truncate, trigger, references on table public.ordem_servico_itens from anon;
revoke insert, update, delete, truncate, trigger, references on table public.ordem_servico_itens from authenticated;

-- ============================================================================
-- 3) (Recomendado) Remover SELECT direto também para uniformizar o acesso
--    Caso seu front JÁ consuma via RPCs (get/list), mantenha sem SELECT direto.
--    Se ainda houver tela legada lendo direto, comente temporariamente estas linhas.
-- ============================================================================
revoke select on table public.ordem_servicos       from anon, authenticated;
revoke select on table public.ordem_servico_itens  from anon, authenticated;

-- ============================================================================
-- 4) Garantir que as RPCs de OS estejam executáveis por 'authenticated' e
--    NÃO por 'anon' (idempotente). Ajuste a lista conforme suas funções.
-- ============================================================================
do $$
declare
  fn text;
  fns text[] := array[
    'create_os_for_current_user(jsonb)',
    'get_os_by_id_for_current_user(uuid)',
    'list_os_for_current_user(text,status_os[],integer,integer,text,text)',
    'list_os_items_for_current_user(uuid)',
    'add_os_item_for_current_user(uuid,jsonb)',
    'add_product_item_to_os_for_current_user(uuid,uuid,numeric,numeric,boolean)',
    'add_service_item_to_os_for_current_user(uuid,uuid,numeric,numeric,boolean)',
    'update_os_for_current_user(uuid,jsonb)',
    'update_os_item_for_current_user(uuid,jsonb)',
    'delete_os_item_for_current_user(uuid)',
    'delete_os_for_current_user(uuid)',
    'os_set_status_for_current_user(uuid,status_os,jsonb)',
    'os_generate_parcels_for_current_user(uuid,text,numeric,date)',
    'list_os_parcels_for_current_user(uuid)'
  ];
begin
  foreach fn in array fns loop
    begin
      execute format('grant execute on function public.%s to authenticated;', fn);
      execute format('revoke execute on function public.%s from anon;', fn);
    exception when undefined_function then
      -- ignora funções que não existirem neste ambiente
      null;
    end;
  end loop;
end$$;

-- ============================================================================
-- 5) Sanity checks (apenas leitura; rode à parte se quiser confirmar)
-- ============================================================================
-- select relname, relrowsecurity, relforcerowsecurity
-- from pg_class c join pg_namespace n on n.oid=c.relnamespace
-- where n.nspname='public' and relname in ('ordem_servicos','ordem_servico_itens');
--
-- select grantee, table_name, privilege_type
-- from information_schema.role_table_grants
-- where table_schema='public' and table_name in ('ordem_servicos','ordem_servico_itens')
-- order by table_name, grantee, privilege_type;
