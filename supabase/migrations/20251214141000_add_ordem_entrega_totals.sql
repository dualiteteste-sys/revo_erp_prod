-- Ensure industria_producao_ordens tracks entregas acumuladas
BEGIN;

ALTER TABLE public.industria_producao_ordens
    ADD COLUMN IF NOT EXISTS total_entregue numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS percentual_concluido numeric DEFAULT 0;

UPDATE public.industria_producao_ordens o
SET total_entregue = COALESCE(e.total_entregue, 0),
    percentual_concluido = CASE
        WHEN COALESCE(o.quantidade_planejada, 0) = 0 THEN 0
        ELSE LEAST(100, (COALESCE(e.total_entregue, 0) / NULLIF(o.quantidade_planejada, 0)) * 100)
    END
FROM (
    SELECT ordem_id, SUM(quantidade_entregue) AS total_entregue
    FROM public.industria_producao_entregas
    GROUP BY ordem_id
) e
WHERE o.id = e.ordem_id;

UPDATE public.industria_producao_ordens
SET total_entregue = COALESCE(total_entregue, 0),
    percentual_concluido = COALESCE(percentual_concluido, 0);

ALTER TABLE public.industria_producao_ordens
    ALTER COLUMN total_entregue SET DEFAULT 0,
    ALTER COLUMN total_entregue SET NOT NULL,
    ALTER COLUMN percentual_concluido SET DEFAULT 0,
    ALTER COLUMN percentual_concluido SET NOT NULL;

COMMIT;
