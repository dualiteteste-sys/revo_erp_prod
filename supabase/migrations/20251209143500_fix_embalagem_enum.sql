-- Fix Enum Value for Pacote
ALTER TYPE public.tipo_embalagem_registry ADD VALUE IF NOT EXISTS 'pacote';

-- Ensure columns exist (in case previous migration failed partially)
ALTER TABLE public.embalagens 
ADD COLUMN IF NOT EXISTS codigo_interno text,
ADD COLUMN IF NOT EXISTS unidade_base text,
ADD COLUMN IF NOT EXISTS capacidade_embalagem numeric;

-- Re-apply comments just in case
COMMENT ON COLUMN public.embalagens.codigo_interno IS 'Código interno de identificação da embalagem';
COMMENT ON COLUMN public.embalagens.unidade_base IS 'Unidade de medida base (ex: KG, L, UN)';
COMMENT ON COLUMN public.embalagens.capacidade_embalagem IS 'Capacidade total da embalagem na unidade base';
