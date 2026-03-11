/**
 * Validate a PFX certificate, extract metadata (CNPJ, validity),
 * and store the password encrypted (AES-GCM) in the database.
 *
 * POST /functions/v1/sefaz-cert-validate
 * Headers: Authorization: Bearer <jwt>, x-empresa-id: <uuid>
 * Body: { password: string }
 *
 * Prerequisites: PFX already uploaded to nfe_certificados bucket
 * and certificado_storage_path set in fiscal_nfe_emitente.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getRequestId } from "../_shared/request.ts";
import { aesGcmEncryptToString } from "../_shared/crypto.ts";
import { pfxToPem } from "../_shared/pfx-to-pem.ts";

Deno.serve(async (req) => {
  const CORS = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const requestId = getRequestId(req);
  const log = (msg: string, ...args: unknown[]) =>
    console.log(`[sefaz-cert-validate][${requestId}] ${msg}`, ...args);

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

    const { data: me } = await userClient.auth.getUser();
    if (!me?.user?.id) {
      return json(401, { ok: false, error: "INVALID_TOKEN" }, CORS);
    }

    const empresaId = req.headers.get("x-empresa-id");
    if (!empresaId) {
      return json(400, { ok: false, error: "EMPRESA_HEADER_REQUIRED" }, CORS);
    }

    // Check admin role
    const { data: membership } = await svc
      .from("empresa_usuarios")
      .select("role_id, roles:role_id(slug)")
      .eq("empresa_id", empresaId)
      .eq("user_id", me.user.id)
      .maybeSingle();

    if (!membership) {
      return json(403, { ok: false, error: "NOT_A_MEMBER" }, CORS);
    }

    const roleSlug = (membership as any)?.roles?.slug;
    if (roleSlug !== "OWNER" && roleSlug !== "ADMIN") {
      return json(403, { ok: false, error: "ADMIN_REQUIRED" }, CORS);
    }

    // ---- Parse body ----
    const body = await req.json().catch(() => ({}));
    const password = body?.password;
    if (!password || typeof password !== "string") {
      return json(400, { ok: false, error: "PASSWORD_REQUIRED" }, CORS);
    }

    log("Validating certificate for empresa:", empresaId);

    // ---- Load cert path ----
    const { data: emitente, error: emErr } = await svc
      .from("fiscal_nfe_emitente")
      .select("certificado_storage_path, cnpj")
      .eq("empresa_id", empresaId)
      .maybeSingle();

    if (emErr || !emitente) {
      return json(400, { ok: false, error: "EMITENTE_NOT_FOUND" }, CORS);
    }

    if (!emitente.certificado_storage_path) {
      return json(400, { ok: false, error: "NO_CERTIFICATE_UPLOADED" }, CORS);
    }

    // ---- Download PFX ----
    const { data: pfxBlob, error: dlErr } = await svc.storage
      .from("nfe_certificados")
      .download(emitente.certificado_storage_path);

    if (dlErr || !pfxBlob) {
      return json(500, { ok: false, error: "PFX_DOWNLOAD_FAILED", detail: dlErr?.message }, CORS);
    }

    // ---- Validate PFX with password ----
    log("Converting PFX to PEM for validation...");
    let pemResult;
    try {
      const pfxBytes = new Uint8Array(await pfxBlob.arrayBuffer());
      const pfxBase64 = btoa(String.fromCharCode(...pfxBytes));
      pemResult = pfxToPem(pfxBase64, password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Invalid password") || msg.includes("PKCS#12 MAC")) {
        return json(400, { ok: false, error: "WRONG_PASSWORD" }, CORS);
      }
      return json(400, { ok: false, error: "PFX_INVALID", detail: msg }, CORS);
    }

    log("PFX valid — CNPJ:", pemResult.cnpj, "Valid until:", pemResult.notAfter.toISOString());

    // Check if cert is expired
    if (pemResult.notAfter < new Date()) {
      return json(400, {
        ok: false,
        error: "CERTIFICATE_EXPIRED",
        detail: `Certificado expirou em ${pemResult.notAfter.toISOString()}`,
      }, CORS);
    }

    // ---- Encrypt password with AES-GCM ----
    log("Encrypting certificate password...");
    const encryptedPassword = await aesGcmEncryptToString({
      masterKey: CERT_KEY,
      plaintext: password,
      aad: empresaId,  // bind to tenant for extra safety
    });

    // ---- Update DB ----
    const { error: updErr } = await svc
      .from("fiscal_nfe_emitente")
      .update({
        certificado_senha_encrypted: encryptedPassword,
        certificado_validade: pemResult.notAfter.toISOString(),
        certificado_cnpj: pemResult.cnpj,
        updated_at: new Date().toISOString(),
      })
      .eq("empresa_id", empresaId);

    if (updErr) {
      return json(500, { ok: false, error: "DB_UPDATE_FAILED", detail: updErr.message }, CORS);
    }

    log("Certificate validated and password stored successfully.");

    return json(200, {
      ok: true,
      cert_info: {
        cnpj: pemResult.cnpj,
        valid_from: pemResult.notBefore.toISOString(),
        valid_until: pemResult.notAfter.toISOString(),
        subject: pemResult.subject,
      },
    }, CORS);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR:", msg);
    return json(500, { ok: false, error: msg }, CORS);
  }
});

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
