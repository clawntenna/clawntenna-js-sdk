import { describe, it, expect, vi } from 'vitest';
import { withRetry, isRetryableError, DEFAULT_RETRY } from '../../src/retry.js';

describe('isRetryableError', () => {
  it('matches 429 status code', () => {
    expect(isRetryableError(new Error('HTTP 429 Too Many Requests'))).toBe(true);
  });

  it('matches rate limit message', () => {
    expect(isRetryableError(new Error('rate limit exceeded'))).toBe(true);
  });

  it('matches too many requests', () => {
    expect(isRetryableError(new Error('too many requests'))).toBe(true);
  });

  it('matches timeout', () => {
    expect(isRetryableError(new Error('request TIMEOUT'))).toBe(true);
  });

  it('matches ECONNRESET', () => {
    expect(isRetryableError(new Error('read ECONNRESET'))).toBe(true);
  });

  it('matches 502', () => {
    expect(isRetryableError(new Error('502 Bad Gateway'))).toBe(true);
  });

  it('matches 503', () => {
    expect(isRetryableError(new Error('503 Service Unavailable'))).toBe(true);
  });

  it('matches 504', () => {
    expect(isRetryableError(new Error('504 Gateway Timeout'))).toBe(true);
  });

  it('matches server error', () => {
    expect(isRetryableError(new Error('Internal server error'))).toBe(true);
  });

  it('does NOT match BAD_DATA (permanent)', () => {
    expect(isRetryableError(new Error('BAD_DATA'))).toBe(false);
  });

  it('does NOT match decode errors (permanent)', () => {
    expect(isRetryableError(new Error('could not decode result data'))).toBe(false);
  });

  it('does NOT match random errors', () => {
    expect(isRetryableError(new Error('user rejected transaction'))).toBe(false);
  });

  it('is case insensitive', () => {
    expect(isRetryableError(new Error('RATE LIMIT'))).toBe(true);
    expect(isRetryableError(new Error('Too Many Requests'))).toBe(true);
  });
});

describe('withRetry', () => {
  it('returns immediately on success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable error and succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('429 rate limited'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { baseDelayMs: 1, maxDelayMs: 1, maxRetries: 3 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after maxRetries exhausted', async () => {
    const err = new Error('429 rate limited');
    const fn = vi.fn().mockRejectedValue(err);

    await expect(
      withRetry(fn, { baseDelayMs: 1, maxDelayMs: 1, maxRetries: 2 })
    ).rejects.toThrow('429 rate limited');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does NOT retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('BAD_DATA'));

    await expect(
      withRetry(fn, { baseDelayMs: 1, maxDelayMs: 1, maxRetries: 3 })
    ).rejects.toThrow('BAD_DATA');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry non-Error throws', async () => {
    const fn = vi.fn().mockRejectedValue('string error');

    await expect(
      withRetry(fn, { baseDelayMs: 1, maxDelayMs: 1, maxRetries: 3 })
    ).rejects.toBe('string error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses default options', () => {
    expect(DEFAULT_RETRY.maxRetries).toBe(3);
    expect(DEFAULT_RETRY.baseDelayMs).toBe(1000);
    expect(DEFAULT_RETRY.maxDelayMs).toBe(10_000);
  });

  it('respects partial options override', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { baseDelayMs: 1, maxDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
