import { describe, it, expect } from 'vitest';
import {
  formatTimeout,
  isDepositExpired,
  timeUntilRefund,
  getDepositDeadline,
  isValidTimeout,
  ESCROW_TIMEOUT_OPTIONS,
  DEPOSIT_STATUS_LABELS,
  ESCROW_MIN_TIMEOUT,
  ESCROW_MAX_TIMEOUT,
} from '../../src/escrow.js';

describe('formatTimeout', () => {
  it('formats seconds only', () => {
    expect(formatTimeout(45)).toBe('45s');
  });

  it('formats minutes only', () => {
    expect(formatTimeout(300)).toBe('5m');
  });

  it('formats hours only', () => {
    expect(formatTimeout(3600)).toBe('1h');
  });

  it('formats days only', () => {
    expect(formatTimeout(86400)).toBe('1d');
  });

  it('formats hours and minutes', () => {
    expect(formatTimeout(5400)).toBe('1h 30m');
  });

  it('formats days and hours', () => {
    expect(formatTimeout(90000)).toBe('1d 1h');
  });

  it('formats days, hours, and minutes', () => {
    expect(formatTimeout(90060)).toBe('1d 1h 1m');
  });

  it('returns 0s for zero', () => {
    expect(formatTimeout(0)).toBe('0s');
  });

  it('returns 0s for negative', () => {
    expect(formatTimeout(-10)).toBe('0s');
  });

  it('omits seconds when hours present', () => {
    expect(formatTimeout(3601)).toBe('1h');
  });

  it('omits seconds when days present', () => {
    expect(formatTimeout(86401)).toBe('1d');
  });

  it('formats 7 days', () => {
    expect(formatTimeout(604800)).toBe('7d');
  });
});

describe('isDepositExpired', () => {
  it('returns false when deposit is fresh', () => {
    expect(isDepositExpired(BigInt(900), BigInt(200), 1000)).toBe(false);
  });

  it('returns true when exactly at timeout', () => {
    expect(isDepositExpired(BigInt(800), BigInt(300), 1100)).toBe(true);
  });

  it('returns true when past timeout', () => {
    expect(isDepositExpired(BigInt(500), BigInt(300), 2000)).toBe(true);
  });

  it('uses current time when nowSeconds not provided', () => {
    // Deposit from year 2000 with 1s timeout — definitely expired
    expect(isDepositExpired(BigInt(946684800), BigInt(1))).toBe(true);
  });
});

describe('timeUntilRefund', () => {
  it('returns remaining seconds when not expired', () => {
    expect(timeUntilRefund(BigInt(900), BigInt(200), 1000)).toBe(100);
  });

  it('returns 0 when exactly at timeout', () => {
    expect(timeUntilRefund(BigInt(800), BigInt(300), 1100)).toBe(0);
  });

  it('returns 0 when past timeout', () => {
    expect(timeUntilRefund(BigInt(500), BigInt(300), 2000)).toBe(0);
  });
});

describe('getDepositDeadline', () => {
  it('returns depositedAt + timeout', () => {
    expect(getDepositDeadline(BigInt(1000), BigInt(300))).toBe(1300);
  });

  it('handles large values', () => {
    expect(getDepositDeadline(BigInt(1700000000), BigInt(604800))).toBe(1700604800);
  });
});

describe('isValidTimeout', () => {
  it('accepts minimum timeout (60)', () => {
    expect(isValidTimeout(60)).toBe(true);
  });

  it('accepts maximum timeout (604800)', () => {
    expect(isValidTimeout(604800)).toBe(true);
  });

  it('accepts value in range', () => {
    expect(isValidTimeout(3600)).toBe(true);
  });

  it('rejects below minimum', () => {
    expect(isValidTimeout(59)).toBe(false);
  });

  it('rejects above maximum', () => {
    expect(isValidTimeout(604801)).toBe(false);
  });

  it('rejects zero', () => {
    expect(isValidTimeout(0)).toBe(false);
  });

  it('rejects negative', () => {
    expect(isValidTimeout(-100)).toBe(false);
  });

  it('rejects non-integer', () => {
    expect(isValidTimeout(3600.5)).toBe(false);
  });
});

describe('constants', () => {
  it('ESCROW_TIMEOUT_OPTIONS has expected presets', () => {
    expect(ESCROW_TIMEOUT_OPTIONS).toHaveLength(6);
    expect(ESCROW_TIMEOUT_OPTIONS[0].value).toBe(300);
    expect(ESCROW_TIMEOUT_OPTIONS[5].value).toBe(604800);
  });

  it('DEPOSIT_STATUS_LABELS maps indices correctly', () => {
    expect(DEPOSIT_STATUS_LABELS[0]).toBe('Pending');
    expect(DEPOSIT_STATUS_LABELS[1]).toBe('Released');
    expect(DEPOSIT_STATUS_LABELS[2]).toBe('Refunded');
  });

  it('ESCROW_MIN_TIMEOUT is 60', () => {
    expect(ESCROW_MIN_TIMEOUT).toBe(60);
  });

  it('ESCROW_MAX_TIMEOUT is 604800', () => {
    expect(ESCROW_MAX_TIMEOUT).toBe(604800);
  });
});
