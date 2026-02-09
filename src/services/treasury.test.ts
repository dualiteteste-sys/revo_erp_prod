import { beforeEach, describe, expect, it, vi } from 'vitest';

const callRpcMock = vi.fn();

vi.mock('@/lib/api', () => ({
  callRpc: (...args: any[]) => callRpcMock(...args),
}));

describe('treasury service', () => {
  beforeEach(() => {
    callRpcMock.mockReset();
  });

  it('envia payload correto na transferência entre contas', async () => {
    callRpcMock.mockResolvedValueOnce({
      transferencia_id: 'trf-1',
      movimentacao_saida_id: 'mov-out',
      movimentacao_entrada_id: 'mov-in',
      conta_origem_id: 'cc-1',
      conta_destino_id: 'cc-2',
      valor: 250.5,
      data_movimento: '2026-02-09',
    });

    const { transferirEntreContas } = await import('./treasury');

    const result = await transferirEntreContas({
      conta_origem_id: 'cc-1',
      conta_destino_id: 'cc-2',
      valor: 250.5,
      data_movimento: '2026-02-09',
      descricao: 'Resgate aplicação',
      documento_ref: 'DOC-123',
      observacoes: 'Teste',
    });

    expect(callRpcMock).toHaveBeenCalledWith('financeiro_transferencias_internas_criar', {
      p_conta_origem_id: 'cc-1',
      p_conta_destino_id: 'cc-2',
      p_valor: 250.5,
      p_data_movimento: '2026-02-09',
      p_descricao: 'Resgate aplicação',
      p_documento_ref: 'DOC-123',
      p_centro_de_custo_id: null,
      p_observacoes: 'Teste',
    });
    expect(result.movimentacao_saida_id).toBe('mov-out');
  });
});
