import { callRpc } from '@/lib/api';
import { logger } from '@/lib/logger';
import { getVendasDashboardStats, type VendasDashboardStats } from '@/services/salesDashboard';
import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';

export type DashboardActivity = {
  id: string;
  level: 'info' | 'warn' | 'error';
  source: string;
  event: string;
  message: string;
  created_at: string;
};

export type FinanceiroFluxoCaixaItem = {
  mes: string;
  receber: number;
  pagar: number;
};

export type FinanceiroFluxoCaixaCenteredItem = {
  mes: string;
  mes_iso: string;
  receber_realizado: number;
  receber_previsto: number;
  pagar_realizado: number;
  pagar_previsto: number;
  is_past: boolean;
  is_current: boolean;
  saldo_inicial_cc?: number;  // Saldo atual das contas correntes (apenas no primeiro registro)
};


export type FinanceiroAlertas = {
  atrasados: {
    receber: { qtd: number; valor: number };
    pagar: { qtd: number; valor: number };
  };
  hoje: {
    receber: { qtd: number; valor: number };
    pagar: { qtd: number; valor: number };
  };
};

function toIsoDate(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

export async function getMainDashboardData(params?: { activitiesLimit?: number }): Promise<{
  current: VendasDashboardStats;
  previous: VendasDashboardStats;
  activities: DashboardActivity[];
  financeiroPagarReceber3m: { mes: string; receber: number; pagar: number }[];
  financeiroAlertas: FinanceiroAlertas | null;
}> {
  const includeActivities = params?.activitiesLimit !== 0;

  const now = new Date();
  const currentStart = startOfMonth(now);
  const currentEnd = endOfMonth(now);

  const prevMonth = subMonths(now, 1);
  const prevStart = startOfMonth(prevMonth);
  const prevEnd = endOfMonth(prevMonth);

  const financeiroPagarReceber3mPromise = (async () => {
    try {
      const rows = await callRpc<{ mes: string; receber: number; pagar: number }[]>(
        'financeiro_dashboard_pagar_receber_3m'
      );
      return rows ?? [];
    } catch (e: any) {
      // Best-effort: o dashboard não deve quebrar caso o financeiro não esteja configurado.
      logger.warn('[Dashboard][FIN] erro ao carregar pagar/receber (3m)', { message: e?.message || String(e || '') });
      return [];
    }
  })();

  const financeiroAlertasPromise = (async () => {
    try {
      return await callRpc<FinanceiroAlertas>('financeiro_alertas_vencimentos');
    } catch (e: any) {
      logger.warn('[Dashboard][FIN] erro ao carregar alertas', { message: e?.message });
      return null;
    }
  })();

  const activitiesPromise = includeActivities
    ? (async () => {
      try {
        const rows = await callRpc<DashboardActivity[]>('dashboard_activity_feed', {
          p_limit: params?.activitiesLimit ?? 12,
        });
        return rows ?? [];
      } catch (e: any) {
        // Best-effort: logs são informativos; não quebrar o dashboard nem sujar console.
        logger.warn('[Dashboard][LOGS] erro ao carregar atividades', { message: e?.message || String(e || '') });
        return [];
      }
    })()
    : Promise.resolve([] as DashboardActivity[]);

  const [current, previous, activities, financeiroPagarReceber3m, financeiroAlertas] = await Promise.all([
    getVendasDashboardStats({ startDate: toIsoDate(currentStart), endDate: toIsoDate(currentEnd) }),
    getVendasDashboardStats({ startDate: toIsoDate(prevStart), endDate: toIsoDate(prevEnd) }),
    activitiesPromise,
    financeiroPagarReceber3mPromise,
    financeiroAlertasPromise,
  ]);

  return {
    current,
    previous,
    activities,
    financeiroPagarReceber3m,
    financeiroAlertas,
  };
}

export async function getFinanceiroFluxoCaixaCustom(months: number) {
  return callRpc<FinanceiroFluxoCaixaItem[]>('financeiro_fluxo_caixa_custom', { p_months: months });
}

export async function getFinanceiroFluxoCaixaCentered(months: number) {
  return callRpc<FinanceiroFluxoCaixaCenteredItem[]>('financeiro_fluxo_caixa_centered', { p_months: months });
}
