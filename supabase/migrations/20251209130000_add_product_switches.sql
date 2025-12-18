ALTER TABLE public.produtos
ADD COLUMN IF NOT EXISTS pode_comprar boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS pode_vender boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS pode_produzir boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS rastreio_lote boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS rastreio_serial boolean NOT NULL DEFAULT false;
