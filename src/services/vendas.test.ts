import { beforeEach, describe, expect, it, vi } from 'vitest';

const callRpcMock = vi.fn();

vi.mock('@/lib/api', () => ({
  callRpc: (...args: any[]) => callRpcMock(...args),
}));

describe('vendas service', () => {
  beforeEach(() => {
    callRpcMock.mockReset();
  });

  it('getVendaDetails normaliza retorno flat', async () => {
    callRpcMock.mockResolvedValueOnce({
      id: 'pedido-1',
      cliente_id: 'cli-1',
      frete: 10,
      desconto: 0,
      total_geral: 10,
      itens: [{ id: 'it-1', pedido_id: 'pedido-1', produto_id: 'p-1', quantidade: 1, preco_unitario: 10, desconto: 0, total: 10 }],
    });

    const { getVendaDetails } = await import('./vendas');
    const res = await getVendaDetails('pedido-1');

    expect(res.id).toBe('pedido-1');
    expect(res.frete).toBe(10);
    expect(Array.isArray(res.itens)).toBe(true);
    expect(res.itens[0].id).toBe('it-1');
  });

  it('getVendaDetails normaliza retorno {pedido, itens}', async () => {
    callRpcMock.mockResolvedValueOnce({
      pedido: { id: 'pedido-2', cliente_id: 'cli-2', frete: 0, desconto: 0, total_geral: 0 },
      itens: [{ id: 'it-2', pedido_id: 'pedido-2', produto_id: 'p-2', quantidade: 1, preco_unitario: 0, desconto: 0, total: 0 }],
    });

    const { getVendaDetails } = await import('./vendas');
    const res = await getVendaDetails('pedido-2');

    expect(res.id).toBe('pedido-2');
    expect(res.frete).toBe(0);
    expect(res.itens[0].id).toBe('it-2');
  });

  it('getVendaDetails lança erro quando RPC retorna null', async () => {
    callRpcMock.mockResolvedValueOnce(null);

    const { getVendaDetails } = await import('./vendas');

    await expect(getVendaDetails('pedido-404')).rejects.toThrow(/Pedido não encontrado/i);
  });
});

