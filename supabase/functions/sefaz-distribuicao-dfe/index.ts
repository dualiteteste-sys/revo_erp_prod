/**
 * Phase 2 — DistribuiçãoDFe: Query SEFAZ for NF-e addressed to our CNPJ.
 *
 * POST /functions/v1/sefaz-distribuicao-dfe
 * Headers: Authorization: Bearer <jwt>, x-empresa-id: <uuid>
 * Body: {} or { maxPages?: number }
 *
 * Flow:
 *   1. Auth + membership check
 *   2. Load PFX cert + decrypt password
 *   3. Create mTLS client
 *   4. Loop: distNSU(ultNSU) → process docs → update NSU → repeat
 *   5. Rate limit: max 20 req/hour, min 2s between requests
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getRequestId } from "../_shared/request.ts";
import { aesGcmDecryptFromString } from "../_shared/crypto.ts";
import { pfxToPem } from "../_shared/pfx-to-pem.ts";
import {
  buildDistNSUSoap,
  SEFAZ_ENDPOINTS,
  ufToCode,
  parseDistDFeResponse,
  parseResNFe,
  fetchWithRetry,
  type Ambiente,
} from "../_shared/sefaz-soap.ts";

const MAX_PAGES_DEFAULT = 5;   // max iterations per call
const MIN_DELAY_MS = 2000;     // minimum delay between SEFAZ requests
const MAX_REQ_PER_HOUR = 20;   // SEFAZ rate limit

Deno.serve(async (req) => {
  const CORS = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const requestId = getRequestId(req);
  const log = (msg: string, ...args: unknown[]) =>
    console.log(`[sefaz-dist-dfe][${requestId}] ${msg}`, ...args);

  try {
    // ---- Auth ----
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    const isCron = req.headers.get("x-cron") === "true";

    // For cron: use service role auth
    if (!token && !isCron) {
      return json(401, { ok: false, error: "UNAUTHENTICATED" }, CORS);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const CERT_KEY = Deno.env.get("CERT_ENCRYPTION_KEY");

    if (!CERT_KEY) {
      return json(500, { ok: false, error: "CERT_ENCRYPTION_KEY not configured" }, CORS);
    }

    const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let empresaId: string | null = null;

    if (isCron) {
      // CRON mode: process all empresas with valid certificates
      log("CRON mode — processing all empresas with certificates");
      const { data: empresas } = await svc
        .from("fiscal_nfe_emitente")
        .select("empresa_id")
        .not("certificado_storage_path", "is", null)
        .not("certificado_senha_encrypted", "is", null);

      if (!empresas || empresas.length === 0) {
        return json(200, { ok: true, message: "No empresas with certificates" }, CORS);
      }

      const results = [];
      for (const emp of empresas) {
        try {
          const result = await processSingleEmpresa(svc, emp.empresa_id, CERT_KEY, log);
          results.push({ empresa_id: emp.empresa_id, ...result });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log(`ERROR for empresa ${emp.empresa_id}:`, msg);
          results.push({ empresa_id: emp.empresa_id, ok: false, error: msg });
        }
      }
      return json(200, { ok: true, results }, CORS);
    }

    // Manual mode: single empresa
    empresaId = req.headers.get("x-empresa-id");
    if (!empresaId) {
      return json(400, { ok: false, error: "EMPRESA_HEADER_REQUIRED" }, CORS);
    }

    // Validate user membership
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: me } = await userClient.auth.getUser();
    if (!me?.user?.id) {
      return json(401, { ok: false, error: "INVALID_TOKEN" }, CORS);
    }
    const { data: membership } = await svc
      .from("empresa_usuarios")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("user_id", me.user.id)
      .maybeSingle();
    if (!membership) {
      return json(403, { ok: false, error: "NOT_A_MEMBER" }, CORS);
    }

    const body = await req.json().catch(() => ({}));
    const maxPages = Math.min(body?.maxPages ?? MAX_PAGES_DEFAULT, 10);

    const result = await processSingleEmpresa(svc, empresaId, CERT_KEY, log, maxPages);
    return json(200, { ok: true, ...result }, CORS);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log("FATAL:", msg);
    return json(500, { ok: false, error: msg }, CORS);
  }
});

// ============================================================
// Core processing for a single empresa
// ============================================================

async function processSingleEmpresa(
  svc: ReturnType<typeof createClient>,
  empresaId: string,
  certKey: string,
  log: (msg: string, ...args: unknown[]) => void,
  maxPages = MAX_PAGES_DEFAULT,
): Promise<{ docs_processed: number; ultimo_nsu: number; max_nsu: number }> {
  // Load emitente + cert info
  const { data: emitente, error: emErr } = await svc
    .from("fiscal_nfe_emitente")
    .select("certificado_storage_path, certificado_senha_encrypted, certificado_cnpj, endereco_uf, cnpj")
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (emErr || !emitente) throw new Error("EMITENTE_NOT_FOUND");
  if (!emitente.certificado_storage_path) throw new Error("NO_CERTIFICATE");
  if (!emitente.certificado_senha_encrypted) throw new Error("NO_CERTIFICATE_PASSWORD");

  // Download PFX
  const { data: pfxBlob, error: dlErr } = await svc.storage
    .from("nfe_certificados")
    .download(emitente.certificado_storage_path);
  if (dlErr || !pfxBlob) throw new Error(`PFX_DOWNLOAD_FAILED: ${dlErr?.message}`);

  // Decrypt password + convert PFX → PEM
  const certPassword = await aesGcmDecryptFromString({
    masterKey: certKey,
    ciphertext: emitente.certificado_senha_encrypted,
    aad: empresaId,
  });

  const pfxBytes = new Uint8Array(await pfxBlob.arrayBuffer());
  const pfxBase64 = btoa(String.fromCharCode(...pfxBytes));
  const pem = pfxToPem(pfxBase64, certPassword);

  if (pem.notAfter < new Date()) throw new Error("CERTIFICATE_EXPIRED");

  // Create mTLS client
  // @ts-ignore — Deno.createHttpClient available in Edge Runtime
  const httpClient = Deno.createHttpClient({
    caCerts: [],
    certChain: pem.certPem,
    privateKey: pem.keyPem,
    http2: false, // SEFAZ requires HTTP/1.1
  });

  try {
    // Get sync state
    const { data: syncRow } = await svc
      .from("fiscal_nfe_destinadas_sync")
      .select("*")
      .eq("empresa_id", empresaId)
      .maybeSingle();

    let ultNSU = syncRow?.ultimo_nsu ?? 0;

    // Rate limit check
    const hourAgo = new Date(Date.now() - 3600_000);
    if (syncRow?.sync_hour_started_at && new Date(syncRow.sync_hour_started_at) > hourAgo) {
      if ((syncRow.sync_count_hour ?? 0) >= MAX_REQ_PER_HOUR) {
        throw new Error("RATE_LIMITED: max requests per hour reached");
      }
    }

    // Determine ambiente from emission config
    const { data: emConfig } = await svc
      .from("fiscal_nfe_emissao_configs")
      .select("ambiente")
      .eq("empresa_id", empresaId)
      .maybeSingle();

    const ambiente: Ambiente = (emConfig?.ambiente as Ambiente) || "producao";
    const tpAmb = ambiente === "producao" ? "1" : "2";
    const uf = emitente.endereco_uf || "SP";
    const cnpj = (pem.cnpj || emitente.certificado_cnpj || emitente.cnpj || "").replace(/\D/g, "");

    if (!cnpj || cnpj.length !== 14) throw new Error("CNPJ_INVALID");

    const cUF = ufToCode(uf);
    const endpoint = SEFAZ_ENDPOINTS.distribuicao[ambiente];

    let totalDocs = 0;
    let maxNSU = 0;
    let pages = 0;

    log(`Starting sync for empresa ${empresaId}, ultNSU=${ultNSU}, ambiente=${ambiente}`);

    while (pages < maxPages) {
      pages++;
      const soapXml = buildDistNSUSoap({ ambiente: tpAmb as "1" | "2", cUF, cnpj, ultNSU });

      const startMs = Date.now();
      const response = await fetchWithRetry(endpoint, {
        client: httpClient,
        method: "POST",
        headers: {
          "Content-Type": "application/soap+xml; charset=utf-8",
          "SOAPAction": "",
        },
        body: soapXml,
      }, { log });
      const elapsed = Date.now() - startMs;
      const responseText = await response.text();

      log(`Page ${pages}: HTTP ${response.status} in ${elapsed}ms`);

      const parsed = await parseDistDFeResponse(responseText);
      log(`cStat=${parsed.cStat} xMotivo="${parsed.xMotivo}" docs=${parsed.docs.length} ultNSU=${parsed.ultNSU} maxNSU=${parsed.maxNSU}`);

      maxNSU = Math.max(maxNSU, parsed.maxNSU);

      if (parsed.cStat !== "137" && parsed.cStat !== "138") {
        // 137 = has docs, 138 = no new docs
        log(`Stopping: cStat=${parsed.cStat} (${parsed.xMotivo})`);
        break;
      }

      // Process documents
      for (const doc of parsed.docs) {
        if (doc.schema.includes("resNFe") || doc.schema.includes("procNFe")) {
          const nfe = parseResNFe(doc.xml);
          if (nfe) {
            // Upsert via direct insert (service role bypasses RLS)
            const { error: upsErr } = await svc
              .from("fiscal_nfe_destinadas")
              .upsert({
                empresa_id: empresaId,
                chave_acesso: nfe.chaveAcesso,
                nsu: doc.nsu,
                cnpj_emitente: nfe.cnpjEmitente,
                nome_emitente: nfe.nomeEmitente,
                ie_emitente: nfe.ieEmitente,
                data_emissao: nfe.dataEmissao,
                tipo_nfe: nfe.tipoNfe,
                valor_nf: nfe.valorNf,
                protocolo: nfe.protocolo,
                situacao_nfe: nfe.situacaoNfe,
                prazo_ciencia: new Date(new Date(nfe.dataEmissao).getTime() + 10 * 86_400_000).toISOString(),
                prazo_manifestacao: new Date(new Date(nfe.dataEmissao).getTime() + 180 * 86_400_000).toISOString(),
              }, {
                onConflict: "empresa_id,chave_acesso",
                ignoreDuplicates: false,
              });

            if (upsErr) {
              log(`Upsert error for chave ${nfe.chaveAcesso}: ${upsErr.message}`);
            } else {
              totalDocs++;
            }
          }
        }
      }

      ultNSU = parsed.ultNSU;

      // Stop if caught up
      if (parsed.cStat === "138" || parsed.ultNSU >= parsed.maxNSU) {
        log("Caught up with SEFAZ — stopping");
        break;
      }

      // Delay between requests
      if (pages < maxPages) {
        await new Promise((r) => setTimeout(r, MIN_DELAY_MS));
      }
    }

    // Update sync state
    const now = new Date().toISOString();
    const hourStarted = syncRow?.sync_hour_started_at && new Date(syncRow.sync_hour_started_at) > new Date(Date.now() - 3600_000)
      ? syncRow.sync_hour_started_at
      : now;
    const hourCount = hourStarted === syncRow?.sync_hour_started_at
      ? (syncRow?.sync_count_hour ?? 0) + pages
      : pages;

    await svc.from("fiscal_nfe_destinadas_sync").upsert({
      empresa_id: empresaId,
      ultimo_nsu: ultNSU,
      max_nsu: maxNSU,
      last_sync_at: now,
      last_sync_status: "ok",
      last_sync_error: null,
      sync_count_hour: hourCount,
      sync_hour_started_at: hourStarted,
      updated_at: now,
    }, { onConflict: "empresa_id" });

    log(`Sync complete: ${totalDocs} docs processed, ultNSU=${ultNSU}, maxNSU=${maxNSU}`);

    return { docs_processed: totalDocs, ultimo_nsu: ultNSU, max_nsu: maxNSU };

  } finally {
    httpClient.close();
  }
}

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
