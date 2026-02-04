import { supabase } from '@/lib/supabaseClient';
import { getLastRequestId } from '@/lib/requestId';
import { logger } from '@/lib/logger';

function safeErrorMessage(err: unknown): string {
  try {
    if (err instanceof Error) return err.message || err.name;
    return String(err);
  } catch {
    return 'unknown_error';
  }
}

export async function traceAction<T>(
  action: string,
  fn: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<T> {
  const actionId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `act_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const startedAt = Date.now();

  let ok = true;
  let errMessage: string | null = null;
  try {
    return await fn();
  } catch (err) {
    ok = false;
    errMessage = safeErrorMessage(err);
    throw err;
  } finally {
    const durationMs = Date.now() - startedAt;
    void (async () => {
      try {
        await (supabase as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => Promise<unknown> }).rpc('log_app_trace', {
          p_action: action,
          p_status: ok ? 'ok' : 'error',
          p_duration_ms: durationMs,
          p_context: { ...(context ?? {}), action_id: actionId },
          p_error: errMessage,
          p_request_id: getLastRequestId(),
          p_action_id: actionId,
          p_source: 'ui',
        });
      } catch {
        // ignore: tracing can't break UX
      }
    })();
    logger.info('[TRACE]', {
      action,
      action_id: actionId,
      duration_ms: durationMs,
      request_id: getLastRequestId(),
      ok,
    });
  }
}
