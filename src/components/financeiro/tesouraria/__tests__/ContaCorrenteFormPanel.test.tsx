import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ContaCorrenteFormPanel from '../ContaCorrenteFormPanel';

const { addToastMock, saveContaCorrenteMock } = vi.hoisted(() => ({
  addToastMock: vi.fn(),
  saveContaCorrenteMock: vi.fn(),
}));

vi.mock('@/contexts/ToastProvider', () => ({
  useToast: () => ({ addToast: addToastMock }),
}));

vi.mock('@/services/treasury', async () => {
  const actual = await vi.importActual<typeof import('@/services/treasury')>('@/services/treasury');
  return {
    ...actual,
    saveContaCorrente: saveContaCorrenteMock,
  };
});

const baseConta = {
  id: 'conta-1',
  empresa_id: 'empresa-1',
  nome: 'Conta Teste',
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
};

describe('ContaCorrenteFormPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveContaCorrenteMock.mockResolvedValue(baseConta);
  });

  it('salva saldo inicial negativo quando permite_saldo_negativo está ativo', async () => {
    render(
      <ContaCorrenteFormPanel
        conta={{ ...baseConta, permite_saldo_negativo: true }}
        onSaveSuccess={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/Saldo Inicial/i), {
      target: { value: '-100,00' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Salvar/i }));

    await waitFor(() => {
      expect(saveContaCorrenteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          saldo_inicial: -100,
          permite_saldo_negativo: true,
        })
      );
    });
  });

  it('bloqueia salvar saldo inicial negativo quando permite_saldo_negativo está inativo', async () => {
    render(
      <ContaCorrenteFormPanel
        conta={{ ...baseConta, saldo_inicial: -10, permite_saldo_negativo: false }}
        onSaveSuccess={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Salvar/i }));

    await waitFor(() => {
      expect(addToastMock).toHaveBeenCalledWith(
        'Saldo negativo não permitido. Ative a opção para permitir.',
        'error'
      );
    });
    expect(saveContaCorrenteMock).not.toHaveBeenCalled();
  });
});
