import { beforeEach, describe, expect, it, vi } from 'vitest';

const callRpcMock = vi.fn();

vi.mock('@/lib/api', () => ({
  callRpc: (...args: any[]) => callRpcMock(...args),
}));

describe('userPermissionHistory service', () => {
  beforeEach(() => {
    callRpcMock.mockReset();
  });

  it('chama RPC com parâmetros corretos e respeita limite', async () => {
    callRpcMock.mockResolvedValueOnce([{ id: 'evt-1' }]);
    const { listUserPermissionOverrideHistory } = await import('@/services/userPermissionHistory');

    const rows = await listUserPermissionOverrideHistory('user-1', 9999);

    expect(callRpcMock).toHaveBeenCalledWith('user_permission_overrides_history_for_current_empresa', {
      p_user_id: 'user-1',
      p_limit: 500,
    });
    expect(rows).toEqual([{ id: 'evt-1' }]);
  });

  it('retorna array vazio quando RPC devolve null', async () => {
    callRpcMock.mockResolvedValueOnce(null);
    const { listUserPermissionOverrideHistory } = await import('@/services/userPermissionHistory');

    const rows = await listUserPermissionOverrideHistory('user-2');

    expect(callRpcMock).toHaveBeenCalledWith('user_permission_overrides_history_for_current_empresa', {
      p_user_id: 'user-2',
      p_limit: 50,
    });
    expect(rows).toEqual([]);
  });
});
