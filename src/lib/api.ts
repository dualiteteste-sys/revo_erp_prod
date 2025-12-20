// src/lib/api.ts
// Helper para RPC usando o cliente oficial supabase-js.
// Evita 401 por headers manuais e padroniza erros/logs.

import { supabase } from "@/lib/supabaseClient"; // mantenha seu caminho atual
import { logger } from "@/lib/logger";

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

export async function callRpc<T = unknown>(fn: string, args: RpcArgs = {}): Promise<T> {
  const { data, error, status } = await supabase.rpc(fn, args);

  if (error) {
    const msg = error.message || "RPC_ERROR";
    const details = (error as any).details ?? null;

    logger.error("[RPC][ERROR]", error, { fn, status, message: msg, details });

    if (/Invalid API key/i.test(msg)) {
      throw new RpcError(
        "HTTP_401: Invalid API key — confira VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY e reinicie o dev server.",
        { status, details }
      );
    }
    if (/JWT/i.test(msg) && status === 401) {
      throw new RpcError(
        "HTTP_401: JWT inválido/ausente — garanta que o usuário está autenticado.",
        { status, details }
      );
    }

    throw new RpcError(`HTTP_${status}: ${msg}`, { status, details });
  }

  return data as T;
}
