import { beforeEach, describe, expect, it, vi } from 'vitest';

const callRpcMock = vi.fn();
const invokeMock = vi.fn();

vi.mock('@/lib/api', () => ({
  callRpc: (...args: any[]) => callRpcMock(...args),
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: (...args: any[]) => invokeMock(...args),
    },
  },
}));

describe('opsAccountDeletion service', () => {
  beforeEach(() => {
    callRpcMock.mockReset();
    invokeMock.mockReset();
  });

  it('usa a RPC de preview da empresa ativa', async () => {
    callRpcMock.mockResolvedValueOnce({ empresa_id: 'empresa-1' });
    const { getOpsAccountDeletionPreview } = await import('@/services/opsAccountDeletion');

    const data = await getOpsAccountDeletionPreview();

    expect(callRpcMock).toHaveBeenCalledWith('ops_account_delete_preview_current_empresa');
    expect(data).toEqual({ empresa_id: 'empresa-1' });
  });

  it('executa exclusão via edge function com payload esperado', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        ok: true,
        result: { audit_id: 'audit-1', empresa_id: 'empresa-1', deleted_storage_objects: 4 },
      },
      error: null,
    });
    const { executeOpsAccountDeletion } = await import('@/services/opsAccountDeletion');

    const result = await executeOpsAccountDeletion({
      confirmation: 'EXCLUIR empresa-1',
      reason: 'limpeza de teste',
    });

    expect(invokeMock).toHaveBeenCalledWith('ops-account-delete', {
      body: {
        confirmation: 'EXCLUIR empresa-1',
        reason: 'limpeza de teste',
      },
    });
    expect(result).toMatchObject({ audit_id: 'audit-1', empresa_id: 'empresa-1', deleted_storage_objects: 4 });
  });

  it('lança erro quando edge function falha', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'forbidden' },
    });
    const { executeOpsAccountDeletion } = await import('@/services/opsAccountDeletion');

    await expect(executeOpsAccountDeletion({ confirmation: 'EXCLUIR empresa-1' })).rejects.toMatchObject({
      message: 'forbidden',
    });
  });
});
