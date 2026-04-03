-- Hardening: adicionar guardas de permissão e stage-check ao update_os_item_for_current_user.
-- A RPC já existia (align_dev_schema) mas sem require_permission nem _os02_assert_can_edit_os.
-- Também adiciona updated_at = now().

CREATE OR REPLACE FUNCTION public.update_os_item_for_current_user(p_item_id uuid, payload jsonb)
RETURNS public.ordem_servico_itens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_emp uuid := public.current_empresa_id();
  v_os_id uuid;
  rec public.ordem_servico_itens;
BEGIN
  IF v_emp IS NULL THEN
    RAISE EXCEPTION '[RPC][OS_ITEM][UPDATE] empresa_id inválido' USING errcode='42501';
  END IF;

  -- Buscar OS para validação de permissão por estágio
  SELECT ordem_servico_id INTO v_os_id
  FROM public.ordem_servico_itens
  WHERE id = p_item_id AND empresa_id = v_emp;

  IF v_os_id IS NULL THEN
    RAISE EXCEPTION '[RPC][OS_ITEM][UPDATE] Item não encontrado' USING errcode='P0002';
  END IF;

  PERFORM public.require_permission_for_current_user('os', 'update');
  PERFORM public._os02_assert_can_edit_os(v_os_id);

  UPDATE public.ordem_servico_itens i
     SET quantidade   = COALESCE(NULLIF(payload->>'quantidade','')::numeric, i.quantidade),
         preco        = COALESCE(NULLIF(payload->>'preco','')::numeric, i.preco),
         desconto_pct = COALESCE(NULLIF(payload->>'desconto_pct','')::numeric, i.desconto_pct),
         orcar        = COALESCE(NULLIF(payload->>'orcar','')::boolean, i.orcar),
         updated_at   = now()
   WHERE i.id = p_item_id
     AND i.empresa_id = v_emp
  RETURNING * INTO rec;

  -- Triggers tg_os_item_before e tg_os_item_after_change recalculam total + OS totais automaticamente.
  RETURN rec;
END;
$$;
