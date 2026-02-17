import { describe, expect, it } from 'vitest';

import {
  buildPreferredEcommerceConnectionsMap,
  mergeWooDiagnosticsWithSnapshot,
  normalizeWooBaseUrl,
  pickPreferredEcommerceConnection,
  selectPreferredWooStoreId,
} from '@/lib/ecommerce/wooConnectionState';
import { type EcommerceConnection, type EcommerceConnectionDiagnostics, type WooSecretsSaveResult } from '@/services/ecommerceIntegrations';

function makeConnection(overrides: Partial<EcommerceConnection>): EcommerceConnection {
  return {
    id: 'conn-default',
    empresa_id: 'empresa-1',
    provider: 'woo',
    nome: 'WooCommerce',
    status: 'pending',
    external_account_id: null,
    config: {},
    last_sync_at: null,
    last_error: null,
    connected_at: null,
    created_at: '2026-02-01T00:00:00.000Z',
    updated_at: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeWooDiagnostics(overrides: Partial<EcommerceConnectionDiagnostics>): EcommerceConnectionDiagnostics {
  return {
    provider: 'woo',
    has_connection: true,
    status: 'pending',
    connection_status: 'pending',
    error_message: null,
    last_verified_at: null,
    external_account_id: null,
    connected_at: null,
    last_sync_at: null,
    last_error: null,
    has_token: false,
    has_consumer_key: false,
    has_consumer_secret: false,
    has_refresh_token: false,
    token_expires_at: null,
    token_expired: false,
    ...overrides,
  };
}

describe('wooConnectionState', () => {
  it('selects preferred Woo connection by status and completeness', () => {
    const rows: EcommerceConnection[] = [
      makeConnection({
        id: 'woo-old',
        status: 'pending',
        config: { store_url: '' },
        updated_at: '2026-02-01T00:00:00.000Z',
      }),
      makeConnection({
        id: 'woo-good',
        status: 'connected',
        config: { store_url: 'https://loja.example.com' },
        updated_at: '2026-02-02T00:00:00.000Z',
      }),
      makeConnection({
        id: 'woo-mid',
        status: 'connected',
        config: { store_url: '' },
        updated_at: '2026-02-03T00:00:00.000Z',
      }),
    ];

    const preferred = pickPreferredEcommerceConnection(rows, 'woo');
    expect(preferred?.id).toBe('woo-good');
  });

  it('keeps explicit preferred connection while editing', () => {
    const rows: EcommerceConnection[] = [
      makeConnection({ id: 'woo-a', status: 'connected', updated_at: '2026-02-03T00:00:00.000Z' }),
      makeConnection({ id: 'woo-b', status: 'pending', updated_at: '2026-02-04T00:00:00.000Z' }),
    ];

    const preferred = pickPreferredEcommerceConnection(rows, 'woo', 'woo-b');
    expect(preferred?.id).toBe('woo-b');
  });

  it('builds map with preferred connection for each provider', () => {
    const rows: EcommerceConnection[] = [
      makeConnection({ id: 'woo', provider: 'woo', status: 'connected' }),
      makeConnection({ id: 'meli', provider: 'meli', status: 'connected', external_account_id: '123' }),
    ];

    const map = buildPreferredEcommerceConnectionsMap(rows, ['meli', 'shopee', 'woo']);
    expect(map.get('woo')?.id).toBe('woo');
    expect(map.get('meli')?.id).toBe('meli');
    expect(map.has('shopee')).toBe(false);
  });

  it('projects snapshot credentials without clearing them prematurely', () => {
    const diagnostics = makeWooDiagnostics({
      has_consumer_key: false,
      has_consumer_secret: false,
      connection_status: 'pending',
    });
    const snapshot: WooSecretsSaveResult = {
      has_consumer_key: true,
      has_consumer_secret: true,
      connection_status: 'pending',
      last_verified_at: null,
      error_message: null,
    };

    const merged = mergeWooDiagnosticsWithSnapshot({ diagnostics, snapshot });
    expect(merged.backendConfirmsCredentials).toBe(false);
    expect(merged.diagnostics.has_consumer_key).toBe(true);
    expect(merged.diagnostics.has_consumer_secret).toBe(true);
  });

  it('clears snapshot only when backend confirms Woo credentials', () => {
    const diagnostics = makeWooDiagnostics({
      has_consumer_key: true,
      has_consumer_secret: true,
      connection_status: 'connected',
    });
    const snapshot: WooSecretsSaveResult = {
      has_consumer_key: true,
      has_consumer_secret: true,
      connection_status: 'pending',
      last_verified_at: null,
      error_message: null,
    };

    const merged = mergeWooDiagnosticsWithSnapshot({ diagnostics, snapshot });
    expect(merged.backendConfirmsCredentials).toBe(true);
    expect(merged.diagnostics.has_consumer_key).toBe(true);
    expect(merged.diagnostics.has_consumer_secret).toBe(true);
  });

  it('normaliza store_url e encontra store preferida', () => {
    const id = selectPreferredWooStoreId({
      stores: [
        { id: '1', base_url: 'https://old.example.com', status: 'active' },
        { id: '2', base_url: 'https://tudoparatatuagem.com.br', status: 'active' },
      ],
      preferredStoreUrl: 'https://tudoparatatuagem.com.br/',
    });
    expect(id).toBe('2');
    expect(normalizeWooBaseUrl('https://tudoparatatuagem.com.br/')).toBe('https://tudoparatatuagem.com.br');
  });
});
