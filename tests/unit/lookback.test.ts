import { describe, it, expect } from 'vitest';
import { CHAINS } from '../../src/chains.js';

describe('chain defaultLookback values', () => {
  it('Base uses 200k block lookback', () => {
    expect(CHAINS.base.defaultLookback).toBe(200_000);
  });

  it('Avalanche uses 500k block lookback', () => {
    expect(CHAINS.avalanche.defaultLookback).toBe(500_000);
  });

  it('Base Sepolia uses 200k block lookback', () => {
    expect(CHAINS.baseSepolia.defaultLookback).toBe(200_000);
  });

  it('all chains have defaultLookback defined', () => {
    for (const [name, config] of Object.entries(CHAINS)) {
      expect(config.defaultLookback, `${name} missing defaultLookback`).toBeGreaterThan(0);
    }
  });

  it('Avalanche lookback is larger than Base (faster blocks)', () => {
    expect(CHAINS.avalanche.defaultLookback).toBeGreaterThan(CHAINS.base.defaultLookback);
  });
});
