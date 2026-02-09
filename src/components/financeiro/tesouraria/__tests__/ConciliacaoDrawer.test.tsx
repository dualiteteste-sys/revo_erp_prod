import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConciliacaoDrawer from '../ConciliacaoDrawer';

const {
  addToastMock,
  listMovimentacoesMock,
  listConciliacaoRegrasMock,
  sugerirTitulosParaExtratoMock,
  searchTitulosParaConciliacaoMock,
} = vi.hoisted(() => ({
  addToastMock: vi.fn(),
  listMovimentacoesMock: vi.fn(),
  listConciliacaoRegrasMock: vi.fn(),
  sugerirTitulosParaExtratoMock: vi.fn(),
  searchTitulosParaConciliacaoMock: vi.fn(),
}));

vi.mock('@/contexts/ToastProvider', () => ({
  useToast: () => ({ addToast: addToastMock }),
}));

vi.mock('@/services/treasury', async () => {
  const actual = await vi.importActual<typeof import('@/services/treasury')>('@/services/treasury');
  return {
    ...actual,
    listMovimentacoes: listMovimentacoesMock,
    saveMovimentacao: vi.fn(),
  };
});

vi.mock('@/services/conciliacaoRegras', async () => {
  const actual = await vi.importActual<typeof import('@/services/conciliacaoRegras')>('@/services/conciliacaoRegras');
  return {
    ...actual,
    listConciliacaoRegras: listConciliacaoRegrasMock,
  };
});

vi.mock('@/services/conciliacaoTitulos', async () => {
  const actual = await vi.importActual<typeof import('@/services/conciliacaoTitulos')>('@/services/conciliacaoTitulos');
  return {
    ...actual,
    sugerirTitulosParaExtrato: sugerirTitulosParaExtratoMock,
    searchTitulosParaConciliacao: searchTitulosParaConciliacaoMock,
    conciliarExtratoComTitulo: vi.fn(),
    conciliarExtratoComTituloParcial: vi.fn(),
    conciliarExtratoComTitulosLote: vi.fn(),
  };
});

describe('ConciliacaoDrawer - aba Movimentações', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listConciliacaoRegrasMock.mockResolvedValue([]);
    sugerirTitulosParaExtratoMock.mockResolvedValue([]);
    searchTitulosParaConciliacaoMock.mockResolvedValue({ data: [], count: 0 });
    listMovimentacoesMock.mockResolvedValue({
      data: [
        {
          id: 'mov-1',
          data_movimento: '2026-02-09',
          tipo_mov: 'saida',
          descricao: 'Mov sem valor',
          documento_ref: null,
          origem_tipo: null,
          origem_id: null,
          valor: null,
          valor_entrada: null,
          valor_saida: null,
          conciliado: false,
        },
      ],
      count: 1,
    });
  });

  it('não quebra e bloqueia vínculo quando movimentação vem sem valor válido', async () => {
    render(
      <ConciliacaoDrawer
        isOpen
        onClose={vi.fn()}
        extratoItem={{
          id: 'ext-1',
          data_lancamento: '2026-02-09',
          descricao: 'Pagamento fornecedor',
          documento_ref: null,
          tipo_lancamento: 'debito',
          valor: 150,
          saldo_apos_lancamento: null,
          conciliado: false,
          movimentacao_id: null,
          movimentacao_data: null,
          movimentacao_descricao: null,
          movimentacao_valor: null,
        }}
        contaCorrenteId="cc-1"
        onConciliate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Movimentações' }));

    await waitFor(() => {
      expect(screen.getByText(/Movimentação inválida: valor ausente/i)).toBeInTheDocument();
    });

    const vincularBtn = screen.getByRole('button', { name: /Vincular/i });
    expect(vincularBtn).toBeDisabled();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
