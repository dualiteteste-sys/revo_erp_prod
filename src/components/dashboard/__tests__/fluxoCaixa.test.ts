import { describe, expect, it } from 'vitest';
import { buildDashboardFluxoCaixaChartData } from '@/components/dashboard/fluxoCaixa';
import type { FinanceiroFluxoCaixaCenteredItem } from '@/services/mainDashboard';

describe('buildDashboardFluxoCaixaChartData', () => {
  it('calcula receber/pagar por mês e saldo acumulado a partir do saldo inicial da janela', () => {
    const rows: FinanceiroFluxoCaixaCenteredItem[] = [
      {
        mes: 'Jan/26',
        mes_iso: '2026-01',
        receber_realizado: 200,
        receber_previsto: 0,
        pagar_realizado: 50,
        pagar_previsto: 0,
        is_past: true,
        is_current: false,
        saldo_inicial_cc: 1000,
      },
      {
        mes: 'Fev/26',
        mes_iso: '2026-02',
        receber_realizado: 100,
        receber_previsto: 300,
        pagar_realizado: 80,
        pagar_previsto: 20,
        is_past: false,
        is_current: true,
        saldo_inicial_cc: 0,
      },
      {
        mes: 'Mar/26',
        mes_iso: '2026-03',
        receber_realizado: 0,
        receber_previsto: 500,
        pagar_realizado: 0,
        pagar_previsto: 200,
        is_past: false,
        is_current: false,
        saldo_inicial_cc: 0,
      },
    ];

    const { chartData, currentMonthIndex } = buildDashboardFluxoCaixaChartData(rows);

    expect(currentMonthIndex).toBe(1);
    expect(chartData).toHaveLength(3);

    // Jan (passado): usa apenas realizado
    expect(chartData[0]).toMatchObject({
      mes: 'Jan/26',
      receber: 200,
      pagar: 50,
      saldo: 1150,
      receber_realizado: 200,
      receber_previsto: 0,
      pagar_realizado: 50,
      pagar_previsto: 0,
      is_past: true,
      is_current: false,
    });

    // Fev (atual): usa realizado + previsto
    expect(chartData[1]).toMatchObject({
      mes: 'Fev/26',
      receber: 400,
      pagar: 100,
      saldo: 1450,
      receber_realizado: 100,
      receber_previsto: 300,
      pagar_realizado: 80,
      pagar_previsto: 20,
      is_past: false,
      is_current: true,
    });

    // Mar (futuro): previsto (realizado=0)
    expect(chartData[2]).toMatchObject({
      mes: 'Mar/26',
      receber: 500,
      pagar: 200,
      saldo: 1750,
      receber_realizado: 0,
      receber_previsto: 500,
      pagar_realizado: 0,
      pagar_previsto: 200,
      is_past: false,
      is_current: false,
    });
  });

  it('retorna vazio quando não há linhas', () => {
    const { chartData, currentMonthIndex } = buildDashboardFluxoCaixaChartData([]);
    expect(chartData).toEqual([]);
    expect(currentMonthIndex).toBe(-1);
  });
});

