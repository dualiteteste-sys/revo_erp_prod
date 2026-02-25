import type { FinanceiroFluxoCaixaCenteredItem } from '@/services/mainDashboard';

export type DashboardFluxoCaixaChartDataItem = {
  mes: string;
  mes_iso: string;
  receber: number;
  pagar: number;
  saldo: number;
  is_past: boolean;
  is_current: boolean;
  receber_realizado: number;
  receber_previsto: number;
  pagar_realizado: number;
  pagar_previsto: number;
};

export function buildDashboardFluxoCaixaChartData(rows: FinanceiroFluxoCaixaCenteredItem[]): {
  chartData: DashboardFluxoCaixaChartDataItem[];
  currentMonthIndex: number;
} {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { chartData: [], currentMonthIndex: -1 };
  }

  const saldoInicialJanela =
    rows.find((r) => (r.saldo_inicial_cc || 0) !== 0)?.saldo_inicial_cc
    ?? rows[0]?.saldo_inicial_cc
    ?? 0;

  const enrichedBase: Omit<DashboardFluxoCaixaChartDataItem, 'saldo'>[] = rows.map((item) => {
    const receberRealizado = Number(item.receber_realizado || 0);
    const receberPrevisto = Number(item.receber_previsto || 0);
    const pagarRealizado = Number(item.pagar_realizado || 0);
    const pagarPrevisto = Number(item.pagar_previsto || 0);

    const receber = item.is_past
      ? receberRealizado
      : receberRealizado + receberPrevisto;
    const pagar = item.is_past
      ? pagarRealizado
      : pagarRealizado + pagarPrevisto;

    return {
      mes: item.mes,
      mes_iso: item.mes_iso,
      receber,
      pagar,
      is_past: !!item.is_past,
      is_current: !!item.is_current,
      receber_realizado: receberRealizado,
      receber_previsto: receberPrevisto,
      pagar_realizado: pagarRealizado,
      pagar_previsto: pagarPrevisto,
    };
  });

  const idxCurrent = enrichedBase.findIndex((r) => r.is_current);

  let saldoAcumulado = Number(saldoInicialJanela || 0);
  const chartData = enrichedBase.map((item) => {
    saldoAcumulado += item.receber - item.pagar;
    return { ...item, saldo: saldoAcumulado };
  });

  return { chartData, currentMonthIndex: idxCurrent };
}

