-- 1. Alter Enum Type (Postgres doesn't support IF NOT EXISTS for enum values directly in a clean way, 
-- but we can use ALTER TYPE ... ADD VALUE IF NOT EXISTS)
ALTER TYPE public.tipo_embalagem_registry ADD VALUE IF NOT EXISTS 'pacote';

-- 2. Add New Columns
ALTER TABLE public.embalagens 
ADD COLUMN IF NOT EXISTS codigo_interno text,
ADD COLUMN IF NOT EXISTS unidade_base text,
ADD COLUMN IF NOT EXISTS capacidade_embalagem numeric;

-- 3. Comments for documentation
COMMENT ON COLUMN public.embalagens.codigo_interno IS 'Código interno de identificação da embalagem';
COMMENT ON COLUMN public.embalagens.unidade_base IS 'Unidade de medida base (ex: KG, L, UN)';
COMMENT ON COLUMN public.embalagens.capacidade_embalagem IS 'Capacidade total da embalagem na unidade base';
