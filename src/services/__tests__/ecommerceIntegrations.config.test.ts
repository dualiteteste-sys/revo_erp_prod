import { describe, expect, it } from 'vitest';
import { normalizeEcommerceConfig, resolveWooConnectionStatus } from '@/services/ecommerceIntegrations';

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

describe('resolveWooConnectionStatus', () => {
  it('returns connected when backend diagnostics says connected', () => {
    expect(
      resolveWooConnectionStatus({
        storeUrl: 'https://loja.exemplo.com',
        diagnostics: { connection_status: 'connected' } as any,
        diagnosticsUnavailable: false,
        previousStatus: 'pending',
      }),
    ).toBe('connected');
  });

  it('returns pending when store URL is missing (even if diagnostics says connected)', () => {
    expect(
      resolveWooConnectionStatus({
        storeUrl: '',
        diagnostics: { connection_status: 'connected' } as any,
        diagnosticsUnavailable: false,
        previousStatus: 'connected',
      }),
    ).toBe('pending');
  });

  it('returns error when backend diagnostics says error', () => {
    expect(
      resolveWooConnectionStatus({
        storeUrl: 'https://loja.exemplo.com',
        diagnostics: { connection_status: 'error' } as any,
        diagnosticsUnavailable: false,
        previousStatus: 'connected',
      }),
    ).toBe('error');
  });

  it('keeps connected when diagnostics are unavailable and previous status is connected', () => {
    expect(
      resolveWooConnectionStatus({
        storeUrl: 'https://loja.exemplo.com',
        diagnostics: null,
        diagnosticsUnavailable: true,
        previousStatus: 'connected',
      }),
    ).toBe('pending');
  });

  it('returns pending when required data is missing', () => {
    expect(
      resolveWooConnectionStatus({
        storeUrl: 'https://loja.exemplo.com',
        diagnostics: null,
        diagnosticsUnavailable: false,
        previousStatus: 'connected',
      }),
    ).toBe('pending');
  });
});
