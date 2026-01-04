import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { nfeioBaseUrl, nfeioFetchJson, type NfeioEnvironment } from "../_shared/nfeio.ts";
import { rateLimitCheck } from "../_shared/rate_limit.ts";
import { extractNfeioStatus } from "../_shared/nfeio_payload.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const NFEIO_API_KEY = Deno.env.get("NFEIO_API_KEY") ?? "";
const NFEIO_WORKER_SECRET = Deno.env.get("NFEIO_WORKER_SECRET") ?? "";
const NFEIO_WEBHOOK_SECRET = Deno.env.get("NFEIO_WEBHOOK_SECRET") ?? "";

type WorkerBody = { limit?: number };

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function backoffSeconds(attempt: number): number {
  // 1m, 5m, 15m, 1h, 6h (cap)
  const steps = [60, 300, 900, 3600, 21600];
  return steps[Math.min(Math.max(attempt, 0), steps.length - 1)];
}

function retryAfterSeconds(nextRetryAt: any): number | null {
  if (!nextRetryAt) return null;
  const d = new Date(String(nextRetryAt));
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(1, Math.ceil((d.getTime() - Date.now()) / 1000));
}

async function circuitBreakerShouldAllow(params: {
  admin: any;
  empresaId: string;
  domain: string;
  provider: string;
}): Promise<{ allowed: boolean; state: string | null; next_retry_at: string | null }> {
  try {
    const { data, error } = await params.admin.rpc("integration_circuit_breaker_should_allow", {
      p_empresa_id: params.empresaId,
      p_domain: params.domain,
      p_provider: params.provider,
    });
    if (error) return { allowed: true, state: null, next_retry_at: null };
    return {
      allowed: !!data?.allowed,
      state: data?.state != null ? String(data.state) : null,
      next_retry_at: data?.next_retry_at != null ? String(data.next_retry_at) : null,
    };
  } catch {
    return { allowed: true, state: null, next_retry_at: null };
  }
}

async function circuitBreakerRecord(params: {
  admin: any;
  empresaId: string;
  domain: string;
  provider: string;
  ok: boolean;
  error?: string | null;
}) {
  try {
    await params.admin.rpc("integration_circuit_breaker_record_result", {
      p_empresa_id: params.empresaId,
      p_domain: params.domain,
      p_provider: params.provider,
      p_ok: params.ok,
      p_error: params.error ?? null,
    });
  } catch {
    // ignore
  }
}

async function tryUploadFromUrl(admin: any, bucket: string, path: string, url: string, contentType: string) {
  const resp = await fetch(url);
  if (!resp.ok) return;
  const blob = await resp.blob();
  await admin.storage.from(bucket).upload(path, blob, { upsert: true, contentType });
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, cors);

  const secret = NFEIO_WORKER_SECRET || NFEIO_WEBHOOK_SECRET;
  if (!secret) return json(500, { ok: false, error: "MISSING_WORKER_SECRET" }, cors);
  const got = (req.headers.get("x-worker-secret") ?? "").trim();
  if (!got || got !== secret) return json(401, { ok: false, error: "UNAUTHORIZED" }, cors);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const body = (await req.json().catch(() => ({}))) as WorkerBody;
  const limit = Math.min(Math.max(Number(body.limit ?? 25), 1), 100);

  // Seleciona eventos pendentes (best-effort lock)
  const now = new Date();
  const lockId = crypto.randomUUID();

  const { data: pending, error: fetchErr } = await admin
    .from("fiscal_nfe_webhook_events")
    .select("id,empresa_id,nfeio_id,event_type,payload,process_attempts")
    .is("processed_at", null)
    .or("next_retry_at.is.null,next_retry_at.lte." + now.toISOString())
    .or("locked_at.is.null,locked_at.lte." + new Date(now.getTime() - 10 * 60 * 1000).toISOString())
    .order("received_at", { ascending: true })
    .limit(limit);

  if (fetchErr) return json(500, { ok: false, error: "FETCH_FAILED", detail: fetchErr.message }, cors);
  if (!pending?.length) return json(200, { ok: true, processed: 0 }, cors);

  let processed = 0;

  for (const ev of pending) {
    const eventId = ev.id as string;

    // lock row (best-effort: update only if still unlocked)
    const { data: lockRes } = await admin
      .from("fiscal_nfe_webhook_events")
      .update({ locked_at: now.toISOString(), locked_by: lockId })
      .eq("id", eventId)
      .or("locked_at.is.null,locked_at.lte." + new Date(now.getTime() - 10 * 60 * 1000).toISOString())
      .select("id")
      .maybeSingle();
    if (!lockRes?.id) continue;

    try {
      const empresaId = ev.empresa_id as string | null;
      const nfeioId = (ev.nfeio_id ?? "").toString();
      const payload = ev.payload ?? {};

      if (!nfeioId) {
        throw new Error("MISSING_NFEIO_ID");
      }

      const { data: link } = await admin
        .from("fiscal_nfe_nfeio_emissoes")
        .select("empresa_id,emissao_id,ambiente")
        .eq("nfeio_id", nfeioId)
        .maybeSingle();
      if (!link?.emissao_id) {
        throw new Error("NOT_LINKED_TO_EMISSAO");
      }

      const emissaoId = link.emissao_id as string;
      const ambiente = (link.ambiente ?? "homologacao") as NfeioEnvironment;
      const tenantId = (empresaId ?? link.empresa_id ?? null) as string | null;
      const cbEmpresaId = tenantId ?? link.empresa_id ?? empresaId ?? null;
      if (!cbEmpresaId) throw new Error("MISSING_EMPRESA_ID");

      // Atualização rápida com o que veio no webhook
      const statusFromWebhook = extractNfeioStatus(payload);
      if (statusFromWebhook) {
        await admin.from("fiscal_nfe_nfeio_emissoes").update({
          provider_status: statusFromWebhook,
          response_payload: payload,
          last_sync_at: new Date().toISOString(),
        }).eq("emissao_id", emissaoId);

        await admin.from("fiscal_nfe_emissoes").update({
          status: statusFromWebhook,
          last_error: null,
        }).eq("id", emissaoId);
      }

      // Se houver links no payload, tenta baixar docs (best-effort)
      const maybeXmlUrl = payload?.xmlUrl ?? payload?.xml_url ?? payload?.xml?.url ?? payload?.links?.xml ?? null;
      const maybeDanfeUrl = payload?.danfeUrl ?? payload?.danfe_url ?? payload?.danfe?.url ?? payload?.links?.danfe ?? null;
      const updates: any = {};

      if (tenantId && typeof maybeXmlUrl === "string" && maybeXmlUrl.startsWith("http")) {
        const path = `${tenantId}/${emissaoId}/nfeio.xml`;
        await tryUploadFromUrl(admin, "nfe_docs", path, maybeXmlUrl, "application/xml");
        updates.xml_storage_path = path;
      }
      if (tenantId && typeof maybeDanfeUrl === "string" && maybeDanfeUrl.startsWith("http")) {
        const path = `${tenantId}/${emissaoId}/danfe.pdf`;
        await tryUploadFromUrl(admin, "nfe_docs", path, maybeDanfeUrl, "application/pdf");
        updates.danfe_storage_path = path;
      }
      if (Object.keys(updates).length > 0) {
        await admin.from("fiscal_nfe_nfeio_emissoes").update(updates).eq("emissao_id", emissaoId);
      }

      // Se não temos doc links ou status, tenta consultar a NFE.io
      if ((!statusFromWebhook || !maybeXmlUrl || !maybeDanfeUrl) && NFEIO_API_KEY) {
        const cb = await circuitBreakerShouldAllow({ admin, empresaId: cbEmpresaId, domain: "nfeio", provider: "nfeio" });
        if (!cb.allowed) {
          const retryAt = cb.next_retry_at ?? new Date(Date.now() + 60_000).toISOString();
          await admin.from("fiscal_nfe_webhook_events").update({
            process_attempts: Number(ev.process_attempts ?? 0) + 1,
            next_retry_at: retryAt,
            last_error: `CIRCUIT_OPEN:nfeio (retry_after=${retryAfterSeconds(retryAt) ?? "?"}s)`,
            locked_at: null,
            locked_by: null,
          }).eq("id", eventId);
          continue;
        }

        const rl = await rateLimitCheck({
          admin,
          empresaId: cbEmpresaId,
          domain: "nfeio",
          action: "worker_sync",
          limit: 120,
          windowSeconds: 60,
        });
        if (!rl.allowed) {
          const retryAt = new Date(Date.now() + (rl.retry_after_seconds ?? 60) * 1000).toISOString();
          await admin.from("fiscal_nfe_webhook_events").update({
            process_attempts: Number(ev.process_attempts ?? 0) + 1,
            next_retry_at: retryAt,
            last_error: `RATE_LIMITED:nfeio (retry_after=${rl.retry_after_seconds ?? "?"}s)`,
            locked_at: null,
            locked_by: null,
          }).eq("id", eventId);
          continue;
        }

        const base = nfeioBaseUrl(ambiente);
        const url = `${base}/v2/nota-fiscal/${encodeURIComponent(nfeioId)}`;
        const result = await nfeioFetchJson(url, {
          method: "GET",
          headers: { "X-Api-Key": NFEIO_API_KEY, "Content-Type": "application/json" },
        });

        await admin.from("fiscal_nfe_nfeio_emissoes").update({
          response_payload: result.data ?? {},
          provider_status: result.data?.status ?? null,
          last_sync_at: new Date().toISOString(),
        }).eq("emissao_id", emissaoId);

        if (!result.ok) {
          await circuitBreakerRecord({
            admin,
            empresaId: cbEmpresaId,
            domain: "nfeio",
            provider: "nfeio",
            ok: false,
            error: `NFEIO_SYNC_FAILED:${result.status}`,
          });
          throw new Error(`NFEIO_SYNC_FAILED:${result.status}`);
        }

        await circuitBreakerRecord({ admin, empresaId: cbEmpresaId, domain: "nfeio", provider: "nfeio", ok: true });

        const nextStatus = (result.data?.status ?? "").toString().toLowerCase();
        if (nextStatus) {
          await admin.from("fiscal_nfe_emissoes").update({ status: nextStatus, last_error: null }).eq("id", emissaoId);
        }

        const xmlUrl =
          result.data?.xmlUrl ?? result.data?.xml_url ?? result.data?.xml?.url ?? result.data?.links?.xml ?? null;
        const danfeUrl =
          result.data?.danfeUrl ?? result.data?.danfe_url ?? result.data?.danfe?.url ?? result.data?.links?.danfe ?? null;
        const fetchUpdates: any = {};
        if (tenantId && typeof xmlUrl === "string" && xmlUrl.startsWith("http")) {
          const path = `${tenantId}/${emissaoId}/nfeio.xml`;
          await tryUploadFromUrl(admin, "nfe_docs", path, xmlUrl, "application/xml");
          fetchUpdates.xml_storage_path = path;
        }
        if (tenantId && typeof danfeUrl === "string" && danfeUrl.startsWith("http")) {
          const path = `${tenantId}/${emissaoId}/danfe.pdf`;
          await tryUploadFromUrl(admin, "nfe_docs", path, danfeUrl, "application/pdf");
          fetchUpdates.danfe_storage_path = path;
        }
        if (Object.keys(fetchUpdates).length > 0) {
          await admin.from("fiscal_nfe_nfeio_emissoes").update(fetchUpdates).eq("emissao_id", emissaoId);
        }
      }

      await admin.from("fiscal_nfe_webhook_events").update({
        processed_at: new Date().toISOString(),
        last_error: null,
        locked_at: null,
        locked_by: null,
      }).eq("id", eventId);

      processed++;
    } catch (e: any) {
      const attempts = Number(ev.process_attempts ?? 0) + 1;
      const next = new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString();
      await admin.from("fiscal_nfe_webhook_events").update({
        process_attempts: attempts,
        next_retry_at: next,
        last_error: (e?.message || "PROCESS_FAILED").toString().slice(0, 900),
        locked_at: null,
        locked_by: null,
      }).eq("id", eventId);
    }
  }

  return json(200, { ok: true, processed }, cors);
});
