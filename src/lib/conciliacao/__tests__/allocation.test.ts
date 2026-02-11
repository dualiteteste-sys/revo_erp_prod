import { describe, expect, it } from 'vitest';
import { autoAllocateFifoByVencimento } from '../allocation';

describe('autoAllocateFifoByVencimento', () => {
  it('aloca FIFO por vencimento até preencher o total (inclui parcial no último)', () => {
    const allocations = autoAllocateFifoByVencimento({
      total: 400,
      titulos: [
        {
          tipo: 'receber',
          titulo_id: 't3',
          pessoa_id: 'p1',
          pessoa_nome: 'Cliente',
          descricao: null,
          documento_ref: null,
          data_vencimento: '2026-01-03',
          valor_total: 109,
          valor_pago: 0,
          saldo_aberto: 109,
          status: 'pendente',
        },
        {
          tipo: 'receber',
          titulo_id: 't1',
          pessoa_id: 'p1',
          pessoa_nome: 'Cliente',
          descricao: null,
          documento_ref: null,
          data_vencimento: '2026-01-01',
          valor_total: 109,
          valor_pago: 0,
          saldo_aberto: 109,
          status: 'pendente',
        },
        {
          tipo: 'receber',
          titulo_id: 't2',
          pessoa_id: 'p1',
          pessoa_nome: 'Cliente',
          descricao: null,
          documento_ref: null,
          data_vencimento: '2026-01-02',
          valor_total: 109,
          valor_pago: 0,
          saldo_aberto: 109,
          status: 'pendente',
        },
        {
          tipo: 'receber',
          titulo_id: 't4',
          pessoa_id: 'p1',
          pessoa_nome: 'Cliente',
          descricao: null,
          documento_ref: null,
          data_vencimento: '2026-01-04',
          valor_total: 109,
          valor_pago: 0,
          saldo_aberto: 109,
          status: 'pendente',
        },
      ],
    });

    expect(allocations).toEqual({
      t1: 109,
      t2: 109,
      t3: 109,
      t4: 73,
    });
  });
});

