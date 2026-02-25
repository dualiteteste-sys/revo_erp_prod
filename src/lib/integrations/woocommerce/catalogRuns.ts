export type CatalogRunItemStatus = 'QUEUED' | 'RUNNING' | 'DONE' | 'ERROR' | 'DEAD' | 'SKIPPED';

export function isTerminalWooRunStatus(status: unknown) {
  const raw = String(status ?? '').toLowerCase();
  return raw === 'done' || raw === 'error' || raw === 'partial';
}

export function computeCatalogRunCounts(items: Array<{ status: CatalogRunItemStatus | string }>) {
  const planned = items.length;
  const done = items.filter((item) => String(item.status) === 'DONE').length;
  const skipped = items.filter((item) => String(item.status) === 'SKIPPED').length;
  const failed = items.filter((item) => String(item.status) === 'ERROR' || String(item.status) === 'DEAD').length;
  const running = items.filter((item) => String(item.status) === 'QUEUED' || String(item.status) === 'RUNNING').length;
  return { planned, done, skipped, failed, running };
}

export function shouldAllowRetryFailed(items: Array<{ status: CatalogRunItemStatus | string }>) {
  return items.some((item) => String(item.status) === 'ERROR' || String(item.status) === 'DEAD');
}
