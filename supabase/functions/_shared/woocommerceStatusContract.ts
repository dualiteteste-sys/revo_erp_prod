import { WOO_ERROR_CATALOG_VERSION } from "./woocommerceErrors.ts";

type AnyRow = Record<string, unknown>;

function lagSecondsFromIso(iso: string | null): number {
  if (!iso) return 0;
  const ts = new Date(String(iso)).getTime();
  if (!Number.isFinite(ts)) return 0;
  return Math.max(0, Math.floor((Date.now() - ts) / 1000));
}

function normalizeErrorCode(raw: unknown): string {
  const text = String(raw ?? "").trim();
  if (!text) return "WOO_UNEXPECTED";
  return text.split(":")[0] || "WOO_UNEXPECTED";
}

function recommendationsFromStatus(input: {
  storeStatus: string;
  deadJobs: number;
  invalidWebhooks: number;
  droppedWebhooks: number;
  mapDuplicates: number;
  orderImportLagSeconds: number;
  authFailing: boolean;
}): string[] {
  const hints: string[] = [];
  if (input.storeStatus === "paused") hints.push("Store pausada. Corrija credenciais e rode healthcheck.");
  if (input.authFailing) hints.push("Falha de autenticação/autorização Woo detectada. Revise credenciais e proxy/WAF.");
  if (input.deadJobs > 0) hints.push("Existem jobs em dead-letter. Reprocessar apos correcao.");
  if (input.invalidWebhooks > 0) hints.push("Webhooks com assinatura invalida detectados.");
  if (input.droppedWebhooks > 0) hints.push("Webhooks descartados por limite. Reconcile automático foi enfileirado.");
  if (input.mapDuplicates > 0) hints.push("Conflitos de SKU detectados. Execute product_map.build.");
  if (input.orderImportLagSeconds > 3600) hints.push("Importacao de pedidos sem atualizacao recente.");
  return hints;
}

export function buildWooStoreStatusContract(params: {
  store: AnyRow;
  queueCounts: { queued: number; running: number; error: number; dead: number };
  mapQuality: { total: number; missing_revo_map: number; duplicated_skus: number };
  webhookEvents: AnyRow[];
  jobs: AnyRow[];
  logs: AnyRow[];
  orderMapLatest: AnyRow | null;
}) {
  const webhookEvents = params.webhookEvents ?? [];
  const jobs = params.jobs ?? [];
  const logs = params.logs ?? [];
  const newestWebhookIso = webhookEvents.length > 0 ? String(webhookEvents[0]?.received_at ?? "") : null;
  const oldestQueuedIso = jobs
    .filter((job) => String(job?.status ?? "") === "queued")
    .map((job) => String(job?.next_run_at ?? ""))
    .filter(Boolean)
    .sort()[0] ?? null;

  const invalidWebhooks = webhookEvents.filter((event) => String(event?.process_status ?? "") === "error").length;
  const droppedWebhooks = webhookEvents.filter((event) => String(event?.process_status ?? "") === "dropped").length;
  const webhookDone = webhookEvents.filter((event) => String(event?.process_status ?? "") === "done").length;
  const webhookQueued = webhookEvents.filter((event) => String(event?.process_status ?? "") === "queued").length;

  const orderLatestIso = params.orderMapLatest?.woo_updated_at ? String(params.orderMapLatest.woo_updated_at) : null;
  const orderImportLag = lagSecondsFromIso(orderLatestIso);

  const recentErrors = logs
    .filter((row) => String(row?.level ?? "") === "error")
    .slice(0, 10)
    .map((row) => ({
      at: row?.created_at ?? null,
      code: normalizeErrorCode((row?.meta as Record<string, unknown> | undefined)?.code ?? row?.message),
      message: row?.message ?? null,
      hint: (row?.meta as Record<string, unknown> | undefined)?.hint ?? null,
      job_id: row?.job_id ?? null,
    }));
  const authFailing = recentErrors.some((row) => ["WOO_AUTH_INVALID", "WOO_AUTH_FORBIDDEN", "WOO_AUTH_FAILED"].includes(String(row.code ?? "")));

  const health = {
    store_status: String(params.store?.status ?? "unknown"),
    queue_lag_seconds: lagSecondsFromIso(oldestQueuedIso),
    last_webhook_seconds: lagSecondsFromIso(newestWebhookIso),
    order_import_lag_seconds: orderImportLag,
    is_degraded: params.queueCounts.dead > 0 || params.queueCounts.error > 0 || invalidWebhooks > 0 || droppedWebhooks > 0,
  };

  const contract = {
    version: "v1",
    generated_at: new Date().toISOString(),
    error_catalog_version: WOO_ERROR_CATALOG_VERSION,
    store: {
      id: params.store?.id ?? null,
      status: params.store?.status ?? null,
      base_url: params.store?.base_url ?? null,
      auth_mode: params.store?.auth_mode ?? null,
      last_healthcheck_at: params.store?.last_healthcheck_at ?? null,
    },
    health,
    queue: {
      ...params.queueCounts,
      pending_total: params.queueCounts.queued + params.queueCounts.error,
      inflight_total: params.queueCounts.running,
    },
    webhooks: {
      recent_total: webhookEvents.length,
      queued: webhookQueued,
      done: webhookDone,
      invalid_or_error: invalidWebhooks,
      dropped: droppedWebhooks,
      last_received_at: newestWebhookIso,
    },
    orders: {
      imported_total_seen: params.orderMapLatest ? 1 : 0,
      last_woo_updated_at: orderLatestIso,
      import_lag_seconds: orderImportLag,
    },
    map_quality: params.mapQuality,
    recommendations: recommendationsFromStatus({
      storeStatus: String(params.store?.status ?? "unknown"),
      deadJobs: params.queueCounts.dead,
      invalidWebhooks,
      droppedWebhooks,
      mapDuplicates: Number(params.mapQuality.duplicated_skus ?? 0),
      orderImportLagSeconds: orderImportLag,
      authFailing,
    }),
    recent_errors: recentErrors,
  };

  return contract;
}
