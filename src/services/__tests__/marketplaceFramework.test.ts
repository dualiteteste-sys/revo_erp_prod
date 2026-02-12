import { describe, expect, it } from 'vitest';
import {
  MARKETPLACE_PROVIDER_DEFINITIONS,
  MARKETPLACE_PROVIDER_IDS,
  defaultMarketplaceConflictPolicy,
  defaultMarketplaceSyncDirection,
} from '@/services/marketplaceFramework';

describe('marketplace framework registry', () => {
  it('has supported providers in deterministic order', () => {
    expect(MARKETPLACE_PROVIDER_IDS).toEqual(['meli', 'shopee']);
  });

  it('marks all current providers as bidirectional-capable', () => {
    for (const provider of MARKETPLACE_PROVIDER_IDS) {
      expect(MARKETPLACE_PROVIDER_DEFINITIONS[provider].capabilities.supportsBidirectionalSync).toBe(true);
    }
  });

  it('keeps safe defaults for sync conflict strategy', () => {
    expect(defaultMarketplaceSyncDirection()).toBe('bidirectional');
    expect(defaultMarketplaceConflictPolicy()).toBe('erp_wins');
  });
});
