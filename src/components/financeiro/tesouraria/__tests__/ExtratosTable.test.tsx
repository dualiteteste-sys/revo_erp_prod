import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ExtratosTable from '../ExtratosTable';
import type { ExtratoItem } from '@/services/treasury';

function buildExtrato(overrides: Partial<ExtratoItem> = {}): ExtratoItem {
  return {
    id: 'extrato-1',
    data_lancamento: '2026-02-10',
    descricao: 'Resgate aplicação',
    documento_ref: null,
    tipo_lancamento: 'credito',
    valor: 50,
    saldo_apos_lancamento: null,
    conciliado: false,
    movimentacao_id: null,
    movimentacao_data: null,
    movimentacao_descricao: null,
    movimentacao_valor: null,
    ...overrides,
  };
}

describe('ExtratosTable - assistência de transferência interna', () => {
  it('exibe ação rápida "Vincular transferência" para detecção única', () => {
    const onConciliate = vi.fn();
    const onUnconciliate = vi.fn();
    const onQuickLinkTransfer = vi.fn();
    const extrato = buildExtrato();

    render(
      <ExtratosTable
        extratos={[extrato]}
        onConciliate={onConciliate}
        onUnconciliate={onUnconciliate}
        transferAssistByExtratoId={{
          [extrato.id]: {
            kind: 'detected_unique',
            movimentacaoId: 'mov-123',
            candidatesCount: 1,
          },
        }}
        onQuickLinkTransfer={onQuickLinkTransfer}
      />,
    );

    expect(screen.getByText(/Transferência interna detectada/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Vincular transferência/i }));

    expect(onQuickLinkTransfer).toHaveBeenCalledWith(extrato, 'mov-123');
    expect(onConciliate).not.toHaveBeenCalled();
  });

  it('mostra status explícito e botão Desfazer quando já conciliado por transferência', () => {
    const onConciliate = vi.fn();
    const onUnconciliate = vi.fn();
    const extrato = buildExtrato({
      id: 'extrato-2',
      conciliado: true,
      movimentacao_id: 'mov-777',
      movimentacao_data: '2026-02-10',
      movimentacao_descricao: 'Resgate',
      movimentacao_valor: 50,
    });

    render(
      <ExtratosTable
        extratos={[extrato]}
        onConciliate={onConciliate}
        onUnconciliate={onUnconciliate}
        transferAssistByExtratoId={{
          [extrato.id]: {
            kind: 'conciliated_transfer',
            movimentacaoId: 'mov-777',
          },
        }}
      />,
    );

    expect(screen.getByText(/Conciliado por transferência interna/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Desfazer/i }));

    expect(onUnconciliate).toHaveBeenCalledWith(extrato);
  });
});
