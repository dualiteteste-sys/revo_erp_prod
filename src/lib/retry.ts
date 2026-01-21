type ModernRetryOptions = {
  delaysMs: number[];
  isRetryable: (error: unknown) => boolean;
  onRetry?: (ctx: { attempt: number; delayMs: number; error: unknown }) => void;
};

type LegacyRetryOptions = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio?: number;
  shouldRetry: (error: unknown) => boolean;
  onRetry?: (ctx: { attempt: number; delayMs: number; error: unknown }) => void;
};

export type RetryOptions = ModernRetryOptions | LegacyRetryOptions;

export function isTransientNetworkError(error: unknown): boolean {
  const message = String((error as any)?.message ?? '');
  const code = String((error as any)?.code ?? '');
  const status = (error as any)?.status;

  if (typeof status === 'number' && [408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT') return true;
  return /failed to fetch|fetch failed|network|timeout|temporar|upstream|service unavailable|rate limit/i.test(message);
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions
): Promise<T> {
  // Modern form: explicit delays
  if ("delaysMs" in opts) {
    const delays = opts.delaysMs.length ? opts.delaysMs : [0];
    let lastError: unknown;

    for (let attempt = 0; attempt < delays.length; attempt++) {
      try {
        if (attempt > 0) {
          const delayMs = delays[attempt] ?? 0;
          opts.onRetry?.({ attempt, delayMs, error: lastError });
          if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
        }
        return await fn(attempt);
      } catch (error) {
        lastError = error;
        const shouldRetry = attempt < delays.length - 1 && opts.isRetryable(error);
        if (!shouldRetry) throw error;
      }
    }

    throw lastError;
  }

  // Legacy form: exponential backoff + jitter
  const maxAttempts = Math.max(1, opts.maxAttempts);
  const jitterRatio = typeof opts.jitterRatio === "number" ? opts.jitterRatio : 0.2;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (attempt > 0) {
        const rawDelay = Math.min(opts.baseDelayMs * 2 ** (attempt - 1), opts.maxDelayMs);
        const jitter = rawDelay * jitterRatio * (Math.random() * 2 - 1);
        const delayMs = Math.max(0, Math.round(rawDelay + jitter));
        opts.onRetry?.({ attempt, delayMs, error: lastError });
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      }
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const shouldRetry = attempt < maxAttempts - 1 && opts.shouldRetry(error);
      if (!shouldRetry) throw error;
    }
  }

  throw lastError;
}
