import { sanitizeLogData } from "@/lib/sanitizeLog";
import { buildOpsAppErrorFingerprint } from "@/lib/telemetry/opsAppErrorsFingerprint";
import { getRoutePathname } from "@/lib/telemetry/routeSnapshot";
import { getModalContextStackSnapshot } from "@/lib/telemetry/modalContextStack";
import { triageErrorLike, type ErrorTriageCategory, type ErrorTriageResult } from "@/lib/telemetry/errorTriage";

export type ConsoleRedLevel = "error" | "warn";

export type ConsoleRedEvent = {
  id: string;
  at: string; // ISO
  level: ConsoleRedLevel;
  source: string;
  message: string;
  stack: string | null;
  route_base: string | null;
  modal_context_stack: unknown[];
  fingerprint: string;
  triage: ErrorTriageResult;
};

const MAX_EVENTS = 200;
const buffer: ConsoleRedEvent[] = [];
const dedupe = new Map<string, number>();
const DEDUPE_MS = 2_000;

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `console_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
  }
}

function normalizeString(value: unknown): string {
  const sanitized = sanitizeLogData(value);
  if (typeof sanitized === "string") return sanitized;
  if (Array.isArray(sanitized)) return JSON.stringify(sanitized).slice(0, 1000);
  if (sanitized && typeof sanitized === "object") return JSON.stringify(sanitized).slice(0, 1000);
  return String(value);
}

export function recordConsoleRedEvent(input: {
  level: ConsoleRedLevel;
  source: string;
  message: unknown;
  stack?: unknown;
  http_status?: number | null;
  code?: string | null;
  url?: string | null;
}) {
  if (typeof window === "undefined") return;

  const routeBase = getRoutePathname() ?? (window.location?.pathname ?? null);
  const modalStack = getModalContextStackSnapshot();

  const message = normalizeString(input.message);
  const stack = input.stack ? normalizeString(input.stack) : null;

  const triage = triageErrorLike({
    message,
    stack,
    http_status: input.http_status ?? null,
    code: input.code ?? null,
    url: input.url ?? null,
    source: input.source,
  });

  const fingerprint = buildOpsAppErrorFingerprint({
    route: routeBase,
    code: input.code ?? null,
    httpStatus: input.http_status ?? null,
    url: input.url ?? null,
    method: null,
    message: `${input.source}: ${message}`,
  });

  const now = Date.now();
  const last = dedupe.get(fingerprint) ?? 0;
  if (now - last < DEDUPE_MS) return;
  dedupe.set(fingerprint, now);

  const ev: ConsoleRedEvent = {
    id: newId(),
    at: new Date().toISOString(),
    level: input.level,
    source: input.source,
    message,
    stack,
    route_base: routeBase,
    modal_context_stack: modalStack as unknown[],
    fingerprint,
    triage,
  };

  buffer.unshift(ev);
  if (buffer.length > MAX_EVENTS) buffer.length = MAX_EVENTS;

  try {
    window.dispatchEvent(new CustomEvent("revo:console_red_event", { detail: { id: ev.id, category: ev.triage.category } }));
  } catch {
    // ignore
  }
}

export function getConsoleRedEventsSnapshot(): ConsoleRedEvent[] {
  return buffer.slice();
}

export function countConsoleRedByCategory(): Record<ErrorTriageCategory, number> {
  const out: Record<ErrorTriageCategory, number> = { CLIENT: 0, SYSTEM: 0, UNKNOWN: 0 };
  for (const ev of buffer) out[ev.triage.category] += 1;
  return out;
}
