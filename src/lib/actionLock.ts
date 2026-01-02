export class ActionLockedError extends Error {
  key: string;
  constructor(key: string) {
    super('ACTION_LOCKED');
    this.name = 'ActionLockedError';
    this.key = key;
  }
}

const locks = new Map<string, number>();

export function isActionLocked(key: string): boolean {
  return (locks.get(key) ?? 0) > 0;
}

export async function runWithActionLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const count = locks.get(key) ?? 0;
  if (count > 0) throw new ActionLockedError(key);

  locks.set(key, count + 1);
  try {
    return await fn();
  } finally {
    const next = (locks.get(key) ?? 1) - 1;
    if (next <= 0) locks.delete(key);
    else locks.set(key, next);
  }
}

