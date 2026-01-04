import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { getLastRequestId } from '@/lib/requestId';

type RpcMetric = {
  fn: string;
  ok: boolean;
  status?: number;
  durationMs: number;
  attempt?: number;
};

const sessionStartMs = (() => {
  try {
    return performance.now();
  } catch {
    return Date.now();
  }
})();

const MAX_METRICS_PER_SESSION = 200;
let metricsSent = 0;
let firstValueLogged = false;

function shouldSample(sampleRate: number) {
  if (sampleRate >= 1) return true;
  if (sampleRate <= 0) return false;
  return Math.random() < sampleRate;
}

async function logMetric(event: string, message: string, context: Record<string, unknown>) {
  if (!supabase) return;
  if (metricsSent >= MAX_METRICS_PER_SESSION) return;
  metricsSent += 1;

  try {
    await supabase.rpc('log_app_event', {
      p_level: 'info',
      p_event: event,
      p_message: message,
      p_context: {
        ...context,
        request_id: getLastRequestId(),
      },
      p_source: 'ui',
    });
  } catch (e: any) {
    logger.warn('[METRICS][LOG_FAILED]', { event, message, err: e?.message });
  }
}

export function logRpcMetric(metric: RpcMetric) {
  if (!shouldSample(0.25)) return; // reduz custo (amostragem)
  void logMetric('metric.rpc', `RPC ${metric.fn}`, {
    fn: metric.fn,
    ok: metric.ok,
    status: metric.status ?? null,
    duration_ms: Math.max(0, Math.round(metric.durationMs)),
    attempt: metric.attempt ?? 1,
  });
}

export function maybeLogFirstValue() {
  if (firstValueLogged) return;
  firstValueLogged = true;

  const valueMs = (() => {
    try {
      return Math.max(0, Math.round(performance.now() - sessionStartMs));
    } catch {
      return 0;
    }
  })();

  void logMetric('metric.first_value', 'First value', { value_ms: valueMs });
}

