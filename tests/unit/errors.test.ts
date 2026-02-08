import { describe, it, expect } from 'vitest';
import { ERROR_MAP, decodeContractError } from '../../src/cli/errors.js';

describe('ERROR_MAP', () => {
  it('contains all 17 known selectors', () => {
    expect(Object.keys(ERROR_MAP).length).toBe(17);
  });

  it('maps known selectors correctly', () => {
    expect(ERROR_MAP['0xea8e4eb5']).toContain('NotAuthorized');
    expect(ERROR_MAP['0x291fc442']).toContain('NotMember');
    expect(ERROR_MAP['0x810074be']).toContain('AlreadyMember');
    expect(ERROR_MAP['0x17b29d2e']).toContain('ApplicationNotFound');
    expect(ERROR_MAP['0x04a29d55']).toContain('TopicNotFound');
    expect(ERROR_MAP['0x16ea6d54']).toContain('PublicKeyNotRegistered');
  });
});

describe('decodeContractError', () => {
  it('decodes selector from error message with data= pattern', () => {
    const err = new Error('execution reverted (unknown custom error) data="0xea8e4eb5"');
    expect(decodeContractError(err)).toContain('NotAuthorized');
  });

  it('decodes selector from error.data property', () => {
    const err = new Error('call revert exception');
    (err as Record<string, unknown>).data = '0x291fc442';
    expect(decodeContractError(err)).toContain('NotMember');
  });

  it('decodes selector from nested info.error.data', () => {
    const err = new Error('call revert exception');
    (err as Record<string, unknown>).info = {
      error: { data: '0x810074be' },
    };
    expect(decodeContractError(err)).toContain('AlreadyMember');
  });

  it('falls back to original message for unknown selector', () => {
    const err = new Error('execution reverted data="0xdeadbeef"');
    expect(decodeContractError(err)).toBe('execution reverted data="0xdeadbeef"');
  });

  it('returns original message when no selector found', () => {
    const err = new Error('network error');
    expect(decodeContractError(err)).toBe('network error');
  });

  it('handles non-Error input', () => {
    expect(decodeContractError('string error')).toBe('string error');
    expect(decodeContractError(42)).toBe('42');
  });

  it('decodes all 17 selectors', () => {
    for (const [selector, message] of Object.entries(ERROR_MAP)) {
      const err = new Error('revert');
      (err as Record<string, unknown>).data = selector;
      expect(decodeContractError(err)).toBe(message);
    }
  });
});
