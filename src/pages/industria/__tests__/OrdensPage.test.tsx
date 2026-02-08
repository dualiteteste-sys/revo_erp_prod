import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import OrdensPage from '@/pages/industria/OrdensPage';
import { listOrdensProducao } from '@/services/industriaProducao';

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
        quantidade_planejada: 100,
        unidade: 'un',
        status: 'planejada',
        prioridade: 0,
        data_prevista_entrega: null,
        total_entregue: 0,
      },
    ]),
    cloneOrdem: vi.fn(),
  };
});

vi.mock('@/services/industriaProducao', async () => {
  const actual = await vi.importActual<any>('@/services/industriaProducao');
  return {
    ...actual,
    listOrdensProducao: vi.fn().mockResolvedValue([
      {
        id: 'ordem-op-1',
        numero: 123,
        produto_nome: 'Parafuso',
        quantidade_planejada: 100,
        unidade: 'un',
        status: 'planejada',
        prioridade: 0,
        data_prevista_entrega: null,
        total_entregue: 0,
        percentual_concluido: 0,
      },
    ]),
  };
});

describe('OrdensPage (OP/OB)', () => {
  it('lists industrializacao using producao RPC', async () => {
    renderWithProviders(<OrdensPage />, { route: '/app/industria/ordens?tipo=industrializacao' });

    await waitFor(() => expect(listOrdensProducao).toHaveBeenCalled());
  });

  it('lists beneficiamento using OP/OB RPC', async () => {
    renderWithProviders(<OrdensPage />, { route: '/app/industria/ordens?tipo=beneficiamento' });

    expect(await screen.findByText('456')).toBeInTheDocument();
    expect(await screen.findByText('Metalúrgica Alfa')).toBeInTheDocument();
  });
});
