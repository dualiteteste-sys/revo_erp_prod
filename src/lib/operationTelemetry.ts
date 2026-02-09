import { logger } from '@/lib/logger';
import { getLastRequestId } from '@/lib/requestId';

export type OperationTelemetryStatus = 'start' | 'success' | 'error';

export interface OperationTelemetryScope {
  domain: string;
  action: string;
  tenantId?: string | null;
  entityId?: string | null;
  requestId?: string | null;
}

export interface OperationTelemetrySession {
  scope: OperationTelemetryScope;
  startedAt: number;
}

function resolveRequestId(scope: OperationTelemetryScope): string | null {
  if (scope.requestId) return scope.requestId;
  return getLastRequestId();
}

function buildContext(
  session: OperationTelemetrySession,
  status: OperationTelemetryStatus,
  extra?: Record<string, unknown>,
  failedAt?: number
) {
  return {
    domain: session.scope.domain,
    action: session.scope.action,
    tenant_id: session.scope.tenantId ?? null,
    entity_id: session.scope.entityId ?? null,
    request_id: resolveRequestId(session.scope),
    status,
    duration_ms: failedAt ? Math.max(0, Math.round(failedAt - session.startedAt)) : undefined,
    ...extra,
  };
}

export function startOperation(scope: OperationTelemetryScope, extra?: Record<string, unknown>): OperationTelemetrySession {
  const session: OperationTelemetrySession = {
    scope,
    startedAt: Date.now(),
  };
  logger.info('[OP][START]', buildContext(session, 'start', extra));
  return session;
}

export function succeedOperation(session: OperationTelemetrySession, extra?: Record<string, unknown>) {
  const now = Date.now();
  logger.info('[OP][SUCCESS]', buildContext(session, 'success', extra, now));
}

export function failOperation(
  session: OperationTelemetrySession,
  error: unknown,
  extra?: Record<string, unknown>,
  message = '[OP][ERROR]'
) {
  const now = Date.now();
  logger.error(message, error, buildContext(session, 'error', extra, now));
}
