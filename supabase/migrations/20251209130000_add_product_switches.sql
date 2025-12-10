ALTER TABLE public.produtos
ADD COLUMN pode_comprar boolean NOT NULL DEFAULT false,
ADD COLUMN pode_vender boolean NOT NULL DEFAULT false,
ADD COLUMN pode_produzir boolean NOT NULL DEFAULT false,
ADD COLUMN rastreio_lote boolean NOT NULL DEFAULT false,
ADD COLUMN rastreio_serial boolean NOT NULL DEFAULT false;
