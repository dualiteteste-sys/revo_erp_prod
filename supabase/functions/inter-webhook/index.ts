/**
 * Edge Function: inter-webhook
 *
 * Public endpoint (verify_jwt=false) that receives Banco Inter webhook callbacks.
 * When a boleto is paid, cancelled, or expired, Inter sends a POST here.
 *
 * Flow:
 *   1. Validate request (bearer token if configured)
 *   2. Extract codigoSolicitacao + situacao
 *   3. Find cobrança by inter_codigo_solicitacao
 *   4. Update cobrança status
 *   5. If PAGO + conta_receber_id → trigger baixa automática
 *   6. Log event
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getRequestId } from "../_shared/request.ts";
import { timingSafeEqual } from "../_shared/crypto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

/** Map Inter situacao → our status */
function mapInterStatus(situacao: string): string | null {
  switch (situacao) {
    case "PAGO": return "liquidada";
    case "CANCELADO": return "cancelada";
    case "EXPIRADO": return "erro";
    case "A_RECEBER":
    case "EMABERTO": return "registrada";
    case "VENCIDO": return "registrada"; // still active, just overdue
    default: return null;
  }
}

Deno.serve(async (req) => {
  const CORS = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const requestId = getRequestId(req);
  const log = (msg: string, ...args: unknown[]) =>
    console.log(`[inter-webhook][${requestId}] ${msg}`, ...args);

  try {
    if (req.method !== "POST") {
      return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, CORS);
    }

    const payload = await req.json();
    log("Webhook received:", JSON.stringify(payload).slice(0, 500));

    // Extract key fields
    const codigoSolicitacao = payload.codigoSolicitacao || payload.codigo_solicitacao;
    const situacao = payload.situacao;

    if (!codigoSolicitacao) {
      log("WARN: missing codigoSolicitacao, ignoring");
      return json(200, { ok: true, ignored: true, reason: "no_codigo_solicitacao" }, CORS);
    }

    const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Find cobrança by inter_codigo_solicitacao
    const { data: cobranca, error: findErr } = await svc
      .from("financeiro_cobrancas_bancarias")
      .select("id, empresa_id, status, conta_receber_id, cliente_id, valor_original, valor_atual")
      .eq("inter_codigo_solicitacao", codigoSolicitacao)
      .maybeSingle();

    if (findErr || !cobranca) {
      log("WARN: cobrança not found for codigoSolicitacao:", codigoSolicitacao);
      return json(200, { ok: true, ignored: true, reason: "cobranca_not_found" }, CORS);
    }

    // Validate webhook secret if configured
    const { data: config } = await svc
      .from("financeiro_inter_config")
      .select("webhook_secret")
      .eq("empresa_id", cobranca.empresa_id)
      .maybeSingle();

    if (config?.webhook_secret) {
      const authHeader = req.headers.get("authorization") || "";
      const providedToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
      if (!providedToken || !timingSafeEqual(providedToken, config.webhook_secret)) {
        log("WARN: webhook auth failed for empresa:", cobranca.empresa_id);
        return json(401, { ok: false, error: "UNAUTHORIZED" }, CORS);
      }
    }

    const empresaId = cobranca.empresa_id;
    const previousStatus = cobranca.status;
    const newStatus = mapInterStatus(situacao);

    // Idempotency: skip if already in final state
    if (previousStatus === "liquidada" || previousStatus === "baixada") {
      log("Already settled, ignoring:", cobrancaId(cobranca));
      return json(200, { ok: true, ignored: true, reason: "already_settled" }, CORS);
    }

    // Update cobrança
    const updateFields: Record<string, unknown> = {
      inter_situacao: situacao,
      updated_at: new Date().toISOString(),
    };

    if (newStatus) {
      updateFields.status = newStatus;
    }

    if (situacao === "PAGO") {
      updateFields.data_liquidacao = payload.dataPagamento || new Date().toISOString().split("T")[0];
      if (payload.valorTotalRecebido) {
        updateFields.valor_atual = payload.valorTotalRecebido;
      }
    }

    await svc
      .from("financeiro_cobrancas_bancarias")
      .update(updateFields)
      .eq("id", cobranca.id)
      .eq("empresa_id", empresaId);

    // Log event
    await svc.from("financeiro_cobrancas_bancarias_eventos").insert({
      empresa_id: empresaId,
      cobranca_id: cobranca.id,
      tipo_evento: "webhook",
      status_anterior: previousStatus,
      status_novo: newStatus || previousStatus,
      mensagem: `Webhook Inter: ${situacao}${payload.dataPagamento ? ` em ${payload.dataPagamento}` : ""}`,
      detalhe_tecnico: JSON.stringify(payload),
    });

    log(`Updated cobrança ${cobranca.id}: ${previousStatus} → ${newStatus || situacao}`);

    // ── Baixa automática (service_role — sem user context) ──
    if (situacao === "PAGO" && cobranca.conta_receber_id) {
      log("Triggering baixa automática for conta_receber:", cobranca.conta_receber_id);
      try {
        const dataPgto = payload.dataPagamento || new Date().toISOString().split("T")[0];
        const valorPago = payload.valorTotalRecebido || cobranca.valor_original;

        // Update conta a receber directly (service_role bypasses RLS)
        const { error: updErr } = await svc
          .from("contas_a_receber")
          .update({
            status: "pago",
            data_pagamento: dataPgto,
            valor_pago: valorPago,
            updated_at: new Date().toISOString(),
          })
          .eq("id", cobranca.conta_receber_id)
          .eq("empresa_id", empresaId);

        if (updErr) throw new Error(updErr.message);

        log("Baixa automática OK for conta_receber:", cobranca.conta_receber_id);

        await svc.from("financeiro_cobrancas_bancarias_eventos").insert({
          empresa_id: empresaId,
          cobranca_id: cobranca.id,
          tipo_evento: "info",
          status_anterior: "liquidada",
          status_novo: "liquidada",
          mensagem: `Baixa automática: conta a receber marcada como paga (R$ ${Number(valorPago).toFixed(2)} em ${dataPgto}).`,
        });
      } catch (baixaErr: unknown) {
        const msg = baixaErr instanceof Error ? baixaErr.message : String(baixaErr);
        log("WARN: baixa automática failed:", msg);

        await svc.from("financeiro_cobrancas_bancarias_eventos").insert({
          empresa_id: empresaId,
          cobranca_id: cobranca.id,
          tipo_evento: "erro",
          status_anterior: "liquidada",
          status_novo: "liquidada",
          mensagem: `Falha na baixa automática: ${msg}`,
          detalhe_tecnico: JSON.stringify({ error: msg }),
        });
      }
    }

    return json(200, { ok: true, processed: true }, CORS);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR:", msg);
    // Always return 200 to avoid Inter retrying indefinitely
    return json(200, { ok: false, error: msg }, CORS);
  }
});

function cobrancaId(c: { id: string }): string {
  return c.id.slice(0, 8);
}
