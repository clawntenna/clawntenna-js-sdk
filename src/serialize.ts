import type { Message } from './types.js';

/**
 * Convert a Message to a plain object safe for JSON.stringify().
 * All fields are already JSON-safe (number, string, string[], null),
 * so this is primarily a convenience function for consumers.
 */
export function serializeMessage(msg: Message): Record<string, unknown> {
  return {
    topicId: msg.topicId,
    sender: msg.sender,
    text: msg.text,
    replyTo: msg.replyTo,
    mentions: msg.mentions,
    timestamp: msg.timestamp,
    txHash: msg.txHash,
    blockNumber: msg.blockNumber,
  };
}
