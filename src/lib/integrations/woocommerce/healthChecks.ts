import type { WooStatusResponse } from '@/services/woocommerceControlPanel';

export type WooHealthCheckCode =
  | 'WORKER_LAG'
  | 'WEBHOOK_STALE'
  | 'AUTH_FAILING'
  | 'ERROR_RATE'
  | 'MAP_CONFLICTS'
  | 'ORDER_IMPORT_STALE';

export type WooHealthSeverity = 'info' | 'warning' | 'critical';

export type WooStoreHealthCheck = {
  code: WooHealthCheckCode;
  severity: WooHealthSeverity;
  store_id: string;
  store_url: string;
  message: string;
  next_action: string;
  panel_link: string;
};

export type WooHealthThresholds = {
  workerErrorCritical: number;
  workerQueuedWarning: number;
  webhookStaleWarningMin: number;
  webhookStaleCriticalMin: number;
  errorRateWarningMinJobs: number;
  errorRateWarningRatio: number;
  errorRateCriticalMinJobs: number;
  errorRateCriticalRatio: number;
  orderImportStaleWarningMin: number;
  orderImportStaleCriticalMin: number;
};

const DEFAULT_THRESHOLDS: WooHealthThresholds = {
  workerErrorCritical: 5,
  workerQueuedWarning: 10,
  webhookStaleWarningMin: 60,
  webhookStaleCriticalMin: 180,
  errorRateWarningMinJobs: 2,
  errorRateWarningRatio: 0.2,
  errorRateCriticalMinJobs: 3,
  errorRateCriticalRatio: 0.5,
  orderImportStaleWarningMin: 120,
  orderImportStaleCriticalMin: 360,
};

function getEnvNumber(name: string, fallback: number): number {
  const raw = Number((import.meta as any)?.env?.[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function resolveThresholds(overrides?: Partial<WooHealthThresholds>): WooHealthThresholds {
  return {
    workerErrorCritical: getEnvNumber('VITE_WOO_WORKER_ERROR_CRITICAL', DEFAULT_THRESHOLDS.workerErrorCritical),
    workerQueuedWarning: getEnvNumber('VITE_WOO_WORKER_QUEUED_WARNING', DEFAULT_THRESHOLDS.workerQueuedWarning),
    webhookStaleWarningMin: getEnvNumber('VITE_WOO_WEBHOOK_STALE_WARN_MIN', DEFAULT_THRESHOLDS.webhookStaleWarningMin),
    webhookStaleCriticalMin: getEnvNumber('VITE_WOO_WEBHOOK_STALE_CRITICAL_MIN', DEFAULT_THRESHOLDS.webhookStaleCriticalMin),
    errorRateWarningMinJobs: getEnvNumber('VITE_WOO_ERROR_RATE_WARN_MIN_JOBS', DEFAULT_THRESHOLDS.errorRateWarningMinJobs),
    errorRateWarningRatio: getEnvNumber('VITE_WOO_ERROR_RATE_WARN_RATIO', DEFAULT_THRESHOLDS.errorRateWarningRatio),
    errorRateCriticalMinJobs: getEnvNumber('VITE_WOO_ERROR_RATE_CRITICAL_MIN_JOBS', DEFAULT_THRESHOLDS.errorRateCriticalMinJobs),
    errorRateCriticalRatio: getEnvNumber('VITE_WOO_ERROR_RATE_CRITICAL_RATIO', DEFAULT_THRESHOLDS.errorRateCriticalRatio),
    orderImportStaleWarningMin: getEnvNumber('VITE_WOO_ORDER_IMPORT_STALE_WARN_MIN', DEFAULT_THRESHOLDS.orderImportStaleWarningMin),
    orderImportStaleCriticalMin: getEnvNumber('VITE_WOO_ORDER_IMPORT_STALE_CRITICAL_MIN', DEFAULT_THRESHOLDS.orderImportStaleCriticalMin),
    ...(overrides ?? {}),
  };
}

function minutesBetween(nowMs: number, iso?: string | null): number | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  const diff = Math.max(0, nowMs - ts);
  return Math.floor(diff / 60000);
}

function hasAuthError(status: WooStatusResponse): boolean {
  return (status.recent_errors ?? []).some((item) => {
    const code = String(item.code ?? '');
    return code === 'WOO_AUTH_INVALID' || code === 'WOO_AUTH_FORBIDDEN' || code === 'WOO_AUTH_FAILED';
  });
}

function buildCheck(params: {
  code: WooHealthCheckCode;
  severity: WooHealthSeverity;
  storeId: string;
  storeUrl: string;
  message: string;
  nextAction: string;
}): WooStoreHealthCheck {
  return {
    code: params.code,
    severity: params.severity,
    store_id: params.storeId,
    store_url: params.storeUrl,
    message: params.message,
    next_action: params.nextAction,
    panel_link: `/app/desenvolvedor/woocommerce/${params.storeId}`,
  };
}

function workerLagCheck(storeId: string, storeUrl: string, status: WooStatusResponse, thresholds: WooHealthThresholds): WooStoreHealthCheck {
  const queue = status.queue ?? { queued: 0, running: 0, error: 0, dead: 0, total: 0, lag_hint: '' };
  if ((queue.dead ?? 0) > 0 || (queue.error ?? 0) >= thresholds.workerErrorCritical) {
    return buildCheck({
      code: 'WORKER_LAG',
      severity: 'critical',
      storeId,
      storeUrl,
      message: `Fila degradada: dead=${queue.dead ?? 0}, error=${queue.error ?? 0}.`,
      nextAction: 'Execute "Run worker now", trate DLQ e reavalie retries.',
    });
  }
  if ((queue.queued ?? 0) >= thresholds.workerQueuedWarning || ((queue.queued ?? 0) > 0 && (queue.running ?? 0) === 0)) {
    return buildCheck({
      code: 'WORKER_LAG',
      severity: 'warning',
      storeId,
      storeUrl,
      message: `Fila acumulada: queued=${queue.queued ?? 0}, running=${queue.running ?? 0}.`,
      nextAction: 'Rode worker manualmente e valide scheduler/chave do worker.',
    });
  }
  return buildCheck({
    code: 'WORKER_LAG',
    severity: 'info',
    storeId,
    storeUrl,
    message: 'Fila do worker está sob controle.',
    nextAction: 'Sem ação imediata.',
  });
}

function webhookStaleCheck(storeId: string, storeUrl: string, status: WooStatusResponse, nowMs: number, thresholds: WooHealthThresholds): WooStoreHealthCheck {
  const minutes = minutesBetween(nowMs, status.webhooks?.last_received_at ?? null);
  const activeStore = String(status.store?.status ?? '').toLowerCase() === 'active';
  if (activeStore && (minutes == null || minutes > thresholds.webhookStaleCriticalMin)) {
    return buildCheck({
      code: 'WEBHOOK_STALE',
      severity: 'critical',
      storeId,
      storeUrl,
      message: minutes == null ? 'Nenhum webhook recente detectado.' : `Sem webhook há ${minutes} min.`,
      nextAction: 'Re-registrar webhooks e validar endpoint público/assinatura.',
    });
  }
  if (activeStore && minutes != null && minutes > thresholds.webhookStaleWarningMin) {
    return buildCheck({
      code: 'WEBHOOK_STALE',
      severity: 'warning',
      storeId,
      storeUrl,
      message: `Webhooks lentos: último evento há ${minutes} min.`,
      nextAction: 'Verifique tráfego no Woo e latência da fila de eventos.',
    });
  }
  return buildCheck({
    code: 'WEBHOOK_STALE',
    severity: 'info',
    storeId,
    storeUrl,
    message: 'Fluxo de webhooks sem atraso relevante.',
    nextAction: 'Sem ação imediata.',
  });
}

function authFailingCheck(storeId: string, storeUrl: string, status: WooStatusResponse): WooStoreHealthCheck {
  const healthStatus = String(status.health?.status ?? '').toLowerCase();
  const authError = hasAuthError(status);
  if (authError || (healthStatus === 'error' && String(status.store?.status ?? '').toLowerCase() === 'paused')) {
    return buildCheck({
      code: 'AUTH_FAILING',
      severity: 'critical',
      storeId,
      storeUrl,
      message: 'Falha de autenticação/autorizaçao detectada (store em risco de pausa).',
      nextAction: 'Revalidar credenciais/proxy, executar healthcheck e unpause quando estabilizar.',
    });
  }
  if (healthStatus === 'error') {
    return buildCheck({
      code: 'AUTH_FAILING',
      severity: 'warning',
      storeId,
      storeUrl,
      message: 'Healthcheck em erro; possível problema de autenticação.',
      nextAction: 'Executar healthcheck e revisar hints de erro no painel.',
    });
  }
  return buildCheck({
    code: 'AUTH_FAILING',
    severity: 'info',
    storeId,
    storeUrl,
    message: 'Sem indícios de falha de autenticação.',
    nextAction: 'Sem ação imediata.',
  });
}

function errorRateCheck(storeId: string, storeUrl: string, status: WooStatusResponse, thresholds: WooHealthThresholds): WooStoreHealthCheck {
  const jobs = status.jobs ?? [];
  if (!jobs.length) {
    return buildCheck({
      code: 'ERROR_RATE',
      severity: 'info',
      storeId,
      storeUrl,
      message: 'Sem jobs recentes para medir taxa de erro.',
      nextAction: 'Sem ação imediata.',
    });
  }
  const errorCount = jobs.filter((job) => job.status === 'error' || job.status === 'dead').length;
  const errorRate = errorCount / jobs.length;
  if (errorCount >= thresholds.errorRateCriticalMinJobs && errorRate >= thresholds.errorRateCriticalRatio) {
    return buildCheck({
      code: 'ERROR_RATE',
      severity: 'critical',
      storeId,
      storeUrl,
      message: `Taxa de erro elevada: ${errorCount}/${jobs.length} jobs com falha.`,
      nextAction: 'Analisar logs, corrigir causa raiz e reprocessar DLQ.',
    });
  }
  if (errorCount >= thresholds.errorRateWarningMinJobs && errorRate >= thresholds.errorRateWarningRatio) {
    return buildCheck({
      code: 'ERROR_RATE',
      severity: 'warning',
      storeId,
      storeUrl,
      message: `Taxa de erro em atenção: ${errorCount}/${jobs.length}.`,
      nextAction: 'Monitorar tendência e antecipar correções nos jobs com erro.',
    });
  }
  return buildCheck({
    code: 'ERROR_RATE',
    severity: 'info',
    storeId,
    storeUrl,
    message: 'Taxa de erro recente estável.',
    nextAction: 'Sem ação imediata.',
  });
}

function mapConflictsCheck(storeId: string, storeUrl: string, status: WooStatusResponse): WooStoreHealthCheck {
  const map = status.map_quality ?? { total: 0, missing_revo_map: 0, duplicated_skus: 0 };
  if ((map.duplicated_skus ?? 0) > 0) {
    return buildCheck({
      code: 'MAP_CONFLICTS',
      severity: 'critical',
      storeId,
      storeUrl,
      message: `Conflito no map: ${map.duplicated_skus} SKU(s) duplicado(s).`,
      nextAction: 'Resolver SKUs duplicados e executar rebuild map.',
    });
  }
  if ((map.missing_revo_map ?? 0) > 0) {
    return buildCheck({
      code: 'MAP_CONFLICTS',
      severity: 'warning',
      storeId,
      storeUrl,
      message: `${map.missing_revo_map} SKU(s) sem vínculo com produto Revo.`,
      nextAction: 'Revisar cadastros/SKU e reconstruir o product map.',
    });
  }
  return buildCheck({
    code: 'MAP_CONFLICTS',
    severity: 'info',
    storeId,
    storeUrl,
    message: 'Product map sem conflitos detectados.',
    nextAction: 'Sem ação imediata.',
  });
}

function orderImportStaleCheck(storeId: string, storeUrl: string, status: WooStatusResponse, nowMs: number, thresholds: WooHealthThresholds): WooStoreHealthCheck {
  const minutes = minutesBetween(nowMs, status.orders?.last_imported_at ?? null);
  const recentWebhook = status.webhooks?.received_recent ?? 0;
  if ((recentWebhook > 0 && minutes == null) || (minutes != null && minutes > thresholds.orderImportStaleCriticalMin)) {
    return buildCheck({
      code: 'ORDER_IMPORT_STALE',
      severity: 'critical',
      storeId,
      storeUrl,
      message: minutes == null ? 'Há webhooks sem import de pedidos confirmada.' : `Import de pedidos estagnado há ${minutes} min.`,
      nextAction: 'Executar replay por order_id/reconcile e validar worker.',
    });
  }
  if (minutes != null && minutes > thresholds.orderImportStaleWarningMin) {
    return buildCheck({
      code: 'ORDER_IMPORT_STALE',
      severity: 'warning',
      storeId,
      storeUrl,
      message: `Último import de pedido há ${minutes} min.`,
      nextAction: 'Monitorar fila de pedidos e conferir webhooks recentes.',
    });
  }
  return buildCheck({
    code: 'ORDER_IMPORT_STALE',
    severity: 'info',
    storeId,
    storeUrl,
    message: 'Importação de pedidos dentro da janela esperada.',
    nextAction: 'Sem ação imediata.',
  });
}

export function evaluateWooStoreHealthChecks(params: {
  storeId: string;
  storeUrl: string;
  status: WooStatusResponse;
  now?: Date;
  thresholds?: Partial<WooHealthThresholds>;
}): WooStoreHealthCheck[] {
  const nowMs = (params.now ?? new Date()).getTime();
  const thresholds = resolveThresholds(params.thresholds);
  return [
    workerLagCheck(params.storeId, params.storeUrl, params.status, thresholds),
    webhookStaleCheck(params.storeId, params.storeUrl, params.status, nowMs, thresholds),
    authFailingCheck(params.storeId, params.storeUrl, params.status),
    errorRateCheck(params.storeId, params.storeUrl, params.status, thresholds),
    mapConflictsCheck(params.storeId, params.storeUrl, params.status),
    orderImportStaleCheck(params.storeId, params.storeUrl, params.status, nowMs, thresholds),
  ];
}

export function healthSeverityRank(severity: WooHealthSeverity): number {
  if (severity === 'critical') return 3;
  if (severity === 'warning') return 2;
  return 1;
}
