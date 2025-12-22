-- Fix: exclusão de OP falhava por FK legado em `public.qualidade_inspecoes` (sem ON DELETE CASCADE).
-- - Ajusta FK para cascade (quando existir).
-- - Torna `industria_producao_ordens_delete__unsafe` mais resiliente em ambientes que ainda têm esse legado.

BEGIN;

-- -----------------------------------------------------------------------------
-- FK legado: qualidade_inspecoes.ordem_id -> industria_producao_ordens.id (cascade)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  c record;
BEGIN
  IF to_regclass('public.qualidade_inspecoes') IS NULL THEN
    RETURN;
  END IF;

  -- Drop any existing FK(s) pointing to industria_producao_ordens
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.qualidade_inspecoes'::regclass
       AND contype = 'f'
       AND confrelid = 'public.industria_producao_ordens'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.qualidade_inspecoes DROP CONSTRAINT %I', c.conname);
  END LOOP;

  -- Recreate with ON DELETE CASCADE
  EXECUTE $sql$
    ALTER TABLE public.qualidade_inspecoes
      ADD CONSTRAINT qualidade_inspecoes_ordem_id_fkey
      FOREIGN KEY (ordem_id)
      REFERENCES public.industria_producao_ordens(id)
      ON DELETE CASCADE
  $sql$;
END $$;

-- -----------------------------------------------------------------------------
-- OP delete: best-effort cleanup do legado `qualidade_inspecoes` antes de excluir
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.industria_producao_ordens_delete__unsafe(uuid)') IS NOT NULL THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_producao_ordens_delete__unsafe(p_id uuid)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      DECLARE
        v_empresa_id uuid := public.current_empresa_id();
        v_status text;
        v_deleted int := 0;
      BEGIN
        SELECT status
          INTO v_status
          FROM public.industria_producao_ordens
         WHERE id = p_id
           AND empresa_id = v_empresa_id;

        IF v_status IS NULL THEN
          RAISE EXCEPTION 'Ordem não encontrada ou acesso negado.';
        END IF;

        IF v_status <> 'rascunho' THEN
          RAISE EXCEPTION 'Somente ordens em rascunho podem ser excluídas.';
        END IF;

        IF EXISTS (
          SELECT 1
            FROM public.industria_producao_operacoes
           WHERE ordem_id = p_id AND empresa_id = v_empresa_id
        ) THEN
          RAISE EXCEPTION 'Não é possível excluir: a ordem já possui operações.';
        END IF;

        IF to_regclass('public.industria_producao_entregas') IS NOT NULL AND EXISTS (
          SELECT 1
            FROM public.industria_producao_entregas
           WHERE ordem_id = p_id AND empresa_id = v_empresa_id
        ) THEN
          RAISE EXCEPTION 'Não é possível excluir: a ordem já possui entregas.';
        END IF;

        -- Legado: caso exista tabela antiga sem cascade, limpamos explicitamente.
        IF to_regclass('public.qualidade_inspecoes') IS NOT NULL THEN
          DELETE FROM public.qualidade_inspecoes
           WHERE ordem_id = p_id AND empresa_id = v_empresa_id;
        END IF;

        DELETE FROM public.industria_producao_ordens
         WHERE id = p_id AND empresa_id = v_empresa_id;

        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        IF v_deleted <> 1 THEN
          RAISE EXCEPTION 'Exclusão não realizada (ordem preservada por integridade/permissão).';
        END IF;
      END;
      $body$;
    $sql$;

    EXECUTE 'REVOKE ALL ON FUNCTION public.industria_producao_ordens_delete__unsafe(uuid) FROM public, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_ordens_delete__unsafe(uuid) TO service_role, postgres';
  ELSE
    -- Ambiente sem RBAC wrappers: atualiza a função "normal".
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.industria_producao_ordens_delete(p_id uuid)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      DECLARE
        v_empresa_id uuid := public.current_empresa_id();
        v_status text;
        v_deleted int := 0;
      BEGIN
        SELECT status
          INTO v_status
          FROM public.industria_producao_ordens
         WHERE id = p_id
           AND empresa_id = v_empresa_id;

        IF v_status IS NULL THEN
          RAISE EXCEPTION 'Ordem não encontrada ou acesso negado.';
        END IF;

        IF v_status <> 'rascunho' THEN
          RAISE EXCEPTION 'Somente ordens em rascunho podem ser excluídas.';
        END IF;

        IF EXISTS (
          SELECT 1
            FROM public.industria_producao_operacoes
           WHERE ordem_id = p_id AND empresa_id = v_empresa_id
        ) THEN
          RAISE EXCEPTION 'Não é possível excluir: a ordem já possui operações.';
        END IF;

        IF to_regclass('public.industria_producao_entregas') IS NOT NULL AND EXISTS (
          SELECT 1
            FROM public.industria_producao_entregas
           WHERE ordem_id = p_id AND empresa_id = v_empresa_id
        ) THEN
          RAISE EXCEPTION 'Não é possível excluir: a ordem já possui entregas.';
        END IF;

        IF to_regclass('public.qualidade_inspecoes') IS NOT NULL THEN
          DELETE FROM public.qualidade_inspecoes
           WHERE ordem_id = p_id AND empresa_id = v_empresa_id;
        END IF;

        DELETE FROM public.industria_producao_ordens
         WHERE id = p_id AND empresa_id = v_empresa_id;

        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        IF v_deleted <> 1 THEN
          RAISE EXCEPTION 'Exclusão não realizada (ordem preservada por integridade/permissão).';
        END IF;
      END;
      $body$;
    $sql$;

    EXECUTE 'GRANT EXECUTE ON FUNCTION public.industria_producao_ordens_delete(uuid) TO authenticated, service_role';
  END IF;
END $$;

COMMIT;

