import { describe, expect, it } from 'vitest';
import { classifyWooConnectionFailure, type WooConnectionAttempt } from '../../../../../supabase/functions/_shared/woocommerceConnectionDiagnosis.ts';

function attempt(overrides: Partial<WooConnectionAttempt>): WooConnectionAttempt {
  return {
    auth_mode: 'basic_https',
    endpoint: '/wp-json/wc/v3/system_status',
    status: 401,
    latency_ms: 120,
    body_code: null,
    body_message: null,
    error: null,
    ...overrides,
  };
}

describe('woocommerce connection diagnosis', () => {
  it('classifica header Authorization bloqueado quando querystring funciona', () => {
    const result = classifyWooConnectionFailure({
      wpDetected: true,
      attempts: [
        attempt({ auth_mode: 'basic_https', status: 403 }),
        attempt({ auth_mode: 'querystring_fallback', status: 200 }),
      ],
    });
    expect(result.code).toBe('AUTH_HEADER_BLOCKED');
  });

  it('classifica credencial inválida quando todos retornam 401', () => {
    const result = classifyWooConnectionFailure({
      wpDetected: true,
      attempts: [
        attempt({ auth_mode: 'basic_https', status: 401 }),
        attempt({ auth_mode: 'querystring_fallback', status: 401 }),
      ],
    });
    expect(result.code).toBe('WOO_CREDENTIALS_INVALID');
  });

  it('classifica rota/permalink quando API do Woo retorna 404', () => {
    const result = classifyWooConnectionFailure({
      wpDetected: true,
      attempts: [
        attempt({ auth_mode: 'basic_https', status: 404 }),
      ],
    });
    expect(result.code).toBe('WOO_ROUTE_UNAVAILABLE');
  });
});
