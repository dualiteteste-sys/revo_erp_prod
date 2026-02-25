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

  const saldoAtual =
    rows.find((r) => (r.saldo_atual_cc || 0) !== 0)?.saldo_atual_cc
    ?? rows[0]?.saldo_atual_cc
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

  // Âncora de saldo (estado-da-arte): a linha precisa bater com o saldo real no "mês atual".
  // Caso `saldo_atual_cc` exista, ajusta o saldo inicial para que o ponto do mês atual coincida.
  const anchorEnabled = idxCurrent >= 0 && Number(saldoAtual || 0) !== 0;
  const cumulativeNetToCurrent = anchorEnabled
    ? enrichedBase.slice(0, idxCurrent + 1).reduce((acc, item) => acc + (item.receber - item.pagar), 0)
    : 0;
  const saldoInicialParaGrafico = anchorEnabled
    ? Number(saldoAtual || 0) - cumulativeNetToCurrent
    : Number(saldoInicialJanela || 0);

  let saldoAcumulado = saldoInicialParaGrafico;
  const chartData = enrichedBase.map((item) => {
    saldoAcumulado += item.receber - item.pagar;
    return { ...item, saldo: saldoAcumulado };
  });

  return { chartData, currentMonthIndex: idxCurrent };
}
