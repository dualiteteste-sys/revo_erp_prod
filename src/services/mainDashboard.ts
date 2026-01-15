import { supabase } from '@/lib/supabaseClient';
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

function toIsoDate(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

export async function getMainDashboardData(params?: { activitiesLimit?: number }): Promise<{
  current: VendasDashboardStats;
  previous: VendasDashboardStats;
  activities: DashboardActivity[];
  financeiroPagarReceber3m: { mes: string; receber: number; pagar: number }[];
}> {
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

  const [current, previous, activitiesRes, financeiroPagarReceber3m] = await Promise.all([
    getVendasDashboardStats({ startDate: toIsoDate(currentStart), endDate: toIsoDate(currentEnd) }),
    getVendasDashboardStats({ startDate: toIsoDate(prevStart), endDate: toIsoDate(prevEnd) }),
    supabase
      .from('app_logs' as any)
      .select('id, level, source, event, message, created_at')
      .order('created_at', { ascending: false })
      .limit(params?.activitiesLimit ?? 12),
    financeiroPagarReceber3mPromise,
  ]);

  if (activitiesRes.error) throw activitiesRes.error;

  return {
    current,
    previous,
    activities: (activitiesRes.data ?? []) as DashboardActivity[],
    financeiroPagarReceber3m,
  };
}
