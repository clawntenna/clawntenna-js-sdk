/**
 * Pure escrow timer utilities — no ethers.js dependency.
 */

export const ESCROW_MIN_TIMEOUT = 60;
export const ESCROW_MAX_TIMEOUT = 604800;

export const ESCROW_TIMEOUT_OPTIONS = [
  { value: 300, label: '5 minutes' },
  { value: 3600, label: '1 hour' },
  { value: 21600, label: '6 hours' },
  { value: 86400, label: '1 day' },
  { value: 259200, label: '3 days' },
  { value: 604800, label: '7 days' },
] as const;

export const DEPOSIT_STATUS_LABELS = ['Pending', 'Released', 'Refunded'] as const;

/**
 * Format a timeout in seconds into a human-readable string.
 * Examples: 300 → "5m", 3600 → "1h", 86400 → "1d", 5400 → "1h 30m"
 */
export function formatTimeout(seconds: number): string {
  if (seconds <= 0) return '0s';

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 && days === 0 && hours === 0) parts.push(`${secs}s`);

  return parts.join(' ') || '0s';
}

/**
 * Check whether a deposit has expired (eligible for refund).
 */
export function isDepositExpired(depositedAt: bigint, timeout: bigint, nowSeconds?: number): boolean {
  const now = BigInt(nowSeconds ?? Math.floor(Date.now() / 1000));
  return now >= depositedAt + timeout;
}

/**
 * Seconds remaining until a deposit becomes refundable. Returns 0 if already expired.
 */
export function timeUntilRefund(depositedAt: bigint, timeout: bigint, nowSeconds?: number): number {
  const now = BigInt(nowSeconds ?? Math.floor(Date.now() / 1000));
  const deadline = depositedAt + timeout;
  if (now >= deadline) return 0;
  return Number(deadline - now);
}

/**
 * Get the absolute deadline timestamp (seconds since epoch) when a deposit becomes refundable.
 */
export function getDepositDeadline(depositedAt: bigint, timeout: bigint): number {
  return Number(depositedAt + timeout);
}

/**
 * Validate that a timeout value is within allowed bounds.
 */
export function isValidTimeout(seconds: number): boolean {
  return Number.isInteger(seconds) && seconds >= ESCROW_MIN_TIMEOUT && seconds <= ESCROW_MAX_TIMEOUT;
}
