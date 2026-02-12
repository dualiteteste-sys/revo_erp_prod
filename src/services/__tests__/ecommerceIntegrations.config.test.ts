import { describe, expect, it } from 'vitest';
import { normalizeEcommerceConfig } from '@/services/ecommerceIntegrations';

describe('normalizeEcommerceConfig', () => {
  it('applies safe defaults', () => {
    expect(normalizeEcommerceConfig(null)).toEqual({
      import_orders: true,
      sync_stock: false,
      sync_prices: false,
      push_tracking: false,
      safe_mode: true,
      sync_direction: 'bidirectional',
      conflict_policy: 'erp_wins',
      auto_sync_enabled: false,
      sync_interval_minutes: 15,
    });
  });

  it('keeps unknown keys and coerces booleans', () => {
    expect(normalizeEcommerceConfig({ import_orders: false, sync_stock: 'x', foo: 1 })).toEqual({
      import_orders: false,
      sync_stock: false,
      sync_prices: false,
      push_tracking: false,
      safe_mode: true,
      sync_direction: 'bidirectional',
      conflict_policy: 'erp_wins',
      auto_sync_enabled: false,
      sync_interval_minutes: 15,
      foo: 1,
    });
  });

  it('allows explicit safe_mode=false', () => {
    expect(normalizeEcommerceConfig({ safe_mode: false })).toEqual({
      import_orders: true,
      sync_stock: false,
      sync_prices: false,
      push_tracking: false,
      safe_mode: false,
      sync_direction: 'bidirectional',
      conflict_policy: 'erp_wins',
      auto_sync_enabled: false,
      sync_interval_minutes: 15,
    });
  });
});
