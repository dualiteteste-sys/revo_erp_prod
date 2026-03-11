/**
 * Phase 4 — RecepcaoEvento: Send manifestação events to SEFAZ.
 *
 * POST /functions/v1/sefaz-recepcao-evento
 * Headers: Authorization: Bearer <jwt>, x-empresa-id: <uuid>
 * Body: {
 *   nfeDestinadaIds: string[],
 *   tpEvento: '210210' | '210200' | '210220' | '210240',
 *   justificativa?: string   // required for 210240
 * }
 *
 * Event codes:
 *   210210 — Ciência da Operação
 *   210200 — Confirmação da Operação
 *   210220 — Desconhecimento da Operação
 *   210240 — Operação não Realizada (requires justificativa 15-255 chars)
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getRequestId } from "../_shared/request.ts";
import { aesGcmDecryptFromString } from "../_shared/crypto.ts";
import { pfxToPem } from "../_shared/pfx-to-pem.ts";
import { buildSignedEvento } from "../_shared/xml-sign.ts";
import {
  SEFAZ_ENDPOINTS,
  ufToCode,
  EVENT_DESCRIPTIONS,
  EVENT_TO_STATUS,
  buildRecepcaoEventoSoap,
  parseRecepcaoEventoResponse,
  brazilIsoNow,
  type Ambiente,
} from "../_shared/sefaz-soap.ts";

const VALID_EVENTS = ["210210", "210200", "210220", "210240"];
const TERMINAL_STATES = ["confirmada", "desconhecida", "nao_realizada"];
const MAX_BATCH_SIZE = 20;

// SEFAZ cStat codes for success
const SUCCESS_CSTAT = ["135", "136"]; // 135=registered+linked, 136=registered
const DUPLICATE_CSTAT = "573";        // already manifested

Deno.serve(async (req) => {
  const CORS = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const requestId = getRequestId(req);
  const log = (msg: string, ...args: unknown[]) =>
    console.log(`[sefaz-recepcao-evento][${requestId}] ${msg}`, ...args);

  try {
    // ---- Auth ----
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    if (!token) {
      return json(401, { ok: false, error: "UNAUTHENTICATED" }, CORS);
    }

    const empresaId = req.headers.get("x-empresa-id");
    if (!empresaId) {
      return json(400, { ok: false, error: "EMPRESA_HEADER_REQUIRED" }, CORS);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const CERT_KEY = Deno.env.get("CERT_ENCRYPTION_KEY");

    if (!CERT_KEY) {
      return json(500, { ok: false, error: "CERT_ENCRYPTION_KEY not configured" }, CORS);
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Validate user
    const { data: me } = await userClient.auth.getUser();
    if (!me?.user?.id) {
      return json(401, { ok: false, error: "INVALID_TOKEN" }, CORS);
    }

    // Validate membership
    const { data: membership } = await svc
      .from("empresa_usuarios")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("user_id", me.user.id)
      .maybeSingle();
    if (!membership) {
      return json(403, { ok: false, error: "NOT_A_MEMBER" }, CORS);
    }

    // ---- Parse & validate body ----
    const body = await req.json().catch(() => ({}));
    const { nfeDestinadaIds, tpEvento, justificativa } = body;

    if (!Array.isArray(nfeDestinadaIds) || nfeDestinadaIds.length === 0) {
      return json(400, { ok: false, error: "IDS_REQUIRED" }, CORS);
    }
    if (nfeDestinadaIds.length > MAX_BATCH_SIZE) {
      return json(400, { ok: false, error: `MAX_BATCH_SIZE_EXCEEDED: max ${MAX_BATCH_SIZE}` }, CORS);
    }
    if (!VALID_EVENTS.includes(tpEvento)) {
      return json(400, { ok: false, error: "INVALID_EVENT_TYPE" }, CORS);
    }
    if (tpEvento === "210240") {
      const just = (justificativa || "").trim();
      if (just.length < 15) {
        return json(400, { ok: false, error: "JUSTIFICATIVA_TOO_SHORT: min 15 chars" }, CORS);
      }
      if (just.length > 255) {
        return json(400, { ok: false, error: "JUSTIFICATIVA_TOO_LONG: max 255 chars" }, CORS);
      }
    }

    const descEvento = EVENT_DESCRIPTIONS[tpEvento];
    if (!descEvento) {
      return json(400, { ok: false, error: "UNKNOWN_EVENT_TYPE" }, CORS);
    }

    log(`Manifestação ${tpEvento} (${descEvento}) for ${nfeDestinadaIds.length} NF-e`);

    // ---- Load NF-e records ----
    const { data: nfes, error: nfeErr } = await svc
      .from("fiscal_nfe_destinadas")
      .select("id, chave_acesso, status")
      .eq("empresa_id", empresaId)
      .in("id", nfeDestinadaIds);

    if (nfeErr || !nfes) {
      return json(500, { ok: false, error: "LOAD_NFE_FAILED", detail: nfeErr?.message }, CORS);
    }

    if (nfes.length === 0) {
      return json(404, { ok: false, error: "NO_NFE_FOUND" }, CORS);
    }

    // Filter out NF-e in terminal states
    const eligible = nfes.filter((n) => !TERMINAL_STATES.includes(n.status));
    const skipped = nfes.filter((n) => TERMINAL_STATES.includes(n.status));

    if (eligible.length === 0) {
      return json(400, {
        ok: false,
        error: "ALL_NFE_IN_TERMINAL_STATE",
        detail: `${skipped.length} NF-e already in terminal state`,
      }, CORS);
    }

    // ---- Load certificate ----
    const { data: emitente, error: emErr } = await svc
      .from("fiscal_nfe_emitente")
      .select("certificado_storage_path, certificado_senha_encrypted, certificado_cnpj, endereco_uf, cnpj")
      .eq("empresa_id", empresaId)
      .maybeSingle();

    if (emErr || !emitente) {
      return json(400, { ok: false, error: "EMITENTE_NOT_FOUND" }, CORS);
    }
    if (!emitente.certificado_storage_path) {
      return json(400, { ok: false, error: "NO_CERTIFICATE" }, CORS);
    }
    if (!emitente.certificado_senha_encrypted) {
      return json(400, { ok: false, error: "NO_CERTIFICATE_PASSWORD" }, CORS);
    }

    // Download PFX
    const { data: pfxBlob, error: dlErr } = await svc.storage
      .from("nfe_certificados")
      .download(emitente.certificado_storage_path);
    if (dlErr || !pfxBlob) {
      return json(500, { ok: false, error: "PFX_DOWNLOAD_FAILED" }, CORS);
    }

    // Decrypt password + convert PFX → PEM
    const certPassword = await aesGcmDecryptFromString({
      masterKey: CERT_KEY,
      ciphertext: emitente.certificado_senha_encrypted,
      aad: empresaId,
    });

    const pfxBytes = new Uint8Array(await pfxBlob.arrayBuffer());
    const pfxBase64 = btoa(String.fromCharCode(...pfxBytes));
    const pem = pfxToPem(pfxBase64, certPassword);

    if (pem.notAfter < new Date()) {
      return json(400, { ok: false, error: "CERTIFICATE_EXPIRED" }, CORS);
    }

    // ---- Determine ambiente ----
    const { data: emConfig } = await svc
      .from("fiscal_nfe_emissao_configs")
      .select("ambiente")
      .eq("empresa_id", empresaId)
      .maybeSingle();

    const ambiente: Ambiente = (emConfig?.ambiente as Ambiente) || "producao";
    const tpAmb = ambiente === "producao" ? "1" : "2";
    const cnpj = (pem.cnpj || emitente.certificado_cnpj || emitente.cnpj || "").replace(/\D/g, "");

    if (!cnpj || cnpj.length !== 14) {
      return json(400, { ok: false, error: "CNPJ_INVALID" }, CORS);
    }

    // ---- Build signed eventos ----
    const dhEvento = brazilIsoNow();
    const signedEventos: string[] = [];
    const chaveToId: Record<string, string> = {};

    for (const nfe of eligible) {
      chaveToId[nfe.chave_acesso] = nfe.id;

      const signed = buildSignedEvento({
        tpAmb: tpAmb as "1" | "2",
        cnpj,
        chNFe: nfe.chave_acesso,
        tpEvento,
        descEvento,
        nSeqEvento: 1,
        dhEvento,
        xJust: tpEvento === "210240" ? justificativa?.trim() : undefined,
        certPem: pem.certPem,
        keyPem: pem.keyPem,
      });

      signedEventos.push(signed);
    }

    // ---- Send to SEFAZ via mTLS ----
    const idLote = String(Date.now()).slice(-15);
    const soapXml = buildRecepcaoEventoSoap({
      signedEventos,
      idLote,
    });

    const endpoint = SEFAZ_ENDPOINTS.recepcaoEvento[ambiente];

    // @ts-ignore — Deno.createHttpClient available in Edge Runtime
    const httpClient = Deno.createHttpClient({
      caCerts: [],
      certChain: pem.certPem,
      privateKey: pem.keyPem,
    });

    try {
      log(`Sending ${signedEventos.length} events to SEFAZ ${ambiente}...`);
      const startMs = Date.now();

      const response = await fetch(endpoint, {
        // @ts-ignore — client option for Deno
        client: httpClient,
        method: "POST",
        headers: {
          "Content-Type": "application/soap+xml; charset=utf-8",
          "SOAPAction": "",
        },
        body: soapXml,
      });

      const elapsed = Date.now() - startMs;
      const responseText = await response.text();

      log(`SEFAZ responded: HTTP ${response.status} in ${elapsed}ms`);

      // ---- Parse response ----
      const parsed = parseRecepcaoEventoResponse(responseText);
      log(`Lote cStat=${parsed.cStat} xMotivo="${parsed.xMotivo}" results=${parsed.results.length}`);

      // Check lote-level status
      if (parsed.cStat !== "128") {
        log(`Lote rejected: cStat=${parsed.cStat}`);
        return json(502, {
          ok: false,
          error: "SEFAZ_LOTE_REJECTED",
          cStat: parsed.cStat,
          xMotivo: parsed.xMotivo,
        }, CORS);
      }

      // ---- Process individual results ----
      const targetStatus = EVENT_TO_STATUS[tpEvento];
      const eventResults: Array<{
        nfe_destinada_id: string;
        chave_acesso: string;
        cStat: string;
        xMotivo: string;
        protocolo: string | null;
        success: boolean;
      }> = [];

      for (const result of parsed.results) {
        const nfeId = chaveToId[result.chNFe];
        if (!nfeId) {
          log(`WARNING: SEFAZ returned chNFe ${result.chNFe} not in our batch`);
          continue;
        }

        const isSuccess = SUCCESS_CSTAT.includes(result.cStat);
        const isDuplicate = result.cStat === DUPLICATE_CSTAT;

        if (isSuccess || isDuplicate) {
          // Update NF-e status in database
          const { error: updErr } = await svc
            .from("fiscal_nfe_destinadas")
            .update({
              status: targetStatus,
              manifestado_em: new Date().toISOString(),
              justificativa: tpEvento === "210240" ? justificativa?.trim() : null,
              evento_protocolo: result.nProt,
              evento_cstat: result.cStat,
              evento_dh_registro: result.dhRegEvento,
              updated_at: new Date().toISOString(),
            })
            .eq("id", nfeId)
            .eq("empresa_id", empresaId);

          if (updErr) {
            log(`DB update error for ${result.chNFe}: ${updErr.message}`);
          }

          eventResults.push({
            nfe_destinada_id: nfeId,
            chave_acesso: result.chNFe,
            cStat: result.cStat,
            xMotivo: result.xMotivo,
            protocolo: result.nProt,
            success: true,
          });
        } else {
          log(`Event rejected for ${result.chNFe}: cStat=${result.cStat} ${result.xMotivo}`);
          eventResults.push({
            nfe_destinada_id: nfeId,
            chave_acesso: result.chNFe,
            cStat: result.cStat,
            xMotivo: result.xMotivo,
            protocolo: null,
            success: false,
          });
        }
      }

      const successCount = eventResults.filter((r) => r.success).length;
      const failCount = eventResults.filter((r) => !r.success).length;

      log(`Done: ${successCount} success, ${failCount} failed, ${skipped.length} skipped (terminal)`);

      return json(200, {
        ok: true,
        success_count: successCount,
        fail_count: failCount,
        skipped_count: skipped.length,
        results: eventResults,
      }, CORS);

    } finally {
      httpClient.close();
    }

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log("FATAL:", msg);
    return json(500, { ok: false, error: msg }, CORS);
  }
});

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
