// src/lib/api.ts
// Helper para RPC usando o cliente oficial supabase-js.
// Evita 401 por headers manuais e padroniza erros/logs.

import { supabase } from "@/lib/supabaseClient"; // mantenha seu caminho atual
import { logger } from "@/lib/logger";
import { getLastRequestId } from "@/lib/requestId";
import { withRetry } from "@/lib/retry";
import { logRpcMetric, maybeLogFirstValue } from "@/lib/metrics";

type RpcArgs = Record<string, any>;

export class RpcError extends Error {
  status?: number;
  details?: string | null;
  constructor(message: string, opts?: { status?: number; details?: string | null }) {
    super(message);
    this.name = "RpcError";
    this.status = opts?.status;
    this.details = opts?.details ?? null;
  }
}

function isRetryableRpcFailure(status: number | undefined, message: string): boolean {
  const msg = String(message || "");
  if (status === 0 && /(failed to fetch|networkerror|load failed)/i.test(msg)) return true;
  if (status === 408) return true;
  if (status === 429) return true;
  if (status && status >= 500) return true;
  return false;
}

export async function callRpc<T = unknown>(fn: string, args: RpcArgs = {}): Promise<T> {
  return withRetry(
    async (attempt) => {
      const startedAt = performance.now();
      const { data, error, status } = await supabase.rpc(fn, args);
      const durationMs = performance.now() - startedAt;

      if (!error) {
        logRpcMetric({ fn, ok: true, status, durationMs, attempt });
        maybeLogFirstValue();
        return data as T;
      }

      const msg = error.message || "RPC_ERROR";
      const details = (error as any).details ?? null;
      const request_id = getLastRequestId();

      const transient = isRetryableRpcFailure(status, msg);
      const willRetry = transient && attempt < 3;

      logRpcMetric({ fn, ok: false, status, durationMs, attempt });

      if (transient) {
        logger.warn("[RPC][TRANSIENT]", { fn, attempt, status, message: msg, details, request_id, willRetry });
      } else {
        logger.error("[RPC][ERROR]", error, { fn, attempt, status, message: msg, details, request_id });
      }

      if (/Invalid API key/i.test(msg)) {
        throw new RpcError(
          "HTTP_401: Invalid API key — confira VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY e reinicie o dev server.",
          { status, details }
        );
      }
      if (/JWT/i.test(msg) && status === 401) {
        throw new RpcError("HTTP_401: JWT inválido/ausente — garanta que o usuário está autenticado.", { status, details });
      }

      throw new RpcError(`HTTP_${status}: ${msg}`, { status, details });
    },
    {
      maxAttempts: 3,
      baseDelayMs: 400,
      maxDelayMs: 5000,
      jitterRatio: 0.3,
      shouldRetry: (err) => {
        if (!(err instanceof RpcError)) return false;
        return isRetryableRpcFailure(err.status, err.message);
      },
    }
  );
}
