export type WooAuthMode = "basic_https" | "oauth1" | "querystring_fallback";

import { resolveWooError, type WooErrorMeta } from "./woocommerceErrors.ts";

export type ClassifiedWooError = WooErrorMeta;

const PRIVATE_HOSTNAME_SUFFIXES = [".local", ".internal", ".localhost"];

export function normalizeWooStoreUrl(input: string): string {
  const raw = String(input ?? "").trim();
  if (!raw) throw new Error("STORE_URL_REQUIRED");

  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(withProto);
  if (parsed.protocol !== "https:") throw new Error("STORE_URL_MUST_USE_HTTPS");
  if (parsed.username || parsed.password) throw new Error("STORE_URL_CREDENTIALS_NOT_ALLOWED");
  if (!parsed.hostname) throw new Error("STORE_URL_INVALID_HOST");

  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) throw new Error("STORE_URL_PRIVATE_HOST_BLOCKED");
  if (PRIVATE_HOSTNAME_SUFFIXES.some((suffix) => host.endsWith(suffix))) throw new Error("STORE_URL_PRIVATE_HOST_BLOCKED");
  if (isIpAddress(host) && isPrivateOrReservedIp(host)) throw new Error("STORE_URL_PRIVATE_IP_BLOCKED");

  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
}

export function buildWooApiUrl(params: {
  baseUrl: string;
  path: string;
  authMode: WooAuthMode;
  consumerKey: string;
  consumerSecret: string;
  query?: Record<string, string>;
  userAgent: string;
}): { url: string; headers: Record<string, string> } {
  const u = new URL(`${params.baseUrl}/wp-json/wc/v3/${params.path.replace(/^\/+/, "")}`);
  for (const [k, v] of Object.entries(params.query ?? {})) u.searchParams.set(k, v);

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": params.userAgent,
  };
  const ck = params.consumerKey.trim();
  const cs = params.consumerSecret.trim();

  if (params.authMode === "basic_https") {
    headers.Authorization = `Basic ${btoa(`${ck}:${cs}`)}`;
  } else if (params.authMode === "querystring_fallback") {
    u.searchParams.set("consumer_key", ck);
    u.searchParams.set("consumer_secret", cs);
  } else {
    headers.Authorization = `Basic ${btoa(`${ck}:${cs}`)}`;
  }

  return { url: u.toString(), headers };
}

export function classifyWooHttpStatus(status: number): ClassifiedWooError {
  if (status === 401) {
    return resolveWooError("WOO_AUTH_INVALID");
  }
  if (status === 403) {
    return resolveWooError("WOO_AUTH_FORBIDDEN");
  }
  if (status === 404) {
    return resolveWooError("WOO_RESOURCE_NOT_FOUND");
  }
  if (status === 429) {
    return resolveWooError("WOO_RATE_LIMIT");
  }
  if (status >= 500) {
    return resolveWooError("WOO_REMOTE_UNAVAILABLE");
  }
  if (status >= 400) {
    return resolveWooError("WOO_VALIDATION_FAILED");
  }
  return resolveWooError("WOO_UNEXPECTED");
}

export function computeBackoffMs(attempt: number): number {
  const safeAttempt = Math.max(1, Math.trunc(Number(attempt) || 1));
  const baseMs = 30_000;
  const maxMs = 60 * 60_000;
  const expo = Math.min(maxMs, baseMs * 2 ** (safeAttempt - 1));
  const jitter = Math.floor(Math.random() * 2_000);
  return expo + jitter;
}

export function dedupeKeyForWebhook(input: {
  deliveryId: string | null;
  topic: string;
  wooResourceId: number;
  payloadHash: string;
}): string {
  if (input.deliveryId) return `delivery:${input.deliveryId}`.slice(0, 200);
  return `hash:${input.topic}:${input.wooResourceId}:${input.payloadHash}`.slice(0, 200);
}

export function dropReconcileDedupeKey(nowMs: number = Date.now(), windowMinutes = 5): string {
  const safeWindowMs = Math.max(1, Math.trunc(Number(windowMinutes) || 5)) * 60_000;
  const bucket = Math.floor(nowMs / safeWindowMs);
  return `drop-reconcile:${bucket}`.slice(0, 200);
}

export function parsePositiveIntEnv(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

export function storeTypeLockKey(storeId: string, type: string): string {
  return `${String(storeId)}::${String(type)}`;
}

export function pickUniqueByStoreType<T extends { store_id: string; type: string }>(jobs: T[]): T[] {
  const seen = new Set<string>();
  const selected: T[] = [];
  for (const job of jobs) {
    const key = storeTypeLockKey(job.store_id, job.type);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(job);
  }
  return selected;
}

export function isEmpresaContextAllowed(candidateEmpresaId: string, userEmpresaIds: string[]): boolean {
  const normalizedCandidate = String(candidateEmpresaId ?? "").trim();
  if (!normalizedCandidate) return false;
  const allowed = new Set(userEmpresaIds.map((id) => String(id ?? "").trim()).filter(Boolean));
  return allowed.has(normalizedCandidate);
}

export function shouldFallbackToActiveEmpresa(input: {
  headerEmpresaId: string | null | undefined;
  errorCode: string;
}): boolean {
  const hasHeader = String(input.headerEmpresaId ?? "").trim().length > 0;
  if (hasHeader) return false;
  return String(input.errorCode ?? "").trim() !== "EMPRESA_CONTEXT_FORBIDDEN";
}

function firstNonEmptyEnv(
  getEnv: (key: string) => string | null | undefined,
  keys: string[],
): string {
  for (const key of keys) {
    const value = String(getEnv(key) ?? "").trim();
    if (value) return value;
  }
  return "";
}

export function resolveWooInfraKeys(getEnv: (key: string) => string | null | undefined): {
  workerKey: string;
  schedulerKey: string;
} {
  const workerKey = firstNonEmptyEnv(getEnv, [
    "WOOCOMMERCE_WORKER_KEY",
    // legacy aliases (keep compatibility with previously-configured secrets)
    "WOOCOMMERCE_WORKER",
    "WOOCOMMERCE_SCHEDULER_KEY",
    "WOOCOMMERCE_SCHEDULE",
  ]);

  const schedulerKey = firstNonEmptyEnv(getEnv, [
    "WOOCOMMERCE_SCHEDULER_KEY",
    // legacy aliases (keep compatibility with previously-configured secrets)
    "WOOCOMMERCE_SCHEDULE",
    // allow single-key setups (scheduler key omitted)
    "WOOCOMMERCE_WORKER_KEY",
    "WOOCOMMERCE_WORKER",
  ]);

  // Local dev convenience: Supabase local Edge Runtime doesn't automatically inject custom env vars.
  // Fall back to a stable per-project secret that exists only in local docker runtime.
  const localFallback = resolveLocalFallbackSecret(getEnv);
  if (localFallback) {
    return {
      workerKey: workerKey || `${localFallback}:woo-worker`,
      schedulerKey: schedulerKey || workerKey || `${localFallback}:woo-scheduler`,
    };
  }

  return { workerKey, schedulerKey };
}

export function resolveIntegrationsMasterKey(getEnv: (key: string) => string | null | undefined): string {
  const masterKey = firstNonEmptyEnv(getEnv, [
    "INTEGRATIONS_MASTER_KEY",
    // legacy aliases (keep compatibility with previously-configured secrets)
    "INTEGRATIONS_MASTER",
    "INTEGRATIONS_KEY",
  ]);
  if (masterKey) return masterKey;

  // Local dev convenience: use a stable per-project secret that exists only in local docker runtime.
  const localFallback = resolveLocalFallbackSecret(getEnv);
  if (localFallback) return localFallback;

  return "";
}

function resolveLocalFallbackSecret(getEnv: (key: string) => string | null | undefined): string {
  const internalHostPort = String(getEnv("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim();
  const supabaseUrl = String(getEnv("SUPABASE_URL") ?? "").trim();
  const isLocal = Boolean(internalHostPort) || supabaseUrl.startsWith("http://kong:") || supabaseUrl.includes("127.0.0.1");
  if (!isLocal) return "";

  // Present in Supabase local Edge Runtime docker container; not expected in hosted environments.
  const internalJwt = String(getEnv("SUPABASE_INTERNAL_JWT_SECRET") ?? "").trim();
  if (internalJwt) return internalJwt;

  // Some local runtimes only expose the standard Supabase vars to user functions.
  const serviceRole = String(getEnv("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (serviceRole) return serviceRole;

  const anon = String(getEnv("SUPABASE_ANON_KEY") ?? "").trim();
  if (anon) return anon;

  return "";
}

export function validateSchedulerKey(input: {
  providedKey: string | null | undefined;
  expectedKey: string | null | undefined;
  keysMatch: boolean;
}): { ok: boolean; status: number | null; error: string | null } {
  const provided = String(input.providedKey ?? "").trim();
  if (!provided) return { ok: false, status: 401, error: "SCHEDULER_UNAUTHENTICATED" };
  if (!String(input.expectedKey ?? "").trim() || !input.keysMatch) {
    return { ok: false, status: 403, error: "SCHEDULER_FORBIDDEN" };
  }
  return { ok: true, status: null, error: null };
}

function isIpAddress(hostname: string): boolean {
  return isIpv4(hostname) || isIpv6(hostname);
}

function isIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

function isIpv6(hostname: string): boolean {
  return hostname.includes(":");
}

function isPrivateOrReservedIp(hostname: string): boolean {
  if (isIpv4(hostname)) {
    const [a, b] = hostname.split(".").map((v) => Number(v));
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
    return false;
  }
  if (isIpv6(hostname)) {
    const normalized = hostname.toLowerCase();
    if (normalized === "::1") return true;
    if (normalized.startsWith("fe80:")) return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    return false;
  }
  return false;
}
