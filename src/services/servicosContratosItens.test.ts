import { describe, it, expect, vi, beforeEach } from 'vitest';

const callRpcMock = vi.fn();

vi.mock('@/lib/api', () => ({
  callRpc: (...args: any[]) => callRpcMock(...args),
}));

describe('servicosContratosItens service', () => {
  beforeEach(() => {
    callRpcMock.mockReset();
  });

  it('listItensByContratoId lista por contrato_id e ordena', async () => {
    callRpcMock.mockResolvedValueOnce([{ id: 'it-1' }, { id: 'it-2' }]);
    const { listItensByContratoId } = await import('./servicosContratosItens');

    const res = await listItensByContratoId('ctr-1');

    expect(callRpcMock).toHaveBeenCalledWith('servicos_contratos_itens_list', { p_contrato_id: 'ctr-1' });
    expect(res).toEqual([{ id: 'it-1' }, { id: 'it-2' }]);
  });

  it('upsertContratoItem faz upsert e retorna single', async () => {
    callRpcMock.mockResolvedValueOnce({ id: 'it-1' });
    const { upsertContratoItem } = await import('./servicosContratosItens');

    const payload = { contrato_id: 'ctr-1', titulo: 'Suporte', quantidade: 1, valor_unitario: 100 };
    const res = await upsertContratoItem(payload as any);

    expect(callRpcMock).toHaveBeenCalledWith('servicos_contratos_itens_upsert', { p_payload: payload });
    expect(res).toEqual({ id: 'it-1' });
  });

  it('deleteContratoItem deleta por id', async () => {
    callRpcMock.mockResolvedValueOnce(true);
    const { deleteContratoItem } = await import('./servicosContratosItens');

    await deleteContratoItem('it-1');

    expect(callRpcMock).toHaveBeenCalledWith('servicos_contratos_itens_delete', { p_id: 'it-1' });
  });
});
