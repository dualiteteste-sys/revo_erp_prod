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

  it('normaliza valor na listagem de movimentações usando valor_entrada/valor_saida quando valor não vem no DTO', async () => {
    callRpcMock.mockResolvedValueOnce([
      {
        id: 'mov-1',
        data_movimento: '2026-02-09',
        tipo_mov: 'entrada',
        descricao: 'Recebimento',
        documento_ref: null,
        origem_tipo: null,
        origem_id: null,
        valor_entrada: 100.25,
        valor_saida: 0,
        saldo_acumulado: 350.25,
        conciliado: false,
        total_count: 2,
      },
      {
        id: 'mov-2',
        data_movimento: '2026-02-09',
        tipo_mov: 'saida',
        descricao: 'Pagamento',
        documento_ref: null,
        origem_tipo: null,
        origem_id: null,
        valor_entrada: 0,
        valor_saida: '55.10',
        saldo_acumulado: 295.15,
        conciliado: false,
        total_count: 2,
      },
    ]);

    const { listMovimentacoes } = await import('./treasury');
    const res = await listMovimentacoes({
      contaCorrenteId: 'cc-1',
      page: 1,
      pageSize: 50,
    });

    expect(res.count).toBe(2);
    expect(res.data[0].valor).toBe(100.25);
    expect(res.data[1].valor).toBe(55.1);
  });

  it('mantém valor nulo quando DTO da movimentação vem sem campo monetário válido', async () => {
    callRpcMock.mockResolvedValueOnce([
      {
        id: 'mov-x',
        data_movimento: '2026-02-09',
        tipo_mov: 'entrada',
        descricao: 'Sem valor',
        documento_ref: null,
        origem_tipo: null,
        origem_id: null,
        valor_entrada: null,
        valor_saida: undefined,
        saldo_acumulado: 0,
        conciliado: false,
        total_count: 1,
      },
    ]);

    const { listMovimentacoes } = await import('./treasury');
    const res = await listMovimentacoes({
      contaCorrenteId: 'cc-1',
      page: 1,
      pageSize: 50,
    });

    expect(res.data[0].valor).toBeNull();
  });
});
