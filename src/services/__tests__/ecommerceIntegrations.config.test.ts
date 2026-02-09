import { describe, expect, it } from 'vitest';
import { normalizeEcommerceConfig, resolveWooConnectionStatus } from '@/services/ecommerceIntegrations';

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

describe('resolveWooConnectionStatus', () => {
  it('returns connected when store URL and secrets are present', () => {
    expect(
      resolveWooConnectionStatus({
        storeUrl: 'https://loja.exemplo.com',
        hasSecrets: true,
        diagnosticsUnavailable: false,
        previousStatus: 'pending',
      }),
    ).toBe('connected');
  });

  it('keeps connected when diagnostics are unavailable and previous status is connected', () => {
    expect(
      resolveWooConnectionStatus({
        storeUrl: '',
        hasSecrets: false,
        diagnosticsUnavailable: true,
        previousStatus: 'connected',
      }),
    ).toBe('connected');
  });

  it('returns pending when required data is missing', () => {
    expect(
      resolveWooConnectionStatus({
        storeUrl: 'https://loja.exemplo.com',
        hasSecrets: false,
        diagnosticsUnavailable: false,
        previousStatus: 'connected',
      }),
    ).toBe('pending');
  });
});
