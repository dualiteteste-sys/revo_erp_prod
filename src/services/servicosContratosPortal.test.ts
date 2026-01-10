import { describe, it, expect, vi, beforeEach } from 'vitest';

const callRpcMock = vi.fn();

vi.mock('@/lib/api', () => ({
  callRpc: (...args: any[]) => callRpcMock(...args),
}));

describe('servicosContratosPortal service', () => {
  beforeEach(() => {
    callRpcMock.mockReset();
  });

  it('getContratoPortal chama RPC correta', async () => {
    callRpcMock.mockResolvedValueOnce({ documento: { id: 'doc-1' } });
    const { getContratoPortal } = await import('./servicosContratosPortal');

    const res = await getContratoPortal('token-123');

    expect(callRpcMock).toHaveBeenCalledWith('servicos_contratos_portal_get', { p_token: 'token-123' });
    expect(res.documento.id).toBe('doc-1');
  });

  it('acceptContratoPortal chama RPC correta', async () => {
    callRpcMock.mockResolvedValueOnce({ accepted_at: '2026-01-10T10:00:00Z' });
    const { acceptContratoPortal } = await import('./servicosContratosPortal');

    const res = await acceptContratoPortal({ token: 'token-123', nome: 'Ana', email: 'ana@example.com' });

    expect(callRpcMock).toHaveBeenCalledWith('servicos_contratos_portal_accept', {
      p_token: 'token-123',
      p_nome: 'Ana',
      p_email: 'ana@example.com',
    });
    expect(res).toEqual({ acceptedAt: '2026-01-10T10:00:00Z' });
  });
});

