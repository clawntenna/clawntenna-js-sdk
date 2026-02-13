import { describe, it, expect } from 'vitest';
import { DepositStatus } from '../../src/types.js';

describe('DepositStatus enum', () => {
  it('has correct numeric values', () => {
    expect(DepositStatus.Pending).toBe(0);
    expect(DepositStatus.Released).toBe(1);
    expect(DepositStatus.Refunded).toBe(2);
  });

  it('supports reverse mapping (number → name)', () => {
    expect(DepositStatus[0]).toBe('Pending');
    expect(DepositStatus[1]).toBe('Released');
    expect(DepositStatus[2]).toBe('Refunded');
  });

  it('can cast number to DepositStatus', () => {
    const status: DepositStatus = 2 as DepositStatus;
    expect(status).toBe(DepositStatus.Refunded);
  });
});
