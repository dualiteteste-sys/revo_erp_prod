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
  correlation_id?: string | null;
  http_status?: number | null;
  code?: string | null;
  url?: string | null;
  action?: string | null;
  request_meta?: unknown | null;
  rpc_params?: Record<string, unknown> | null;
  empresa_id?: string | null;
  user_id?: string | null;
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
  correlation_id: string | null;
  action: string | null;
  request_meta: unknown | null;
  rpc_params: Record<string, unknown> | null;
  empresa_id: string | null;
  user_id: string | null;
  url: string | null;
  http_status: number | null;
  code: string | null;
  first_seen_at: string;
  last_seen_at: string;
  occurrences: number;
  occurrence_timestamps: string[];
  stack_sample: string | null;
};

type IncidentInput = {
  source: string;
  message: unknown;
  stack?: unknown;
  route?: string | null;
  request_id?: string | null;
  correlation_id?: string | null;
  http_status?: number | null;
  code?: string | null;
  url?: string | null;
  action?: string | null;
  request_meta?: unknown | null;
  rpc_params?: Record<string, unknown> | null;
};

// ─── Tenant/User context (sync, best-effort) ────────────────
function getTenantContext(): { empresa_id: string | null; user_id: string | null } {
  if (typeof window === "undefined") return { empresa_id: null, user_id: null };
  try {
    const empresa_id = sessionStorage.getItem("revo_active_empresa_id") ?? null;
    // Supabase stores session in localStorage under sb-<ref>-auth-token
    let user_id: string | null = null;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            user_id = parsed?.user?.id ?? null;
          }
        } catch { /* ignore */ }
        break;
      }
    }
    return { empresa_id, user_id };
  } catch {
    return { empresa_id: null, user_id: null };
  }
}

// ─── RPC source auto-link ───────────────────────────────────
// Maps RPC name prefixes to probable source files for quick navigation.
const RPC_SOURCE_MAP: [RegExp, string[]][] = [
  [/^industria_faturamento_/, ["src/services/industriaFaturamento.ts", "supabase/migrations/*ind_faturamento*"]],
  [/^industria_/, ["src/services/industria.ts", "supabase/migrations/*industria*"]],
  [/^fiscal_nfe_/, ["src/services/fiscalNfeEmissoes.ts", "supabase/migrations/*fiscal*nfe*"]],
  [/^fiscal_naturezas_/, ["src/services/fiscalNaturezas.ts", "supabase/migrations/*naturezas*"]],
  [/^fiscal_/, ["src/services/fiscal*.ts", "supabase/migrations/*fiscal*"]],
  [/^fin_/, ["src/services/financeiro*.ts", "supabase/migrations/*fin_*"]],
  [/^vendas_/, ["src/services/vendas*.ts", "supabase/migrations/*vendas*"]],
  [/^estoque_/, ["src/services/estoque*.ts", "supabase/migrations/*estoque*"]],
  [/^ops_/, ["src/services/ops*.ts", "supabase/migrations/*ops*"]],
  [/^woo_/, ["src/services/woo*.ts", "supabase/migrations/*woo*"]],
  [/^pessoas_/, ["src/services/pessoas*.ts", "supabase/migrations/*pessoas*"]],
  [/^produtos_/, ["src/services/produtos*.ts", "supabase/migrations/*produtos*"]],
];

function guessRpcSourceFiles(rpcName: string | null): string[] | null {
  if (!rpcName) return null;
  // Extract RPC name from source label like "rpc:industria_faturamento_listar_elegiveis"
  const clean = rpcName.replace(/^(rpc:|network\.rpc:\s*)/i, "").split(":")[0]?.trim();
  if (!clean) return null;
  for (const [pattern, files] of RPC_SOURCE_MAP) {
    if (pattern.test(clean)) return files;
  }
  return null;
}

function extractRpcName(source: string, message: string, url: string | null): string | null {
  // From URL: /rest/v1/rpc/industria_faturamento_listar_elegiveis
  if (url) {
    const m = url.match(/\/rest\/v1\/rpc\/([^/?#]+)/);
    if (m?.[1]) return decodeURIComponent(m[1]);
  }
  // From message: "rpc:industria_faturamento_listar_elegiveis: column..."
  const msgMatch = message.match(/^rpc:([a-z_]+)/i);
  if (msgMatch?.[1]) return msgMatch[1];
  // From source: "network.rpc"
  if (source.includes("rpc") && url) {
    const m2 = url.match(/\/rpc\/([^/?#]+)/);
    if (m2?.[1]) return decodeURIComponent(m2[1]);
  }
  return null;
}

// ─── Occurrence rate formatting ─────────────────────────────
const MAX_OCCURRENCE_TIMESTAMPS = 100;

function formatOccurrenceRate(timestamps: string[]): string {
  if (timestamps.length <= 1) return `${timestamps.length} ocorrência`;
  const first = new Date(timestamps[0]).getTime();
  const last = new Date(timestamps[timestamps.length - 1]).getTime();
  const spanMs = Math.abs(last - first);
  const spanMin = Math.max(1, Math.round(spanMs / 60_000));
  if (spanMin < 2) return `${timestamps.length} ocorrências em < 1 min`;
  if (spanMin < 60) return `${timestamps.length} ocorrências em ${spanMin} min`;
  const spanH = Math.round(spanMin / 60);
  return `${timestamps.length} ocorrências em ${spanH}h`;
}

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
  const tenant = getTenantContext();
  return {
    id: newId(),
    at: new Date().toISOString(),
    source: input.source,
    message,
    stack,
    route,
    request_id: input.request_id ?? null,
    correlation_id: input.correlation_id ?? null,
    http_status: input.http_status ?? null,
    code: input.code ?? null,
    url: input.url ?? null,
    action: input.action ?? null,
    request_meta: input.request_meta ?? null,
    rpc_params: input.rpc_params ?? null,
    empresa_id: tenant.empresa_id,
    user_id: tenant.user_id,
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
      correlation_id: event.correlation_id ?? null,
      action: event.action ?? null,
      request_meta: event.request_meta ?? null,
      rpc_params: event.rpc_params ?? null,
      empresa_id: event.empresa_id ?? null,
      user_id: event.user_id ?? null,
      url: event.url ?? null,
      http_status: event.http_status ?? null,
      code: event.code ?? null,
      first_seen_at: event.at,
      last_seen_at: event.at,
      occurrences: 1,
      occurrence_timestamps: [event.at],
      stack_sample: event.stack ?? null,
    });
  } else {
    prev.last_seen_at = event.at;
    prev.occurrences += 1;
    if (prev.occurrence_timestamps.length < MAX_OCCURRENCE_TIMESTAMPS) {
      prev.occurrence_timestamps.push(event.at);
    }
    prev.request_id = event.request_id ?? prev.request_id;
    prev.http_status = event.http_status ?? prev.http_status;
    prev.code = event.code ?? prev.code;
    prev.url = event.url ?? prev.url;
    prev.route = event.route ?? prev.route;
    prev.correlation_id = event.correlation_id ?? prev.correlation_id;
    prev.action = event.action ?? prev.action;
    prev.request_meta = event.request_meta ?? prev.request_meta;
    prev.rpc_params = event.rpc_params ?? prev.rpc_params;
    prev.empresa_id = event.empresa_id ?? prev.empresa_id;
    prev.user_id = event.user_id ?? prev.user_id;
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

  const rpcName = extractRpcName(incident.source, incident.message, incident.url);
  const sourceFiles = guessRpcSourceFiles(rpcName ?? incident.message);

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

  // Gather similar incidents (same code+message but different fingerprints)
  const related = findRelatedIncidents(incident);

  return [
    "Resolva o seguinte problema reportado automaticamente pelo sistema de monitoramento:",
    "",
    "### Resumo executivo",
    `- Severidade: ${incident.severity}`,
    `- Tipo: ${incident.kind}`,
    `- Impacto: ${incident.message}`,
    `- Ocorrências: ${formatOccurrenceRate(incident.occurrence_timestamps)}`,
    "",
    "### Evidências técnicas",
    `- Fonte: ${incident.source}`,
    `- Rota: ${incident.route ?? "—"}`,
    `- request_id: ${incident.request_id ?? "—"}`,
    `- correlation_id: ${incident.correlation_id ?? "—"}`,
    `- HTTP: ${incident.http_status ?? "—"} | code: ${incident.code ?? "—"}`,
    `- URL: ${incident.url ?? "—"}`,
    `- Action: ${incident.action ?? "—"}`,
    incident.request_meta ? `- Request meta: ${JSON.stringify(sanitizeLogData(incident.request_meta))}` : null,
    `- Modal stack: ${modalLine}`,
    `- Primeira ocorrência: ${formatWhen(incident.first_seen_at)}`,
    `- Última ocorrência: ${formatWhen(incident.last_seen_at)}`,
    incident.stack_sample ? `- Stack (amostra): ${incident.stack_sample}` : "- Stack (amostra): —",
    "",
    "### Contexto do tenant",
    `- empresa_id: ${incident.empresa_id ?? "—"}`,
    `- user_id: ${incident.user_id ?? "—"}`,
    "",
    incident.rpc_params
      ? [
          "### Payload da request (parâmetros RPC)",
          `\`\`\`json`,
          JSON.stringify(sanitizeLogData(incident.rpc_params), null, 2),
          `\`\`\``,
        ].join("\n")
      : null,
    sourceFiles
      ? [
          "",
          "### Arquivos relacionados (auto-link)",
          ...sourceFiles.map((f) => `- ${f}`),
          rpcName ? `- RPC: \`${rpcName}\`` : null,
        ]
          .filter(Boolean)
          .join("\n")
      : null,
    related.length > 0
      ? [
          "",
          "### Incidentes relacionados (mesmo code/message)",
          ...related.map(
            (r) =>
              `- [${r.severity}] ${r.source} | ${r.route ?? "—"} | ${formatOccurrenceRate(r.occurrence_timestamps)} | last: ${formatWhen(r.last_seen_at)}`,
          ),
        ].join("\n")
      : null,
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
    .filter((line) => line != null)
    .join("\n");
}

/** Find incidents with the same code+message but different fingerprints */
function findRelatedIncidents(incident: ErrorIncident): ErrorIncident[] {
  if (!incident.code && !incident.http_status) return [];
  const related: ErrorIncident[] = [];
  for (const other of incidentsByFingerprint.values()) {
    if (other.fingerprint === incident.fingerprint) continue;
    const sameCode = incident.code && other.code === incident.code;
    const sameStatus = incident.http_status && other.http_status === incident.http_status;
    if (sameCode || sameStatus) {
      related.push({ ...other });
    }
    if (related.length >= 5) break;
  }
  return related;
}

export function clearErrorIncidents() {
  incidentsByFingerprint.clear();
  incidentsByRecency.length = 0;
  lastEventAt.clear();
}
