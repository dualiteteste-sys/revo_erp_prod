import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import StatusBeneficiamentosPage from '@/pages/industria/StatusBeneficiamentosPage';

vi.mock('@/services/industria', async () => {
  const actual = await vi.importActual<any>('@/services/industria');
  return {
    ...actual,
    listOrdens: vi.fn().mockResolvedValue([
      {
        id: 'ordem-ben-1',
        numero: 456,
        tipo_ordem: 'beneficiamento',
        produto_nome: 'Parafuso',
        cliente_nome: 'Metalúrgica Alfa',
        quantidade_planejada: 200,
        unidade: 'un',
        status: 'em_beneficiamento',
        prioridade: 0,
        data_prevista_entrega: null,
        total_entregue: 0,
        created_at: '2026-01-01T10:00:00.000Z',
        qtde_caixas: 10,
        numero_nf: '123',
        pedido_numero: 'PED-9',
      },
    ]),
  };
});

describe('StatusBeneficiamentosPage', () => {
  it('renderiza tabela e permite ver dados principais', async () => {
    renderWithProviders(<StatusBeneficiamentosPage />, { route: '/app/industria/status-beneficiamentos' });

    expect(await screen.findByText('Status de Beneficiamentos')).toBeInTheDocument();
    expect(await screen.findByText('Metalúrgica Alfa')).toBeInTheDocument();
    expect(await screen.findByText('456')).toBeInTheDocument();
    expect(await screen.findByText('123')).toBeInTheDocument();
    expect(await screen.findByText('PED-9')).toBeInTheDocument();
  });
});

