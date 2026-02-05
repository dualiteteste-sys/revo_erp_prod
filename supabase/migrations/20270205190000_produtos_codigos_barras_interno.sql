/*
  PRODUTOS: Códigos de barras (interno) + suporte a variações

  Objetivo (UX):
  - Permitir informar um código existente
  - Gerar um "código interno" (1 clique) para estoque/PDV
  - Preview/Impressão fica no frontend
  - Unicidade por empresa (multi-tenant)

  Regras:
  - "Código interno" (gerado) = CODE128 (uso interno)
  - EAN-13: suportado apenas para validação/entrada (não geramos EAN aqui)
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- Tabela: produtos_codigos_barras
-- - produto_id: quando não há variações, é o próprio produto
-- - quando há variações:
--   - produto_id = produto pai
--   - variante_id = produto filho (override opcional)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.produtos_codigos_barras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL DEFAULT public.current_empresa_id() REFERENCES public.empresas(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  variante_id uuid NULL REFERENCES public.produtos(id) ON DELETE CASCADE,

  barcode_type text NOT NULL CHECK (barcode_type IN ('CODE128', 'EAN13')),
  barcode_value text NOT NULL,
  is_internal boolean NOT NULL DEFAULT true,

  generated_at timestamptz NULL,
  generated_by uuid NULL DEFAULT auth.uid(),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_produtos_codigos_barras_value_nonempty CHECK (NULLIF(btrim(barcode_value), '') IS NOT NULL),
  CONSTRAINT ck_produtos_codigos_barras_value_no_whitespace CHECK (barcode_value !~ '\\s'),
  CONSTRAINT ck_produtos_codigos_barras_variant_diff CHECK (variante_id IS NULL OR variante_id <> produto_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_produtos_codigos_barras_empresa_value
  ON public.produtos_codigos_barras (empresa_id, barcode_value);

CREATE UNIQUE INDEX IF NOT EXISTS ux_produtos_codigos_barras_empresa_produto_pai
  ON public.produtos_codigos_barras (empresa_id, produto_id)
  WHERE (variante_id IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS ux_produtos_codigos_barras_empresa_variante
  ON public.produtos_codigos_barras (empresa_id, variante_id)
  WHERE (variante_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_produtos_codigos_barras_empresa_produto
  ON public.produtos_codigos_barras (empresa_id, produto_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_produtos_codigos_barras_empresa_variante
  ON public.produtos_codigos_barras (empresa_id, variante_id, updated_at DESC);

ALTER TABLE public.produtos_codigos_barras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos_codigos_barras FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS produtos_codigos_barras_all_company_members ON public.produtos_codigos_barras;
CREATE POLICY produtos_codigos_barras_all_company_members
  ON public.produtos_codigos_barras
  FOR ALL
  TO authenticated
  USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP TRIGGER IF EXISTS tg_produtos_codigos_barras_updated ON public.produtos_codigos_barras;
CREATE TRIGGER tg_produtos_codigos_barras_updated
  BEFORE UPDATE ON public.produtos_codigos_barras
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

REVOKE ALL ON TABLE public.produtos_codigos_barras FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.produtos_codigos_barras TO service_role;

-- -----------------------------------------------------------------------------
-- Helpers: EAN-13 checksum (validação/entrada)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._ean13_check_digit(p_12_digits text)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text := COALESCE(p_12_digits, '');
  sum_odd int := 0;
  sum_even int := 0;
  i int;
  d int;
BEGIN
  IF s !~ '^[0-9]{12}$' THEN
    RETURN NULL;
  END IF;

  FOR i IN 1..12 LOOP
    d := substring(s from i for 1)::int;
    IF (i % 2) = 1 THEN
      sum_odd := sum_odd + d;
    ELSE
      sum_even := sum_even + d;
    END IF;
  END LOOP;

  RETURN (10 - ((sum_odd + (sum_even * 3)) % 10)) % 10;
END;
$$;

CREATE OR REPLACE FUNCTION public._ean13_is_valid(p_ean13 text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text := NULLIF(btrim(COALESCE(p_ean13, '')), '');
  expected int;
  got int;
BEGIN
  IF s IS NULL OR s !~ '^[0-9]{13}$' THEN
    RETURN FALSE;
  END IF;

  expected := public._ean13_check_digit(substring(s from 1 for 12));
  got := substring(s from 13 for 1)::int;
  RETURN expected IS NOT NULL AND expected = got;
END;
$$;

-- -----------------------------------------------------------------------------
-- RPCs: get/list/upsert/clear/generate internal
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.produtos_codigo_barras_get_for_current_user(
  p_produto_id uuid,
  p_variante_id uuid DEFAULT NULL
)
RETURNS TABLE (
  barcode_type text,
  barcode_value text,
  is_internal boolean,
  produto_id uuid,
  variante_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;
  IF p_produto_id IS NULL THEN
    RAISE EXCEPTION 'p_produto_id é obrigatório.' USING errcode='22023';
  END IF;

  PERFORM public.require_permission_for_current_user('produtos','view');

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

    RETURN QUERY
    SELECT b.barcode_type, b.barcode_value, b.is_internal, b.produto_id, b.variante_id
    FROM public.produtos_codigos_barras b
    WHERE b.empresa_id = v_empresa
      AND b.produto_id = p_produto_id
      AND b.variante_id = p_variante_id
    LIMIT 1;

    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT b.barcode_type, b.barcode_value, b.is_internal, b.produto_id, b.variante_id
  FROM public.produtos_codigos_barras b
  WHERE b.empresa_id = v_empresa
    AND b.produto_id = p_produto_id
    AND b.variante_id IS NULL
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.produtos_codigo_barras_get_for_current_user(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.produtos_codigo_barras_get_for_current_user(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.produtos_codigo_barras_list_for_current_user(
  p_produto_pai_id uuid
)
RETURNS TABLE (
  variante_id uuid,
  own_barcode_type text,
  own_barcode_value text,
  inherited_barcode_type text,
  inherited_barcode_value text,
  effective_barcode_type text,
  effective_barcode_value text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_parent public.produtos_codigos_barras;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;
  IF p_produto_pai_id IS NULL THEN
    RAISE EXCEPTION 'p_produto_pai_id é obrigatório.' USING errcode='22023';
  END IF;

  PERFORM public.require_permission_for_current_user('produtos','view');

  SELECT b.*
  INTO v_parent
  FROM public.produtos_codigos_barras b
  WHERE b.empresa_id = v_empresa
    AND b.produto_id = p_produto_pai_id
    AND b.variante_id IS NULL
  LIMIT 1;

  RETURN QUERY
  SELECT
    v.id AS variante_id,
    own.barcode_type AS own_barcode_type,
    own.barcode_value AS own_barcode_value,
    v_parent.barcode_type AS inherited_barcode_type,
    v_parent.barcode_value AS inherited_barcode_value,
    COALESCE(own.barcode_type, v_parent.barcode_type) AS effective_barcode_type,
    COALESCE(own.barcode_value, v_parent.barcode_value) AS effective_barcode_value
  FROM public.produtos v
  LEFT JOIN public.produtos_codigos_barras own
    ON own.empresa_id = v_empresa
   AND own.produto_id = p_produto_pai_id
   AND own.variante_id = v.id
  WHERE v.empresa_id = v_empresa
    AND v.produto_pai_id = p_produto_pai_id
  ORDER BY v.nome ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.produtos_codigo_barras_list_for_current_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.produtos_codigo_barras_list_for_current_user(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.produtos_codigo_barras_upsert_for_current_user(
  p_produto_id uuid,
  p_variante_id uuid DEFAULT NULL,
  p_barcode_type text DEFAULT 'CODE128',
  p_barcode_value text DEFAULT NULL
)
RETURNS public.produtos_codigos_barras
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
  v_type text := upper(NULLIF(btrim(COALESCE(p_barcode_type, '')), ''));
  v_value text := NULLIF(btrim(COALESCE(p_barcode_value, '')), '');
  v_is_internal boolean;
  v_row public.produtos_codigos_barras;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa ativa.' USING errcode='42501';
  END IF;
  IF p_produto_id IS NULL THEN
    RAISE EXCEPTION 'p_produto_id é obrigatório.' USING errcode='22023';
  END IF;
  IF v_value IS NULL THEN
    RAISE EXCEPTION 'Código de barras é obrigatório.' USING errcode='22023';
  END IF;
  IF v_value ~ '\\s' THEN
    RAISE EXCEPTION 'Código de barras não pode conter espaços.' USING errcode='22023';
  END IF;
  IF v_type NOT IN ('CODE128','EAN13') THEN
    RAISE EXCEPTION 'Tipo de código inválido.' USING errcode='22023';
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

  IF v_type = 'EAN13' AND NOT public._ean13_is_valid(v_value) THEN
    RAISE EXCEPTION 'EAN-13 inválido (checksum).' USING errcode='22023';
  END IF;

  v_is_internal := (v_type = 'CODE128');

  IF p_variante_id IS NULL THEN
    INSERT INTO public.produtos_codigos_barras (
      empresa_id,
      produto_id,
      variante_id,
      barcode_type,
      barcode_value,
      is_internal,
      generated_at,
      generated_by
    )
    VALUES (
      v_empresa,
      p_produto_id,
      NULL,
      v_type,
      v_value,
      v_is_internal,
      NULL,
      auth.uid()
    )
    ON CONFLICT (empresa_id, produto_id) WHERE (variante_id IS NULL)
    DO UPDATE SET
      barcode_type = EXCLUDED.barcode_type,
      barcode_value = EXCLUDED.barcode_value,
      is_internal = EXCLUDED.is_internal,
      generated_at = NULL,
      generated_by = auth.uid(),
      updated_at = now()
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.produtos_codigos_barras (
      empresa_id,
      produto_id,
      variante_id,
      barcode_type,
      barcode_value,
      is_internal,
      generated_at,
      generated_by
    )
    VALUES (
      v_empresa,
      p_produto_id,
      p_variante_id,
      v_type,
      v_value,
      v_is_internal,
      NULL,
      auth.uid()
    )
    ON CONFLICT (empresa_id, variante_id) WHERE (variante_id IS NOT NULL)
    DO UPDATE SET
      barcode_type = EXCLUDED.barcode_type,
      barcode_value = EXCLUDED.barcode_value,
      is_internal = EXCLUDED.is_internal,
      generated_at = NULL,
      generated_by = auth.uid(),
      updated_at = now()
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.produtos_codigo_barras_upsert_for_current_user(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.produtos_codigo_barras_upsert_for_current_user(uuid, uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.produtos_codigo_barras_clear_for_current_user(
  p_produto_id uuid,
  p_variante_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa uuid := public.current_empresa_id();
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

    DELETE FROM public.produtos_codigos_barras b
    WHERE b.empresa_id = v_empresa
      AND b.produto_id = p_produto_id
      AND b.variante_id = p_variante_id;
    RETURN;
  END IF;

  DELETE FROM public.produtos_codigos_barras b
  WHERE b.empresa_id = v_empresa
    AND b.produto_id = p_produto_id
    AND b.variante_id IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.produtos_codigo_barras_clear_for_current_user(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.produtos_codigo_barras_clear_for_current_user(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.produtos_codigo_barras_generate_internal_for_current_user(
  p_produto_id uuid,
  p_variante_id uuid DEFAULT NULL
)
RETURNS public.produtos_codigos_barras
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
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

COMMIT;

