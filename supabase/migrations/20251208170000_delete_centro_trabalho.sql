CREATE OR REPLACE FUNCTION public.industria_centros_trabalho_delete(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  delete from public.industria_centros_trabalho
  where id = p_id
    and empresa_id = v_empresa_id;

  if not found then
    raise exception 'Centro de trabalho não encontrado ou acesso negado.';
  end if;
end;
$function$;
