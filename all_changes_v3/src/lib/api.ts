// src/lib/api.ts
// Helper para RPC usando o cliente oficial supabase-js.
// Evita 401 por headers manuais e padroniza erros/logs.

import { supabase } from "@/lib/supabaseClient"; // mantenha seu caminho atual

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
  const correlationId = crypto.randomUUID();
  // Pass correlation ID via custom header if supported by Supabase client config, 
  // or just log it. Since Supabase client global headers are static, we can't easily inject per-request headers 
  // without creating a new client or using a specific overload if available.
  // However, for debugging, logging it here is the first step.
  // To actually send it to the server, we would need to use `supabase.functions.invoke` or similar, 
  // but `rpc` uses PostgREST. PostgREST allows `Accept-Profile` etc but custom headers might need 
  // `options: { head: { ... } }` if the SDK supports it. 
  // Checking SDK types: rpc(fn, args, { count, head, ... })

  const { data, error, status } = await supabase.rpc(fn, args, {
    count: null,
    head: { 'x-correlation-id': correlationId }
  });

  if (error) {
    const msg = error.message || "RPC_ERROR";
    const details = (error as any).details ?? null;

    console.error("[RPC][ERROR]", fn, `HTTP_${status}`, msg, { message: msg, details, correlationId });

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
