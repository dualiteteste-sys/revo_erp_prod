import { supabase } from '@/lib/supabaseClient';
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
}> {
  const now = new Date();
  const currentStart = startOfMonth(now);
  const currentEnd = endOfMonth(now);

  const prevMonth = subMonths(now, 1);
  const prevStart = startOfMonth(prevMonth);
  const prevEnd = endOfMonth(prevMonth);

  const [current, previous, activitiesRes] = await Promise.all([
    getVendasDashboardStats({ startDate: toIsoDate(currentStart), endDate: toIsoDate(currentEnd) }),
    getVendasDashboardStats({ startDate: toIsoDate(prevStart), endDate: toIsoDate(prevEnd) }),
    supabase
      .from('app_logs' as any)
      .select('id, level, source, event, message, created_at')
      .order('created_at', { ascending: false })
      .limit(params?.activitiesLimit ?? 12),
  ]);

  if (activitiesRes.error) throw activitiesRes.error;

  return {
    current,
    previous,
    activities: (activitiesRes.data ?? []) as DashboardActivity[],
  };
}

