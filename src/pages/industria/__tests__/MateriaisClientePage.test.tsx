import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import MateriaisClientePage from '@/pages/industria/MateriaisClientePage';

vi.mock('@/services/industriaMateriais', async () => {
  const actual = await vi.importActual<any>('@/services/industriaMateriais');
  return {
    ...actual,
    listMateriaisCliente: vi.fn().mockResolvedValue({ data: [], count: 0 }),
    seedMateriaisCliente: vi.fn().mockResolvedValue(undefined),
    deleteMaterialCliente: vi.fn().mockResolvedValue(undefined),
  };
});

describe('MateriaisClientePage', () => {
  it('opens Importar XML modal', async () => {
    renderWithProviders(<MateriaisClientePage />);

    const btn = await screen.findByRole('button', { name: /Importar XML/i });
    await waitFor(() => expect(btn).not.toBeDisabled());
    fireEvent.click(btn);

    expect(await screen.findByText(/Arraste o XML da NF-e aqui/i)).toBeInTheDocument();
  });
});
