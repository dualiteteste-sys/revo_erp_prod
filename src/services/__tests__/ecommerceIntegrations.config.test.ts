import { describe, expect, it } from 'vitest';
import { normalizeEcommerceConfig } from '@/services/ecommerceIntegrations';

describe('normalizeEcommerceConfig', () => {
  it('applies safe defaults', () => {
    expect(normalizeEcommerceConfig(null)).toEqual({
      import_orders: true,
      sync_stock: false,
      push_tracking: false,
      safe_mode: true,
    });
  });

  it('keeps unknown keys and coerces booleans', () => {
    expect(normalizeEcommerceConfig({ import_orders: false, sync_stock: 'x', foo: 1 })).toEqual({
      import_orders: false,
      sync_stock: false,
      push_tracking: false,
      safe_mode: true,
      foo: 1,
    });
  });

  it('allows explicit safe_mode=false', () => {
    expect(normalizeEcommerceConfig({ safe_mode: false })).toEqual({
      import_orders: true,
      sync_stock: false,
      push_tracking: false,
      safe_mode: false,
    });
  });
});

