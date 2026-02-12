import { describe, expect, it } from 'vitest';
import { computeCatalogRunCounts, shouldAllowRetryFailed } from '@/lib/integrations/woocommerce/catalogRuns';

describe('catalog run helpers', () => {
  it('computes summary counts by item status', () => {
    const counts = computeCatalogRunCounts([
      { status: 'DONE' },
      { status: 'DONE' },
      { status: 'SKIPPED' },
      { status: 'ERROR' },
      { status: 'DEAD' },
      { status: 'QUEUED' },
    ]);

    expect(counts).toEqual({
      planned: 6,
      done: 2,
      skipped: 1,
      failed: 2,
      running: 1,
    });
  });

  it('allows retry only when there are failed items', () => {
    expect(shouldAllowRetryFailed([{ status: 'DONE' }, { status: 'SKIPPED' }])).toBe(false);
    expect(shouldAllowRetryFailed([{ status: 'ERROR' }])).toBe(true);
  });
});
