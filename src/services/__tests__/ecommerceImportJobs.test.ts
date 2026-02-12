import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelEcommerceImportJob,
  enqueueEcommerceImportJob,
  getEcommerceImportJob,
  listEcommerceImportJobs,
  retryEcommerceImportJob,
} from '@/services/ecommerceImportJobs';

const callRpcMock = vi.fn();

vi.mock('@/lib/api', () => ({
  callRpc: (...args: unknown[]) => callRpcMock(...args),
}));

describe('ecommerceImportJobs service', () => {
  beforeEach(() => {
    callRpcMock.mockReset();
  });

  it('enqueues import job with expected payload', async () => {
    callRpcMock.mockResolvedValue({ job_id: 'job-1', status: 'pending' });

    const res = await enqueueEcommerceImportJob({
      provider: 'meli',
      kind: 'import_orders',
      payload: { source: 'manual' },
      idempotencyKey: 'abc',
      scheduledFor: '2026-02-09T10:00:00Z',
      maxAttempts: 3,
    });

    expect(res).toEqual({ job_id: 'job-1', status: 'pending' });
    expect(callRpcMock).toHaveBeenCalledWith('ecommerce_import_job_enqueue', {
      p_provider: 'meli',
      p_kind: 'import_orders',
      p_payload: { source: 'manual' },
      p_idempotency_key: 'abc',
      p_scheduled_for: '2026-02-09T10:00:00Z',
      p_max_attempts: 3,
    });
  });

  it('lists jobs with default filters', async () => {
    callRpcMock.mockResolvedValue([]);
    await listEcommerceImportJobs();
    expect(callRpcMock).toHaveBeenCalledWith('ecommerce_import_jobs_list', {
      p_provider: null,
      p_kind: null,
      p_status: null,
      p_limit: 50,
      p_offset: 0,
    });
  });

  it('gets job details with explicit limits', async () => {
    callRpcMock.mockResolvedValue({ job: {}, runs: [], items: [] });
    await getEcommerceImportJob('job-xyz', { runsLimit: 5, itemsLimit: 30 });
    expect(callRpcMock).toHaveBeenCalledWith('ecommerce_import_job_get', {
      p_job_id: 'job-xyz',
      p_runs_limit: 5,
      p_items_limit: 30,
    });
  });

  it('calls cancel and retry RPCs', async () => {
    callRpcMock.mockResolvedValueOnce(true);
    callRpcMock.mockResolvedValueOnce({ source_job_id: 'job-1', new_job_id: 'job-2', status: 'pending' });

    await cancelEcommerceImportJob('job-1');
    await retryEcommerceImportJob('job-1', 'manual_retry');

    expect(callRpcMock).toHaveBeenNthCalledWith(1, 'ecommerce_import_job_cancel', { p_job_id: 'job-1' });
    expect(callRpcMock).toHaveBeenNthCalledWith(2, 'ecommerce_import_job_retry_failed', {
      p_job_id: 'job-1',
      p_reason: 'manual_retry',
    });
  });
});
