CREATE OR REPLACE FUNCTION public.industria_bom_delete(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_empresa_id uuid;
BEGIN
  -- Segurança: Verificar usuário
  v_empresa_id := public.get_empresa_id_by_user(auth.uid());
  
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada ou usuário sem permissão.';
  END IF;

  -- Verificar se a BOM pertence à empresa
  IF NOT EXISTS (
      SELECT 1 FROM public.industria_boms
      WHERE id = p_id AND empresa_id = v_empresa_id
  ) THEN
    RAISE EXCEPTION 'Ficha técnica não encontrada ou não pertence a esta empresa.';
  END IF;

  -- Excluir (cascade excluirá componentes)
  DELETE FROM public.industria_boms
  WHERE id = p_id AND empresa_id = v_empresa_id;

END;
$function$;
