/*
  FIX: gen_random_bytes(integer) não encontrado em RPCs com search_path restrito.

  Sintoma (PROD):
  - rpc:produtos_codigo_barras_generate_internal_for_current_user → 404 / 42883
    "function gen_random_bytes(integer) does not exist"

  Causa raiz:
  - Funções SECURITY DEFINER com `SET search_path = pg_catalog, public` não enxergam
    objetos no schema `extensions` (onde extensões podem viver no Supabase).

  Correção:
  - Garantir pgcrypto instalado.
  - Incluir `extensions` no search_path destas funções.
*/

BEGIN;

create extension if not exists pgcrypto;

CREATE OR REPLACE FUNCTION public.produtos_codigo_barras_generate_internal_for_current_user(
  p_produto_id uuid,
  p_variante_id uuid DEFAULT NULL
)
RETURNS public.produtos_codigos_barras
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_existing public.produtos_codigos_barras;
  v_attempt int := 0;
  v_value text;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;
  IF p_produto_id IS NULL THEN
    RAISE EXCEPTION 'p_produto_id é obrigatório.' USING errcode='22023';
  END IF;

  PERFORM public.require_permission_for_current_user('produtos','update');

  IF p_variante_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.produtos v
      WHERE v.id = p_variante_id
        AND v.empresa_id = v_empresa
        AND v.produto_pai_id = p_produto_id
    ) THEN
      RAISE EXCEPTION 'Variação inválida para este produto.' USING errcode='22023';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.produtos p WHERE p.id = p_produto_id AND p.empresa_id = v_empresa
    ) THEN
      RAISE EXCEPTION 'Produto inválido.' USING errcode='22023';
    END IF;
  END IF;

  SELECT b.*
  INTO v_existing
  FROM public.produtos_codigos_barras b
  WHERE b.empresa_id = v_empresa
    AND b.produto_id = p_produto_id
    AND (
      (p_variante_id IS NULL AND b.variante_id IS NULL)
      OR
      (p_variante_id IS NOT NULL AND b.variante_id = p_variante_id)
    )
  LIMIT 1;

  IF v_existing.id IS NOT NULL AND v_existing.barcode_type = 'CODE128' THEN
    RETURN v_existing;
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > 10 THEN
      RAISE EXCEPTION 'Falha ao gerar código interno (colisão). Tente novamente.' USING errcode='P0001';
    END IF;

    v_value := 'UL' || upper(substring(encode(gen_random_bytes(6), 'hex') from 1 for 12));

    BEGIN
      IF p_variante_id IS NULL THEN
        INSERT INTO public.produtos_codigos_barras (
          empresa_id, produto_id, variante_id,
          barcode_type, barcode_value, is_internal,
          generated_at, generated_by
        )
        VALUES (
          v_empresa, p_produto_id, NULL,
          'CODE128', v_value, TRUE,
          now(), auth.uid()
        )
        ON CONFLICT (empresa_id, produto_id) WHERE (variante_id IS NULL)
        DO UPDATE SET
          barcode_type = 'CODE128',
          barcode_value = EXCLUDED.barcode_value,
          is_internal = TRUE,
          generated_at = now(),
          generated_by = auth.uid(),
          updated_at = now()
        RETURNING * INTO v_existing;
      ELSE
        INSERT INTO public.produtos_codigos_barras (
          empresa_id, produto_id, variante_id,
          barcode_type, barcode_value, is_internal,
          generated_at, generated_by
        )
        VALUES (
          v_empresa, p_produto_id, p_variante_id,
          'CODE128', v_value, TRUE,
          now(), auth.uid()
        )
        ON CONFLICT (empresa_id, variante_id) WHERE (variante_id IS NOT NULL)
        DO UPDATE SET
          barcode_type = 'CODE128',
          barcode_value = EXCLUDED.barcode_value,
          is_internal = TRUE,
          generated_at = now(),
          generated_by = auth.uid(),
          updated_at = now()
        RETURNING * INTO v_existing;
      END IF;

      RETURN v_existing;
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.produtos_codigo_barras_generate_internal_for_current_user(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.produtos_codigo_barras_generate_internal_for_current_user(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ecommerce_oauth_create_state(p_provider text, p_redirect_to text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_user uuid := auth.uid();
  v_provider text := lower(coalesce(p_provider,''));
  v_redirect text := coalesce(nullif(trim(p_redirect_to),''), '/app/configuracoes/ecommerce/marketplaces');
  v_ecommerce public.ecommerces;
  v_state text;
begin
  perform public.require_permission_for_current_user('ecommerce','manage');

  if v_empresa is null or v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if v_provider not in ('meli','shopee') then
    raise exception 'provider inválido' using errcode = '22023';
  end if;

  select * into v_ecommerce
  from public.ecommerces
  where empresa_id = v_empresa and provider = v_provider
  limit 1;

  if v_ecommerce.id is null then
    insert into public.ecommerces (empresa_id, nome, provider, status, config)
    values (
      v_empresa,
      case when v_provider = 'meli' then 'Mercado Livre' else 'Shopee' end,
      v_provider,
      'pending',
      '{}'::jsonb
    )
    returning * into v_ecommerce;
  end if;

  v_state := encode(gen_random_bytes(16), 'hex');

  insert into public.ecommerce_oauth_states(empresa_id, ecommerce_id, provider, user_id, state, redirect_to)
  values (v_empresa, v_ecommerce.id, v_provider, v_user, v_state, v_redirect);

  return jsonb_build_object(
    'provider', v_provider,
    'state', v_state,
    'redirect_to', v_redirect,
    'ecommerce_id', v_ecommerce.id
  );
end;
$$;

REVOKE ALL ON FUNCTION public.ecommerce_oauth_create_state(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ecommerce_oauth_create_state(text, text) TO authenticated, service_role;

select pg_notify('pgrst','reload schema');

COMMIT;

