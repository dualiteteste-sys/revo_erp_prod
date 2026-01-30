import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import OrdensTable from '@/components/industria/ordens/OrdensTable';

const { confirmMock, deleteOrdemIndustriaMock } = vi.hoisted(() => ({
  confirmMock: vi.fn().mockResolvedValue(true),
  deleteOrdemIndustriaMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/contexts/ConfirmProvider', async () => {
  const actual = await vi.importActual<any>('@/contexts/ConfirmProvider');
  return {
    ...actual,
    useConfirm: () => ({ confirm: confirmMock }),
  };
});

vi.mock('@/services/industria', async () => {
  const actual = await vi.importActual<any>('@/services/industria');
  return {
    ...actual,
    deleteOrdemIndustria: deleteOrdemIndustriaMock,
  };
});

describe('OrdensTable', () => {
  beforeEach(() => {
    confirmMock.mockClear();
    deleteOrdemIndustriaMock.mockClear();
  });

  it('exclui OP/OB via deleteOrdemIndustria (industria_ordens)', async () => {
    const onEdit = vi.fn();
    const onChanged = vi.fn();

    renderWithProviders(
      <OrdensTable
        orders={[
          {
            id: 'op-1',
            numero: 1,
            tipo_ordem: 'industrializacao',
            produto_nome: 'Produto A',
            cliente_nome: null,
            quantidade_planejada: 1,
            unidade: 'un',
            status: 'rascunho',
            prioridade: 0,
            data_prevista_entrega: null,
            total_entregue: 0,
          },
          {
            id: 'ob-1',
            numero: 2,
            tipo_ordem: 'beneficiamento',
            produto_nome: 'Produto B',
            cliente_nome: 'Cliente',
            quantidade_planejada: 2,
            unidade: 'un',
            status: 'rascunho',
            prioridade: 0,
            data_prevista_entrega: null,
            total_entregue: 0,
          },
        ]}
        onEdit={onEdit}
        onChanged={onChanged}
      />
    );

    // Default sort é por número desc, então a OP (numero=1) fica na 2ª linha.
    fireEvent.click(screen.getAllByTitle('Mais ações')[1]);
    expect(await screen.findByText('Clonar OP')).toBeInTheDocument();
    fireEvent.click(
      await screen.findByText((_, node) => {
        const text = node?.textContent || '';
        return node?.tagName === 'BUTTON' && text.includes('Excluir') && text.includes('OP');
      })
    );

    expect(confirmMock).toHaveBeenCalled();
    await waitFor(() => expect(deleteOrdemIndustriaMock).toHaveBeenCalledWith('op-1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  }, 30_000);
});
