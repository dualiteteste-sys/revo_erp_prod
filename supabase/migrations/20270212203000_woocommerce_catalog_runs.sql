BEGIN;

CREATE TABLE IF NOT EXISTS public.woocommerce_sync_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.integrations_woocommerce_store(id) ON DELETE CASCADE,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT woocommerce_sync_run_type_check CHECK (type IN ('EXPORT','IMPORT','SYNC_PRICE','SYNC_STOCK')),
  CONSTRAINT woocommerce_sync_run_status_check CHECK (status IN ('queued','running','done','error','partial','canceled'))
);

ALTER TABLE public.woocommerce_sync_run ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tg_woocommerce_sync_run_updated_at ON public.woocommerce_sync_run;
CREATE TRIGGER tg_woocommerce_sync_run_updated_at
BEFORE UPDATE ON public.woocommerce_sync_run
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP POLICY IF EXISTS woocommerce_sync_run_select ON public.woocommerce_sync_run;
CREATE POLICY woocommerce_sync_run_select
  ON public.woocommerce_sync_run
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    AND public.has_permission_for_current_user('ecommerce','view')
  );

DROP POLICY IF EXISTS woocommerce_sync_run_write_service_role ON public.woocommerce_sync_run;
CREATE POLICY woocommerce_sync_run_write_service_role
  ON public.woocommerce_sync_run
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON TABLE public.woocommerce_sync_run TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.woocommerce_sync_run TO service_role;

CREATE INDEX IF NOT EXISTS idx_woocommerce_sync_run_store_created
  ON public.woocommerce_sync_run (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_woocommerce_sync_run_store_status
  ON public.woocommerce_sync_run (store_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.woocommerce_sync_run_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.woocommerce_sync_run(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.integrations_woocommerce_store(id) ON DELETE CASCADE,
  sku text NULL,
  revo_product_id uuid NULL,
  woo_product_id bigint NULL,
  woo_variation_id bigint NULL,
  action text NOT NULL DEFAULT 'SKIP',
  status text NOT NULL DEFAULT 'QUEUED',
  error_code text NULL,
  hint text NULL,
  last_error text NULL,
  last_error_at timestamptz NULL,
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT woocommerce_sync_run_item_action_check CHECK (action IN ('CREATE','UPDATE','SKIP','BLOCK')),
  CONSTRAINT woocommerce_sync_run_item_status_check CHECK (status IN ('QUEUED','RUNNING','DONE','ERROR','DEAD','SKIPPED'))
);

ALTER TABLE public.woocommerce_sync_run_item ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tg_woocommerce_sync_run_item_updated_at ON public.woocommerce_sync_run_item;
CREATE TRIGGER tg_woocommerce_sync_run_item_updated_at
BEFORE UPDATE ON public.woocommerce_sync_run_item
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP POLICY IF EXISTS woocommerce_sync_run_item_select ON public.woocommerce_sync_run_item;
CREATE POLICY woocommerce_sync_run_item_select
  ON public.woocommerce_sync_run_item
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    AND public.has_permission_for_current_user('ecommerce','view')
  );

DROP POLICY IF EXISTS woocommerce_sync_run_item_write_service_role ON public.woocommerce_sync_run_item;
CREATE POLICY woocommerce_sync_run_item_write_service_role
  ON public.woocommerce_sync_run_item
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON TABLE public.woocommerce_sync_run_item TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.woocommerce_sync_run_item TO service_role;

CREATE INDEX IF NOT EXISTS idx_woocommerce_sync_run_item_run
  ON public.woocommerce_sync_run_item (run_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_woocommerce_sync_run_item_store_sku
  ON public.woocommerce_sync_run_item (store_id, sku);

CREATE TABLE IF NOT EXISTS public.woocommerce_listing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.integrations_woocommerce_store(id) ON DELETE CASCADE,
  revo_product_id uuid NOT NULL,
  sku text NULL,
  woo_product_id bigint NULL,
  woo_variation_id bigint NULL,
  listing_status text NOT NULL DEFAULT 'unlinked',
  last_sync_price_at timestamptz NULL,
  last_sync_stock_at timestamptz NULL,
  last_error_code text NULL,
  last_error_hint text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT woocommerce_listing_status_check CHECK (listing_status IN ('linked','unlinked','conflict','error')),
  CONSTRAINT woocommerce_listing_unique_store_product UNIQUE (store_id, revo_product_id)
);

ALTER TABLE public.woocommerce_listing ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tg_woocommerce_listing_updated_at ON public.woocommerce_listing;
CREATE TRIGGER tg_woocommerce_listing_updated_at
BEFORE UPDATE ON public.woocommerce_listing
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP POLICY IF EXISTS woocommerce_listing_select ON public.woocommerce_listing;
CREATE POLICY woocommerce_listing_select
  ON public.woocommerce_listing
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    AND public.has_permission_for_current_user('ecommerce','view')
  );

DROP POLICY IF EXISTS woocommerce_listing_write_service_role ON public.woocommerce_listing;
CREATE POLICY woocommerce_listing_write_service_role
  ON public.woocommerce_listing
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON TABLE public.woocommerce_listing TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.woocommerce_listing TO service_role;

CREATE INDEX IF NOT EXISTS idx_woocommerce_listing_store_status
  ON public.woocommerce_listing (store_id, listing_status, updated_at DESC);

ALTER TABLE public.woocommerce_sync_job
  ADD COLUMN IF NOT EXISTS run_id uuid NULL REFERENCES public.woocommerce_sync_run(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS run_item_id uuid NULL REFERENCES public.woocommerce_sync_run_item(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_woocommerce_sync_job_run
  ON public.woocommerce_sync_job (run_id, status, updated_at DESC);

ALTER TABLE public.woocommerce_sync_job
  DROP CONSTRAINT IF EXISTS woocommerce_sync_job_type_check;

ALTER TABLE public.woocommerce_sync_job
  ADD CONSTRAINT woocommerce_sync_job_type_check
  CHECK (type IN ('PRICE_SYNC','STOCK_SYNC','ORDER_RECONCILE','CATALOG_RECONCILE','CATALOG_EXPORT','CATALOG_IMPORT'));

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
