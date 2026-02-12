import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RecebimentoListPage from '@/pages/suprimentos/RecebimentoListPage';

vi.mock('@/contexts/ToastProvider', () => ({
  useToast: () => ({ addToast: vi.fn() }),
  ToastProvider: ({ children }: { children: any }) => children,
}));

vi.mock('@/services/recebimento', async () => {
  const actual = await vi.importActual<any>('@/services/recebimento');
  return {
    ...actual,
    listRecebimentos: vi.fn().mockResolvedValue([
      {
        id: 'rec-1',
        status: 'concluido',
        data_recebimento: new Date().toISOString(),
        fiscal_nfe_imports: { emitente_nome: 'Fornecedor X', numero: '1', serie: '1', total_nf: 10 },
      },
      {
        id: 'rec-2',
        status: 'pendente',
        data_recebimento: new Date().toISOString(),
        fiscal_nfe_imports: { emitente_nome: 'Fornecedor Y', numero: '2', serie: '1', total_nf: 20 },
      },
    ]),
    cancelarRecebimento: vi.fn().mockResolvedValue({ status: 'ok' }),
    deleteRecebimento: vi.fn().mockResolvedValue(undefined),
  };
});

describe('RecebimentoListPage', () => {
  it('opens cancel modal for concluido and calls cancelarRecebimento', async () => {
    render(
      <MemoryRouter>
        <RecebimentoListPage />
      </MemoryRouter>,
    );

    // Aguarda carregar listagem
    expect(await screen.findByText(/Recebimento de Mercadorias/i)).toBeInTheDocument();
    expect(await screen.findByText(/Fornecedor X/i)).toBeInTheDocument();

    // Botão de cancelar (ícone) está presente apenas para concluído
    const cancelBtn = await screen.findByTitle(/Cancelar recebimento \(estorno\)/i);
    fireEvent.click(cancelBtn);

    expect(await screen.findByText(/Cancelar recebimento \(estorno\)/i)).toBeInTheDocument();

    const motivo = screen.getByPlaceholderText(/NF-e importada errada/i);
    fireEvent.change(motivo, { target: { value: 'teste' } });

    const confirm = screen.getByRole('button', { name: /^Cancelar recebimento$/i });
    fireEvent.click(confirm);

    const { cancelarRecebimento } = await import('@/services/recebimento');
    await waitFor(() => expect(cancelarRecebimento).toHaveBeenCalledWith('rec-1', 'teste'));
  });
});
