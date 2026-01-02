export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function computeDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number, jitterRatio: number): number {
  const exp = baseDelayMs * Math.pow(2, Math.max(0, attempt - 1));
  const capped = Math.min(exp, maxDelayMs);
  const jitter = capped * clamp(jitterRatio, 0, 1) * (Math.random() * 2 - 1); // +/- jitter
  return Math.max(0, Math.round(capped + jitter));
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 350;
  const maxDelayMs = options.maxDelayMs ?? 4000;
  const jitterRatio = options.jitterRatio ?? 0.25;
  const shouldRetry = options.shouldRetry ?? (() => false);

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      const canRetry = attempt < maxAttempts && shouldRetry(err, attempt);
      if (!canRetry) break;
      const delayMs = computeDelayMs(attempt, baseDelayMs, maxDelayMs, jitterRatio);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

