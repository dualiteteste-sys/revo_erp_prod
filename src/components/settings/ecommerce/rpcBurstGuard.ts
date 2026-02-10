type RpcGuardConfig = {
  windowMs?: number;
  maxCallsPerWindow?: number;
  blockMs?: number;
  now?: () => number;
};

type Bucket = {
  blockedUntil: number;
  timestamps: number[];
};

type RpcGuardResult = {
  allowed: boolean;
  retryAfterMs?: number;
};

export function createRpcBurstGuard(config?: RpcGuardConfig) {
  const windowMs = config?.windowMs ?? 15000;
  const maxCallsPerWindow = config?.maxCallsPerWindow ?? 12;
  const blockMs = config?.blockMs ?? 30000;
  const now = config?.now ?? (() => Date.now());
  const buckets = new Map<string, Bucket>();

  const cleanup = (bucket: Bucket, nowMs: number) => {
    bucket.timestamps = bucket.timestamps.filter((t) => nowMs - t <= windowMs);
  };

  const check = (key: string): RpcGuardResult => {
    const nowMs = now();
    const bucket = buckets.get(key) ?? { blockedUntil: 0, timestamps: [] };
    cleanup(bucket, nowMs);

    if (bucket.blockedUntil > nowMs) {
      buckets.set(key, bucket);
      return { allowed: false, retryAfterMs: bucket.blockedUntil - nowMs };
    }

    bucket.timestamps.push(nowMs);
    if (bucket.timestamps.length > maxCallsPerWindow) {
      bucket.blockedUntil = nowMs + blockMs;
      buckets.set(key, bucket);
      return { allowed: false, retryAfterMs: blockMs };
    }

    buckets.set(key, bucket);
    return { allowed: true };
  };

  return { check };
}

