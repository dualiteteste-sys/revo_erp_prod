import { describe, expect, it } from 'vitest';

import { evaluateWooStoreHealthChecks, healthSeverityRank } from '../healthChecks';
import type { WooStatusResponse } from '@/services/woocommerceControlPanel';

function baseStatus(): WooStatusResponse {
  return {
    ok: true,
    store: {
      id: 'store-1',
      base_url: 'https://woo.example.com',
      auth_mode: 'basic_https',
      status: 'active',
    },
    health: {
      status: 'ok',
      status_label: 'OK',
      stale: false,
      stale_reason: null,
      last_healthcheck_at: '2026-02-12T10:00:00.000Z',
    },
    queue: { queued: 0, running: 1, error: 0, dead: 0, total: 1, lag_hint: 'ok' },
    webhooks: { received_recent: 5, failed_recent: 0, last_received_at: '2026-02-12T10:55:00.000Z', stale_minutes: 5 },
    orders: { imported_total_seen: 20, last_imported_at: '2026-02-12T10:50:00.000Z', last_woo_updated_at: '2026-02-12T10:50:00.000Z' },
    map_quality: { total: 20, missing_revo_map: 0, duplicated_skus: 0 },
    recommendations: [],
    recent_errors: [],
    webhook_events: [],
    jobs: [{ id: 'j1', type: 'ORDER_RECONCILE', status: 'done', attempts: 1, next_run_at: null, last_error: null, created_at: '2026-02-12T10:40:00.000Z' }],
    logs: [],
    status_contract: {},
  };
}

function getSeverity(status: WooStatusResponse, code: string): string {
  const checks = evaluateWooStoreHealthChecks({
    storeId: 'store-1',
    storeUrl: 'https://woo.example.com',
    status,
    now: new Date('2026-02-12T11:00:00.000Z'),
  });
  return checks.find((check) => check.code === code)?.severity ?? 'missing';
}

describe('woocommerce health checks', () => {
  it('marks WORKER_LAG as critical when DLQ grows', () => {
    const status = baseStatus();
    status.queue.dead = 2;
    expect(getSeverity(status, 'WORKER_LAG')).toBe('critical');
  });

  it('marks WEBHOOK_STALE as critical for active store with no recent events', () => {
    const status = baseStatus();
    status.webhooks.last_received_at = '2026-02-12T06:00:00.000Z';
    expect(getSeverity(status, 'WEBHOOK_STALE')).toBe('critical');
  });

  it('marks AUTH_FAILING as critical when auth errors are present', () => {
    const status = baseStatus();
    status.recent_errors = [{ code: 'WOO_AUTH_INVALID', hint: 'check key', message: '401', at: '2026-02-12T10:59:00.000Z' }];
    expect(getSeverity(status, 'AUTH_FAILING')).toBe('critical');
  });

  it('treats legacy WOO_AUTH_FAILED as AUTH_FAILING', () => {
    const status = baseStatus();
    status.recent_errors = [{ code: 'WOO_AUTH_FAILED', hint: 'check key', message: '403', at: '2026-02-12T10:59:00.000Z' }];
    expect(getSeverity(status, 'AUTH_FAILING')).toBe('critical');
  });

  it('marks ERROR_RATE as warning when failures are above threshold', () => {
    const status = baseStatus();
    status.jobs = [
      { id: 'j1', type: 'ORDER_RECONCILE', status: 'error', attempts: 3, next_run_at: null, last_error: 'x', created_at: '2026-02-12T10:40:00.000Z' },
      { id: 'j2', type: 'ORDER_RECONCILE', status: 'error', attempts: 2, next_run_at: null, last_error: 'x', created_at: '2026-02-12T10:30:00.000Z' },
      { id: 'j3', type: 'STOCK_SYNC', status: 'done', attempts: 1, next_run_at: null, last_error: null, created_at: '2026-02-12T10:20:00.000Z' },
      { id: 'j4', type: 'PRICE_SYNC', status: 'done', attempts: 1, next_run_at: null, last_error: null, created_at: '2026-02-12T10:10:00.000Z' },
      { id: 'j5', type: 'ORDER_RECONCILE', status: 'done', attempts: 1, next_run_at: null, last_error: null, created_at: '2026-02-12T10:00:00.000Z' },
    ];
    expect(getSeverity(status, 'ERROR_RATE')).toBe('warning');
  });

  it('marks MAP_CONFLICTS as critical on duplicated sku', () => {
    const status = baseStatus();
    status.map_quality.duplicated_skus = 1;
    expect(getSeverity(status, 'MAP_CONFLICTS')).toBe('critical');
  });

  it('marks ORDER_IMPORT_STALE as critical when imports are stale', () => {
    const status = baseStatus();
    status.orders.last_imported_at = '2026-02-12T02:00:00.000Z';
    expect(getSeverity(status, 'ORDER_IMPORT_STALE')).toBe('critical');
  });

  it('keeps severity ranking stable', () => {
    expect(healthSeverityRank('critical')).toBeGreaterThan(healthSeverityRank('warning'));
    expect(healthSeverityRank('warning')).toBeGreaterThan(healthSeverityRank('info'));
  });

  it('supports threshold override', () => {
    const status = baseStatus();
    status.queue.error = 2;
    const checks = evaluateWooStoreHealthChecks({
      storeId: 'store-1',
      storeUrl: 'https://woo.example.com',
      status,
      now: new Date('2026-02-12T11:00:00.000Z'),
      thresholds: { workerErrorCritical: 2 },
    });
    expect(checks.find((check) => check.code === 'WORKER_LAG')?.severity).toBe('critical');
  });
});
