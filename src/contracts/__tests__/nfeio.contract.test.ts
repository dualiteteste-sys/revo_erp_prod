import { describe, expect, it } from 'vitest';
import { extractNfeioStatus } from '../../../supabase/functions/_shared/nfeio_payload';
import { sanitizeForLog } from '../../../supabase/functions/_shared/sanitize';

import nfeioWebhook from '../fixtures/nfeio_webhook_payload.json';

describe('QA-CT-01 NFE.io contracts', () => {
  it('extracts status from nested webhook payloads', () => {
    expect(extractNfeioStatus(nfeioWebhook)).toBe('authorized');
  });

  it('sanitizes payloads for logs (golden)', () => {
    expect(sanitizeForLog(nfeioWebhook)).toMatchSnapshot();
  });
});

