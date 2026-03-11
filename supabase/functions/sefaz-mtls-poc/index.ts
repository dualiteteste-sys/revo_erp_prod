/**
 * Phase 0 — PoC: mTLS with SEFAZ via Deno.createHttpClient.
 *
 * Tests whether Supabase Edge Runtime supports:
 *   1. npm:node-forge (PFX → PEM conversion)
 *   2. Deno.createHttpClient({ cert, key }) for mTLS
 *   3. SOAP request to SEFAZ DistribuiçãoDFe (homologação)
 *
 * Invocation:
 *   POST /functions/v1/sefaz-mtls-poc
 *   Headers: Authorization: Bearer <jwt>, x-empresa-id: <uuid>
 *   Body: {} (no params needed — uses stored cert)
 *
 * Expected success: cStat "137" (has docs) or "138" (no docs yet).
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getRequestId } from "../_shared/request.ts";
import { aesGcmDecryptFromString } from "../_shared/crypto.ts";
import { pfxToPem } from "../_shared/pfx-to-pem.ts";
import { buildDistNSUSoap, SEFAZ_ENDPOINTS, ufToCode } from "../_shared/sefaz-soap.ts";

Deno.serve(async (req) => {
  const CORS = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const requestId = getRequestId(req);
  const log = (msg: string, ...args: unknown[]) =>
    console.log(`[sefaz-mtls-poc][${requestId}] ${msg}`, ...args);

  try {
    // ---- Auth ----
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    if (!token) {
      return json(401, { ok: false, error: "UNAUTHENTICATED" }, CORS);
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

    // Resolve empresa
    const empresaId = req.headers.get("x-empresa-id");
    if (!empresaId) {
      return json(400, { ok: false, error: "EMPRESA_HEADER_REQUIRED" }, CORS);
    }

    // Check membership
    const { data: membership } = await svc
      .from("empresa_usuarios")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("user_id", me.user.id)
      .maybeSingle();

    if (!membership) {
      return json(403, { ok: false, error: "NOT_A_MEMBER" }, CORS);
    }

    log("Auth OK — empresa:", empresaId);

    // ---- Load certificate ----
    const { data: emitente, error: emErr } = await svc
      .from("fiscal_nfe_emitente")
      .select("certificado_storage_path, certificado_senha_encrypted, certificado_cnpj, endereco_uf, cnpj")
      .eq("empresa_id", empresaId)
      .maybeSingle();

    if (emErr || !emitente) {
      return json(400, { ok: false, error: "EMITENTE_NOT_FOUND", detail: emErr?.message }, CORS);
    }

    if (!emitente.certificado_storage_path) {
      return json(400, { ok: false, error: "NO_CERTIFICATE_UPLOADED" }, CORS);
    }

    if (!emitente.certificado_senha_encrypted) {
      return json(400, { ok: false, error: "NO_CERTIFICATE_PASSWORD" }, CORS);
    }

    log("Downloading PFX from storage...");

    // Download PFX from bucket
    const { data: pfxBlob, error: dlErr } = await svc.storage
      .from("nfe_certificados")
      .download(emitente.certificado_storage_path);

    if (dlErr || !pfxBlob) {
      return json(500, { ok: false, error: "PFX_DOWNLOAD_FAILED", detail: dlErr?.message }, CORS);
    }

    // Decrypt password
    log("Decrypting certificate password...");
    const certPassword = await aesGcmDecryptFromString({
      masterKey: CERT_KEY,
      ciphertext: emitente.certificado_senha_encrypted,
      aad: empresaId,
    });

    // Convert PFX → PEM
    log("Converting PFX to PEM...");
    const pfxBytes = new Uint8Array(await pfxBlob.arrayBuffer());
    const pfxBase64 = btoa(String.fromCharCode(...pfxBytes));
    const pem = pfxToPem(pfxBase64, certPassword);

    log("PEM conversion OK — subject:", pem.subject);
    log("Certificate valid until:", pem.notAfter.toISOString());
    log("CNPJ from cert:", pem.cnpj);

    // ---- Create mTLS client ----
    log("Creating Deno.createHttpClient with mTLS...");

    // @ts-ignore — Deno.createHttpClient is available in Edge Runtime
    const httpClient = Deno.createHttpClient({
      caCerts: [],     // Use default CA bundle
      certChain: pem.certPem,
      privateKey: pem.keyPem,
    });

    // ---- Build SOAP request ----
    const uf = emitente.endereco_uf || "SP";
    const cnpj = pem.cnpj || emitente.certificado_cnpj || emitente.cnpj;

    if (!cnpj) {
      return json(400, { ok: false, error: "CNPJ_NOT_FOUND" }, CORS);
    }

    const cUF = ufToCode(uf);
    const soapXml = buildDistNSUSoap({
      ambiente: "2",   // homologação
      cUF,
      cnpj: cnpj.replace(/\D/g, ""),
      ultNSU: 0,       // start from zero for PoC
    });

    const endpoint = SEFAZ_ENDPOINTS.distribuicao.homologacao;
    log("Sending SOAP to:", endpoint);

    // ---- Send request ----
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

    // Quick parse cStat
    const cStatMatch = responseText.match(/<cStat>(\d+)<\/cStat>/);
    const xMotivoMatch = responseText.match(/<xMotivo>([^<]*)<\/xMotivo>/);
    const cStat = cStatMatch ? cStatMatch[1] : "unknown";
    const xMotivo = xMotivoMatch ? xMotivoMatch[1] : "unknown";

    log("cStat:", cStat, "xMotivo:", xMotivo);

    // Cleanup
    httpClient.close();

    return json(200, {
      ok: true,
      poc_result: "MTLS_SUCCESS",
      sefaz: {
        http_status: response.status,
        cStat,
        xMotivo,
        elapsed_ms: elapsed,
      },
      cert_info: {
        subject: pem.subject,
        cnpj: pem.cnpj,
        valid_until: pem.notAfter.toISOString(),
      },
    }, CORS);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR:", msg);

    // Specific error hints
    let hint = "";
    if (msg.includes("createHttpClient")) {
      hint = "Deno.createHttpClient may not be available in this Edge Runtime version. Fallback to proxy needed.";
    } else if (msg.includes("PFX_NO_CERT") || msg.includes("PFX_NO_KEY")) {
      hint = "The PFX file may be corrupted or the password is wrong.";
    }

    return json(500, {
      ok: false,
      error: msg,
      hint: hint || undefined,
    }, CORS);
  }
});

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
