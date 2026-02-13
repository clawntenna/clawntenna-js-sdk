import { describe, it, expect } from 'vitest';
import { serializeMessage } from '../../src/serialize.js';
import type { Message } from '../../src/types.js';

describe('serializeMessage', () => {
  const msg: Message = {
    topicId: 42,
    sender: '0xABCD',
    text: 'Hello world',
    replyTo: '0x1234',
    mentions: ['0xAAAA', '0xBBBB'],
    timestamp: 1700000000,
    txHash: '0xdeadbeef',
    blockNumber: 123456,
  };

  it('returns a plain object with all fields', () => {
    const result = serializeMessage(msg);
    expect(result).toEqual({
      topicId: 42,
      sender: '0xABCD',
      text: 'Hello world',
      replyTo: '0x1234',
      mentions: ['0xAAAA', '0xBBBB'],
      timestamp: 1700000000,
      txHash: '0xdeadbeef',
      blockNumber: 123456,
    });
  });

  it('produces valid JSON without BigInt errors', () => {
    const result = serializeMessage(msg);
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('round-trips through JSON correctly', () => {
    const result = serializeMessage(msg);
    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);
    expect(parsed.topicId).toBe(42);
    expect(parsed.timestamp).toBe(1700000000);
    expect(typeof parsed.topicId).toBe('number');
    expect(typeof parsed.timestamp).toBe('number');
  });

  it('handles null replyTo and mentions', () => {
    const noReply: Message = { ...msg, replyTo: null, mentions: null };
    const result = serializeMessage(noReply);
    expect(result.replyTo).toBeNull();
    expect(result.mentions).toBeNull();
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
