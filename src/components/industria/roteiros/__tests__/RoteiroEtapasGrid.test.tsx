import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import RoteiroEtapasGrid from '@/components/industria/roteiros/RoteiroEtapasGrid';

vi.mock('@/services/industriaCentros', async () => {
  const actual = await vi.importActual<any>('@/services/industriaCentros');
  return {
    ...actual,
    listCentrosTrabalho: vi.fn().mockResolvedValue([
      {
        id: 'ct-1',
        nome: 'Maquina 1',
        codigo: 'MAQ-1',
        descricao: null,
        ativo: true,
        capacidade_unidade_hora: 70,
        capacidade_horas_dia: 8,
        tipo_uso: 'ambos',
        tempo_setup_min: 120,
        requer_inspecao_final: false,
      },
    ]),
  };
});

vi.mock('@/services/industriaRoteiros', async () => {
  const actual = await vi.importActual<any>('@/services/industriaRoteiros');
  return {
    ...actual,
    manageRoteiroEtapa: vi.fn(),
  };
});

describe('RoteiroEtapasGrid', () => {
  it('autopreenche ciclo (min/un) a partir da capacidade do centro de trabalho', async () => {
    renderWithProviders(<RoteiroEtapasGrid roteiroId="rot-1" etapas={[]} onUpdate={() => { }} />);

    fireEvent.click(await screen.findByRole('button', { name: /adicionar etapa/i }));

    await screen.findByRole('option', { name: /maquina 1/i });
    const [centroSelect] = await screen.findAllByRole('combobox');
    fireEvent.change(centroSelect, { target: { value: 'ct-1' } });

    // 70 un/h => 60/70 = 0,8571 min/un
    expect(await screen.findByDisplayValue('0,8571')).toBeInTheDocument();
  });
});
