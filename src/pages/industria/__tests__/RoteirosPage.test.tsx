import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import RoteirosPage from '@/pages/industria/RoteirosPage';

vi.mock('@/services/industriaRoteiros', async () => {
  const actual = await vi.importActual<any>('@/services/industriaRoteiros');
  return {
    ...actual,
    listRoteiros: vi.fn().mockResolvedValue([
      {
        id: 'rot-1',
        produto_id: 'prod-1',
        produto_nome: 'Parafuso sextavado 6mm x 20mm',
        tipo_bom: 'beneficiamento',
        codigo: 'ROT-PONTA-ROSCA',
        descricao: 'Ponta + Rosca',
        versao: '1.0',
        ativo: true,
        padrao_para_producao: false,
        padrao_para_beneficiamento: true,
      },
    ]),
    seedRoteiros: vi.fn(),
    deleteRoteiro: vi.fn(),
    getRoteiroDetails: vi.fn(),
  };
});

describe('RoteirosPage', () => {
  it('renders existing roteiros', async () => {
    renderWithProviders(<RoteirosPage />);

    expect(await screen.findByText('Parafuso sextavado 6mm x 20mm')).toBeInTheDocument();
    expect(await screen.findByText(/v1\.0/i)).toBeInTheDocument();
  });
});

