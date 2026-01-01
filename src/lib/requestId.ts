let lastRequestId: string | null = null;

export function newRequestId(): string {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  lastRequestId = id;
  return id;
}

export function getLastRequestId(): string | null {
  return lastRequestId;
}

