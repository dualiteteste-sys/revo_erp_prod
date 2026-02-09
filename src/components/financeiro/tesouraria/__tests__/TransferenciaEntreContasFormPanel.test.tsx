import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TransferenciaEntreContasFormPanel from '../TransferenciaEntreContasFormPanel';

const { addToastMock, transferirEntreContasMock } = vi.hoisted(() => ({
  addToastMock: vi.fn(),
  transferirEntreContasMock: vi.fn(),
}));

vi.mock('@/contexts/ToastProvider', () => ({
  useToast: () => ({ addToast: addToastMock }),
}));

vi.mock('@/services/treasury', async () => {
  const actual = await vi.importActual<typeof import('@/services/treasury')>('@/services/treasury');
  return {
    ...actual,
    transferirEntreContas: transferirEntreContasMock,
  };
});

const contas = [
  {
    id: 'cc-1',
    empresa_id: 'emp-1',
    nome: 'Conta Corrente',
    apelido: null,
    banco_codigo: null,
    banco_nome: null,
    agencia: null,
    conta: null,
    digito: null,
    tipo_conta: 'corrente' as const,
    moeda: 'BRL',
    saldo_inicial: 0,
    data_saldo_inicial: '2026-02-01',
    limite_credito: 0,
    permite_saldo_negativo: false,
    ativo: true,
    padrao_para_pagamentos: false,
    padrao_para_recebimentos: false,
    observacoes: null,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
  },
  {
    id: 'cc-2',
    empresa_id: 'emp-1',
    nome: 'Aplicação',
    apelido: null,
    banco_codigo: null,
    banco_nome: null,
    agencia: null,
    conta: null,
    digito: null,
    tipo_conta: 'corrente' as const,
    moeda: 'BRL',
    saldo_inicial: 0,
    data_saldo_inicial: '2026-02-01',
    limite_credito: 0,
    permite_saldo_negativo: false,
    ativo: true,
    padrao_para_pagamentos: false,
    padrao_para_recebimentos: false,
    observacoes: null,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
  },
];

describe('TransferenciaEntreContasFormPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transferirEntreContasMock.mockResolvedValue({
      transferencia_id: 'trf-1',
      movimentacao_saida_id: 'mov-s',
      movimentacao_entrada_id: 'mov-e',
      conta_origem_id: 'cc-1',
      conta_destino_id: 'cc-2',
      valor: 100,
      data_movimento: '2026-02-09',
    });
  });

  it('salva transferência entre contas com payload esperado', async () => {
    const onSaveSuccess = vi.fn();
    render(
      <TransferenciaEntreContasFormPanel
        contas={contas}
        defaultContaOrigemId="cc-1"
        onSaveSuccess={onSaveSuccess}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/Valor/i), {
      target: { value: '100,00' },
    });
    fireEvent.change(screen.getByLabelText(/Descrição/i), {
      target: { value: 'Resgate aplicação' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar transferência/i }));

    await waitFor(() => {
      expect(transferirEntreContasMock).toHaveBeenCalledWith(
        expect.objectContaining({
          conta_origem_id: 'cc-1',
          conta_destino_id: 'cc-2',
          valor: 100,
          descricao: 'Resgate aplicação',
        })
      );
    });
    expect(onSaveSuccess).toHaveBeenCalled();
  });

  it('bloqueia salvar quando não há duas contas disponíveis', async () => {
    render(
      <TransferenciaEntreContasFormPanel
        contas={[contas[0]]}
        defaultContaOrigemId="cc-1"
        onSaveSuccess={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Confirmar transferência/i }));

    await waitFor(() => {
      expect(addToastMock).toHaveBeenCalledWith(
        'Cadastre ao menos duas contas correntes para realizar transferências.',
        'error'
      );
    });
    expect(transferirEntreContasMock).not.toHaveBeenCalled();
  });
});
