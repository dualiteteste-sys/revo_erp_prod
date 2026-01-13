-- =============================================================================
-- Seed: aliases de unidades de medida (compatibilidade com planilhas / ERPs legados)
-- Objetivo: garantir que siglas comuns no Brasil apareçam no cadastro de produtos
-- (e em imports) mesmo quando diferem dos defaults iniciais.
-- =============================================================================

BEGIN;

INSERT INTO public.unidades_medida (sigla, descricao, empresa_id)
VALUES
  ('UNID', 'Unidade', NULL),
  ('LT', 'Litro', NULL),
  ('TOL', 'Tonelada', NULL),
  ('PACOTE', 'Pacote', NULL),
  ('MILHEI', 'Milheiro', NULL)
ON CONFLICT (empresa_id, sigla) DO NOTHING;

COMMIT;

