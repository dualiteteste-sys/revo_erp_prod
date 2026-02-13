import { sanitizeLogData } from "@/lib/sanitizeLog";
import { getRoutePathname } from "@/lib/telemetry/routeSnapshot";
import { getLastUserAction } from "@/lib/telemetry/lastUserAction";
import { getModalContextStackSnapshot } from "@/lib/telemetry/modalContextStack";
import { buildOpsAppErrorFingerprint } from "@/lib/telemetry/opsAppErrorsFingerprint";

export type ErrorIncidentSeverity = "P0" | "P1" | "P2";
export type ErrorIncidentKind = "frontend" | "network" | "auth" | "tenant" | "external" | "unknown";

export type ErrorIncidentEvent = {
  id: string;
  at: string;
  source: string;
  message: string;
  stack?: string | null;
  route: string | null;
  request_id?: string | null;
  http_status?: number | null;
  code?: string | null;
  url?: string | null;
  severity: ErrorIncidentSeverity;
  kind: ErrorIncidentKind;
  fingerprint: string;
};

export type ErrorIncident = {
  id: string;
  fingerprint: string;
  severity: ErrorIncidentSeverity;
  kind: ErrorIncidentKind;
  source: string;
  message: string;
  route: string | null;
  request_id: string | null;
  url: string | null;
  http_status: number | null;
  code: string | null;
  first_seen_at: string;
  last_seen_at: string;
  occurrences: number;
  stack_sample: string | null;
};

type IncidentInput = {
  source: string;
  message: unknown;
  stack?: unknown;
  route?: string | null;
  request_id?: string | null;
  http_status?: number | null;
  code?: string | null;
  url?: string | null;
};

const NOISE_PATTERNS: RegExp[] = [
  /a listener indicated an asynchronous response by returning true/i,
  /message channel closed before a response was received/i,
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
];

const incidentsByFingerprint = new Map<string, ErrorIncident>();
const incidentsByRecency: string[] = [];
const MAX_INCIDENTS = 300;
const DEDUPE_WINDOW_MS = 1_200;
const lastEventAt = new Map<string, number>();

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `incident_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
  }
}

function toText(value: unknown): string {
  const safe = sanitizeLogData(value);
  if (typeof safe === "string") return safe;
  if (safe == null) return "";
  try {
    return JSON.stringify(safe);
  } catch {
    return String(safe);
  }
}

export function isKnownExternalNoise(message: unknown, source?: string | null, url?: string | null) {
  const text = `${String(source ?? "")}\n${String(url ?? "")}\n${toText(message)}`.toLowerCase();
  return NOISE_PATTERNS.some((pattern) => pattern.test(text));
}

function classifySeverity(input: { http_status?: number | null; code?: string | null; message: string; source: string }): ErrorIncidentSeverity {
  const status = input.http_status ?? null;
  const code = String(input.code ?? "").toUpperCase();
  const msg = input.message.toLowerCase();

  if (status === 401 || status === 403 || code === "42501" || msg.includes("acesso negado") || msg.includes("forbidden")) return "P0";
  if (status === 429 || (status != null && status >= 500)) return "P0";
  if (msg.includes("failed to fetch") || msg.includes("chunk") || msg.includes("dynamically imported module")) return "P1";
  if (status != null && status >= 400) return "P1";
  if (input.source.includes("console.warn")) return "P2";
  return "P1";
}

function classifyKind(input: { http_status?: number | null; code?: string | null; message: string; source: string; url?: string | null }): ErrorIncidentKind {
  const status = input.http_status ?? null;
  const code = String(input.code ?? "").toUpperCase();
  const msg = input.message.toLowerCase();
  const source = input.source.toLowerCase();
  const url = String(input.url ?? "").toLowerCase();

  if (isKnownExternalNoise(input.message, input.source, input.url)) return "external";
  if (status === 401 || status === 403 || code.startsWith("WOO_AUTH_") || msg.includes("unauthorized") || msg.includes("forbidden")) return "auth";
  if (code === "42501" || msg.includes("empresa ativa") || msg.includes("tenant")) return "tenant";
  if (source.includes("network") || source.includes("rpc") || source.includes("edge") || status != null || url.includes("/functions/v1/")) return "network";
  if (source.includes("window") || source.includes("unhandled") || source.includes("console")) return "frontend";
  return "unknown";
}

function eventFromInput(input: IncidentInput): ErrorIncidentEvent {
  const message = toText(input.message).slice(0, 2_000);
  const stack = input.stack ? toText(input.stack).slice(0, 4_000) : null;
  const route = input.route ?? getRoutePathname() ?? (typeof window !== "undefined" ? window.location?.pathname ?? null : null);
  const severity = classifySeverity({ http_status: input.http_status, code: input.code, message, source: input.source });
  const kind = classifyKind({ http_status: input.http_status, code: input.code, message, source: input.source, url: input.url });
  const fingerprint = buildOpsAppErrorFingerprint({
    route,
    code: input.code ?? null,
    httpStatus: input.http_status ?? null,
    method: null,
    url: input.url ?? null,
    message: `${input.source}: ${message}`,
  });
  return {
    id: newId(),
    at: new Date().toISOString(),
    source: input.source,
    message,
    stack,
    route,
    request_id: input.request_id ?? null,
    http_status: input.http_status ?? null,
    code: input.code ?? null,
    url: input.url ?? null,
    severity,
    kind,
    fingerprint,
  };
}

function bumpRecency(fingerprint: string) {
  const idx = incidentsByRecency.indexOf(fingerprint);
  if (idx >= 0) incidentsByRecency.splice(idx, 1);
  incidentsByRecency.unshift(fingerprint);
  if (incidentsByRecency.length <= MAX_INCIDENTS) return;
  const stale = incidentsByRecency.pop();
  if (stale) incidentsByFingerprint.delete(stale);
}

function publish(event: ErrorIncidentEvent) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("revo:error_incident", {
        detail: {
          id: event.id,
          fingerprint: event.fingerprint,
          severity: event.severity,
          kind: event.kind,
        },
      }),
    );
  } catch {
    // ignore
  }
}

export function recordErrorIncident(input: IncidentInput) {
  if (typeof window === "undefined") return null;
  const event = eventFromInput(input);

  if (event.kind === "external") return event;

  const now = Date.now();
  const last = lastEventAt.get(event.fingerprint) ?? 0;
  if (now - last < DEDUPE_WINDOW_MS) return event;
  lastEventAt.set(event.fingerprint, now);

  const prev = incidentsByFingerprint.get(event.fingerprint);
  if (!prev) {
    incidentsByFingerprint.set(event.fingerprint, {
      id: event.id,
      fingerprint: event.fingerprint,
      severity: event.severity,
      kind: event.kind,
      source: event.source,
      message: event.message,
      route: event.route ?? null,
      request_id: event.request_id ?? null,
      url: event.url ?? null,
      http_status: event.http_status ?? null,
      code: event.code ?? null,
      first_seen_at: event.at,
      last_seen_at: event.at,
      occurrences: 1,
      stack_sample: event.stack ?? null,
    });
  } else {
    prev.last_seen_at = event.at;
    prev.occurrences += 1;
    prev.request_id = event.request_id ?? prev.request_id;
    prev.http_status = event.http_status ?? prev.http_status;
    prev.code = event.code ?? prev.code;
    prev.url = event.url ?? prev.url;
    prev.route = event.route ?? prev.route;
    prev.message = event.message || prev.message;
    prev.stack_sample = event.stack ?? prev.stack_sample;
    if (event.severity === "P0" || (event.severity === "P1" && prev.severity === "P2")) prev.severity = event.severity;
    if (event.kind !== "unknown") prev.kind = event.kind;
  }

  bumpRecency(event.fingerprint);
  publish(event);
  return event;
}

export function getErrorIncidentsSnapshot(): ErrorIncident[] {
  return incidentsByRecency
    .map((fingerprint) => incidentsByFingerprint.get(fingerprint))
    .filter(Boolean)
    .map((item) => ({ ...(item as ErrorIncident) }));
}

export function countErrorIncidentsBySeverity(): Record<ErrorIncidentSeverity, number> {
  const out: Record<ErrorIncidentSeverity, number> = { P0: 0, P1: 0, P2: 0 };
  for (const item of incidentsByFingerprint.values()) out[item.severity] += 1;
  return out;
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR");
}

export function buildIncidentPrompt(incident: ErrorIncident, opts?: { userNote?: string | null }) {
  const lastAction = getLastUserAction();
  const modalStack = getModalContextStackSnapshot();
  const actionLine = lastAction ? `${lastAction.label} (${lastAction.route ?? "sem rota"})` : "não informado";
  const modalLine = modalStack.length
    ? modalStack.map((item) => item.logicalRoute || item.name).filter(Boolean).join(" > ")
    : "sem modal ativo";

  const steps = [
    "1) Navegar até a rota indicada.",
    `2) Repetir a ação: ${actionLine}.`,
    "3) Verificar Console e Network.",
    "4) Confirmar se request_id e status batem com este incidente.",
  ];

  const recommendations = [
    incident.kind === "auth" || incident.kind === "tenant"
      ? "- Validar empresa ativa/JWT/header x-empresa-id antes da chamada."
      : "- Validar payload e contrato da chamada RPC/Edge.",
    incident.http_status === 401 || incident.http_status === 403
      ? "- Verificar permissões/RLS e contexto de empresa."
      : "- Verificar resposta HTTP e tratamento de erro no frontend.",
    incident.occurrences > 3 ? "- Priorizar mitigação imediata: erro recorrente." : "- Reproduzir com logging detalhado para confirmar causa raiz.",
  ];

  return [
    "### Resumo executivo",
    `- Severidade: ${incident.severity}`,
    `- Tipo: ${incident.kind}`,
    `- Impacto: ${incident.message}`,
    `- Ocorrências: ${incident.occurrences}`,
    "",
    "### Evidências técnicas",
    `- Fonte: ${incident.source}`,
    `- Rota: ${incident.route ?? "—"}`,
    `- request_id: ${incident.request_id ?? "—"}`,
    `- HTTP: ${incident.http_status ?? "—"} | code: ${incident.code ?? "—"}`,
    `- URL: ${incident.url ?? "—"}`,
    `- Modal stack: ${modalLine}`,
    `- Primeira ocorrência: ${formatWhen(incident.first_seen_at)}`,
    `- Última ocorrência: ${formatWhen(incident.last_seen_at)}`,
    incident.stack_sample ? `- Stack (amostra): ${incident.stack_sample}` : "- Stack (amostra): —",
    "",
    "### Passos para reproduzir",
    ...steps.map((step) => `- ${step}`),
    opts?.userNote ? `- Observação do usuário: ${opts.userNote}` : null,
    "",
    "### Hipóteses prováveis",
    ...recommendations,
    "",
    "### Critério de pronto",
    "- Corrigir causa raiz sem fallback silencioso.",
    "- Confirmar console limpo e network sem 4xx/5xx inesperado no fluxo.",
    "- Adicionar/ajustar teste para evitar regressão.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function clearErrorIncidents() {
  incidentsByFingerprint.clear();
  incidentsByRecency.length = 0;
  lastEventAt.clear();
}
