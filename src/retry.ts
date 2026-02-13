export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10_000,
};

const RETRYABLE_PATTERNS = [
  '429',
  'rate limit',
  'too many requests',
  'timeout',
  'econnreset',
  '502',
  '503',
  '504',
  'server error',
];

export function isRetryableError(err: Error): boolean {
  const msg = (err.message ?? '').toLowerCase();
  return RETRYABLE_PATTERNS.some((p) => msg.includes(p));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>,
): Promise<T> {
  const opts = { ...DEFAULT_RETRY, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === opts.maxRetries) break;
      if (!(err instanceof Error) || !isRetryableError(err)) break;

      const delay = Math.min(opts.baseDelayMs * 2 ** attempt, opts.maxDelayMs);
      const jitter = Math.random() * 0.25 * delay;
      await new Promise((r) => setTimeout(r, delay + jitter));
    }
  }

  throw lastError;
}
