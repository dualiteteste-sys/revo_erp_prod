import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import CompraFormPanel from '@/components/suprimentos/compras/CompraFormPanel';

vi.mock('@/components/common/SupplierAutocomplete', () => ({
  default: ({ initialName }: any) => <div>SupplierAutocomplete:{initialName ?? ''}</div>,
}));

vi.mock('@/components/os/ItemAutocomplete', () => ({
  default: () => <div>ItemAutocomplete</div>,
}));

vi.mock('@/components/financeiro/parcelamento/ParcelamentoDialog', () => ({
  default: () => null,
}));

vi.mock('@/services/financeiroParcelamento', () => ({
  createParcelamentoFromCompra: vi.fn().mockResolvedValue({ ok: true, count: 0, contas_ids: [] }),
}));

vi.mock('@/services/suprimentos', async () => {
  const actual = await vi.importActual<any>('@/services/suprimentos');
  return { ...actual, getRelatorioBaixoEstoque: vi.fn().mockResolvedValue([]) };
});

vi.mock('@/services/industriaProducao', async () => {
  const actual = await vi.importActual<any>('@/services/industriaProducao');
  return { ...actual, listMrpDemandas: vi.fn().mockResolvedValue([]) };
});

vi.mock('@/services/compras', async () => {
  const actual = await vi.importActual<any>('@/services/compras');
  return {
    ...actual,
    getCompraDetails: vi.fn(),
    saveCompra: vi.fn(),
    manageCompraItem: vi.fn(),
    receberCompra: vi.fn(),
  };
});

describe('CompraFormPanel', () => {
  it('renderiza sem crash ao criar nova compra', () => {
    renderWithProviders(<CompraFormPanel compraId={null} onSaveSuccess={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/Dados do Pedido/i)).toBeInTheDocument();
  });
});

