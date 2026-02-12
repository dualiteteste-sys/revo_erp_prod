import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

import { listWooListingsByProducts, runWooExport } from '@/services/woocommerceCatalog';

describe('woocommerceCatalog service', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('calls listings endpoint with product ids', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, rows: [] },
      error: null,
    });

    await listWooListingsByProducts({
      empresaId: 'empresa-1',
      storeId: 'store-1',
      revoProductIds: ['prod-1', 'prod-2'],
    });

    expect(invokeMock).toHaveBeenCalledWith('woocommerce-admin', {
      body: {
        action: 'stores.listings.by_products',
        store_id: 'store-1',
        revo_product_ids: ['prod-1', 'prod-2'],
      },
      headers: { 'x-empresa-id': 'empresa-1' },
    });
  });

  it('starts export run with selected product ids', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, run_id: 'run-1', enqueued_job_id: 'job-1', summary: { create: 1, update: 0, skip: 0, block: 0 } },
      error: null,
    });

    await runWooExport({
      empresaId: 'empresa-1',
      storeId: 'store-1',
      revoProductIds: ['prod-1'],
      options: { image_mode: 'none' },
    });

    expect(invokeMock).toHaveBeenCalledWith('woocommerce-admin', {
      body: {
        action: 'stores.catalog.run.export',
        store_id: 'store-1',
        revo_product_ids: ['prod-1'],
        options: { image_mode: 'none' },
      },
      headers: { 'x-empresa-id': 'empresa-1' },
    });
  });
});
