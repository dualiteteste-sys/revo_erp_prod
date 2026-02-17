import { sanitizeLogData } from "@/lib/sanitizeLog";

export type NetworkTraceKind = "rpc" | "edge";

export type NetworkTraceItem = {
  at: string;
  request_id: string;
  correlation_id?: string | null;
  kind: NetworkTraceKind;
  name: string;
  method: string;
  url: string;
  status_code: number | null;
  duration_ms: number | null;
  error_code?: string | null;
  payload_keys?: string[] | null;
  response_summary?: string | null;
};

const LIMIT = 30;
let buffer: NetworkTraceItem[] = [];

function isSensitiveKeyName(key: string) {
  return /(password|secret|token|authorization|cookie|api[_-]?key|refresh_token|access_token|id_token|consumer[_-]?key)/i.test(key);
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function safeKeysFromBody(body: unknown): string[] | null {
  try {
    if (!body) return null;
    if (typeof body === "string") {
      if (body.length > 50_000) return null;
      const parsed = tryParseJson(body);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      return Object.keys(parsed as Record<string, unknown>).filter((k) => !isSensitiveKeyName(k)).slice(0, 40);
    }
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      const keys: string[] = [];
      body.forEach((_v, k) => {
        if (!isSensitiveKeyName(k)) keys.push(String(k));
      });
      return keys.slice(0, 40);
    }
    return null;
  } catch {
    return null;
  }
}

function sanitizeUrl(url: string) {
  try {
    const u = new URL(url);
    u.search = "";
    return u.toString();
  } catch {
    return String(url).split("?")[0] ?? String(url);
  }
}

function push(item: NetworkTraceItem) {
  buffer = [...buffer, item].slice(-LIMIT);
}

export function recordNetworkTrace(input: Omit<NetworkTraceItem, "at" | "url"> & { at?: string; url: string; body?: unknown }) {
  try {
    const payload_keys = input.payload_keys ?? safeKeysFromBody(input.body);
    const response_summary = input.response_summary ? String(input.response_summary).slice(0, 600) : null;
    const safe = sanitizeLogData({
      ...input,
      url: sanitizeUrl(input.url),
      payload_keys,
      response_summary,
    }) as unknown as NetworkTraceItem;

    push({
      at: input.at ?? new Date().toISOString(),
      request_id: String(safe.request_id),
      correlation_id: typeof (safe as any).correlation_id === "string" ? String((safe as any).correlation_id) : null,
      kind: safe.kind,
      name: String(safe.name).slice(0, 140),
      method: String(safe.method).slice(0, 12),
      url: String(safe.url),
      status_code: typeof safe.status_code === "number" ? safe.status_code : null,
      duration_ms: typeof safe.duration_ms === "number" ? safe.duration_ms : null,
      error_code: typeof safe.error_code === "string" ? safe.error_code : null,
      payload_keys: Array.isArray(safe.payload_keys) ? safe.payload_keys.map(String) : null,
      response_summary: typeof safe.response_summary === "string" ? safe.response_summary : null,
    });
  } catch {
    // best-effort
  }
}

export function getNetworkTracesSnapshot(): NetworkTraceItem[] {
  return buffer.map((i) => ({ ...i, payload_keys: i.payload_keys ? [...i.payload_keys] : i.payload_keys }));
}

export function clearNetworkTracesForTest() {
  buffer = [];
}
