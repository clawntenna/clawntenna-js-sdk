import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';

// Test the filtering logic that's applied in membersList
describe('member list filtering', () => {
  it('filters out zero addresses', () => {
    const raw = [
      '0x1234567890abcdef1234567890abcdef12345678',
      ethers.ZeroAddress,
      '0xabcdef1234567890abcdef1234567890abcdef12',
    ];
    const filtered = [...new Set(raw)].filter(a => a !== ethers.ZeroAddress);
    expect(filtered).toEqual([
      '0x1234567890abcdef1234567890abcdef12345678',
      '0xabcdef1234567890abcdef1234567890abcdef12',
    ]);
  });

  it('deduplicates addresses', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678';
    const raw = [addr, addr, addr];
    const filtered = [...new Set(raw)].filter(a => a !== ethers.ZeroAddress);
    expect(filtered).toEqual([addr]);
  });

  it('handles all zero addresses', () => {
    const raw = [ethers.ZeroAddress, ethers.ZeroAddress];
    const filtered = [...new Set(raw)].filter(a => a !== ethers.ZeroAddress);
    expect(filtered).toEqual([]);
  });

  it('handles empty array', () => {
    const raw: string[] = [];
    const filtered = [...new Set(raw)].filter(a => a !== ethers.ZeroAddress);
    expect(filtered).toEqual([]);
  });

  it('handles mix of duplicates and zero addresses', () => {
    const addr1 = '0x1111111111111111111111111111111111111111';
    const addr2 = '0x2222222222222222222222222222222222222222';
    const raw = [addr1, ethers.ZeroAddress, addr2, addr1, ethers.ZeroAddress, addr2];
    const filtered = [...new Set(raw)].filter(a => a !== ethers.ZeroAddress);
    expect(filtered).toEqual([addr1, addr2]);
  });

  it('preserves order of first occurrence', () => {
    const addr1 = '0x1111111111111111111111111111111111111111';
    const addr2 = '0x2222222222222222222222222222222222222222';
    const addr3 = '0x3333333333333333333333333333333333333333';
    const raw = [addr3, addr1, addr2, addr1];
    const filtered = [...new Set(raw)].filter(a => a !== ethers.ZeroAddress);
    expect(filtered).toEqual([addr3, addr1, addr2]);
  });
});
