-- Alias compatível para função legado que ainda referencia
-- public.industria_roteiro_etapas (sem o "s").

BEGIN;

DROP VIEW IF EXISTS public.industria_roteiro_etapas;

CREATE VIEW public.industria_roteiro_etapas AS
SELECT *
  FROM public.industria_roteiros_etapas;

COMMENT ON VIEW public.industria_roteiro_etapas
    IS 'Compat layer: mirror of industria_roteiros_etapas para funções legadas.';

COMMIT;
