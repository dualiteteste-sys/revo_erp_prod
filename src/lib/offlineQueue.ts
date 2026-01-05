type StoredValue<T> = { version: 1; items: T[] };

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota/unavailable
  }
}

export type PdvFinalizeQueuedItem = {
  pedidoId: string;
  contaCorrenteId: string;
  createdAt: number;
  attempts: number;
  lastError?: string | null;
};

const PDV_FINALIZE_KEY = 'offlineQueue:pdvFinalize:v1';

export function listPdvFinalizeQueue(): PdvFinalizeQueuedItem[] {
  const v = readJson<StoredValue<PdvFinalizeQueuedItem>>(PDV_FINALIZE_KEY);
  if (!v || v.version !== 1) return [];
  return Array.isArray(v.items) ? v.items : [];
}

export function upsertPdvFinalizeQueue(item: PdvFinalizeQueuedItem): void {
  const items = listPdvFinalizeQueue();
  const next = items.filter((x) => x.pedidoId !== item.pedidoId);
  next.unshift(item);
  writeJson<StoredValue<PdvFinalizeQueuedItem>>(PDV_FINALIZE_KEY, { version: 1, items: next });
}

export function removePdvFinalizeQueue(pedidoId: string): void {
  const items = listPdvFinalizeQueue();
  const next = items.filter((x) => x.pedidoId !== pedidoId);
  writeJson<StoredValue<PdvFinalizeQueuedItem>>(PDV_FINALIZE_KEY, { version: 1, items: next });
}

export function bumpPdvFinalizeAttempt(pedidoId: string, lastError?: string | null): void {
  const items = listPdvFinalizeQueue();
  const next = items.map((x) =>
    x.pedidoId === pedidoId ? { ...x, attempts: (x.attempts || 0) + 1, lastError: lastError ?? null } : x
  );
  writeJson<StoredValue<PdvFinalizeQueuedItem>>(PDV_FINALIZE_KEY, { version: 1, items: next });
}

