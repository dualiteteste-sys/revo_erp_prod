-- Seed additional default units of measure (system-wide)
-- Goal: ship ~30 commonly used units and avoid manual typing across the app.

INSERT INTO public.unidades_medida (sigla, descricao, empresa_id)
VALUES
  ('PC',  'Peça',        NULL),
  ('MG',  'Miligrama',   NULL),
  ('KM',  'Quilômetro',  NULL),
  ('H',   'Hora',        NULL),
  ('MIN', 'Minuto',      NULL),
  ('DIA', 'Dia',         NULL),
  ('MES', 'Mês',         NULL),
  ('ANO', 'Ano',         NULL),
  ('FD',  'Fardo',       NULL),
  ('SAC', 'Saco',        NULL),
  ('FR',  'Frasco',      NULL),
  ('GL',  'Galão',       NULL),
  ('KIT', 'Kit',         NULL)
ON CONFLICT (empresa_id, sigla) DO NOTHING;

