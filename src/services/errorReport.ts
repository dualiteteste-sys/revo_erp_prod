import { supabase } from "@/lib/supabaseClient";
import { getRecentNetworkErrors } from "@/lib/telemetry/networkErrors";
import { getRoutePathname } from "@/lib/telemetry/routeSnapshot";
import { getModalContextStackSnapshot } from "@/lib/telemetry/modalContextStack";
import { getLastUserAction } from "@/lib/telemetry/lastUserAction";
import { getNetworkTracesSnapshot } from "@/lib/telemetry/networkTraceBuffer";
import { getBreadcrumbsSnapshot } from "@/lib/telemetry/breadcrumbsBuffer";
import { getConsoleRedEventsSnapshot } from "@/lib/telemetry/consoleRedBuffer";
import { sanitizeLogData } from "@/lib/sanitizeLog";

export type ErrorReportPayload = {
  sentry_event_id: string;
  user_message: string;
  user_email?: string | null;
  client_error?: {
    name: string | null;
    message: string | null;
    stack: string | null;
  } | null;
  diagnostic_snapshot?: unknown | null;
};

function hashFNV1a(input: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export async function sendErrorReport(payload: ErrorReportPayload) {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user ?? null;

  const { data: empresaId } = await (supabase as any).rpc("active_empresa_get_for_current_user");

  const errorId = (() => {
    try {
      return crypto.randomUUID();
    } catch {
      return `err_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
    }
  })();

  const liveAction = getLastUserAction();
  const activeEmpresaIdFromStorage = (() => {
    try {
      return typeof window !== "undefined" ? sessionStorage.getItem("revo_active_empresa_id") : null;
    } catch {
      return null;
    }
  })();

  const errorName = payload.client_error?.name ?? null;
  const errorMessage = payload.client_error?.message ?? null;
  const stackTrace = payload.client_error?.stack ?? null;
  const stackFingerprint = hashFNV1a(`${errorName ?? ""}|${errorMessage ?? ""}|${stackTrace ?? ""}`.slice(0, 20_000));

  const diagnosticFromPayload = payload.diagnostic_snapshot ?? null;
  const diagnosticLive = {
    captured_at: new Date().toISOString(),
    route_base: getRoutePathname() ?? (typeof window !== "undefined" ? window.location?.pathname ?? null : null),
    modal_context_stack: getModalContextStackSnapshot(),
    last_user_action: liveAction ? { label: liveAction.label, age_ms: liveAction.ageMs, route: liveAction.route } : null,
    requests_recent: getNetworkTracesSnapshot(),
    breadcrumbs: getBreadcrumbsSnapshot(),
    console_red_events: getConsoleRedEventsSnapshot(),
  };

  const body = {
    ...payload,
    error_id: errorId,
    context: {
      url: typeof window !== "undefined" ? window.location.href : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      user_id: user?.id ?? null,
      empresa_id: empresaId,
      tenant_resolution_flags: {
        tenant_resolved: Boolean(empresaId),
        tenant_source: activeEmpresaIdFromStorage ? "sessionStorage(revo_active_empresa_id)" : null,
      },
      device: {
        locale: typeof navigator !== "undefined" ? navigator.language : null,
        timezone: (() => {
          try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
          } catch {
            return null;
          }
        })(),
        viewport: typeof window !== "undefined" ? { w: window.innerWidth, h: window.innerHeight } : null,
      },
      app: {
        env: import.meta.env.MODE,
        prod: import.meta.env.PROD,
      },
      error: sanitizeLogData({
        name: errorName,
        message: errorMessage,
        stack_trace: stackTrace ? String(stackTrace).slice(0, 20_000) : null,
        stack_fingerprint: stackFingerprint,
      }),
      diagnostic: sanitizeLogData(diagnosticFromPayload ?? diagnosticLive),
    },
    recent_network_errors: getRecentNetworkErrors(),
  };

  const { data, error } = await supabase.functions.invoke("error-report", {
    body,
  });

  if (error) throw error;
  return data as any;
}
