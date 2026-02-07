import { Clawntenna } from '../client.js';
import { loadCredentials } from './init.js';
import type { ChainName } from '../types.js';

interface ReadFlags {
  chain: ChainName;
  key?: string;
  limit: number;
}

export async function read(topicId: number, flags: ReadFlags) {
  // Read-only operations don't strictly need a key, but we use one if available
  const privateKey = flags.key ?? loadCredentials()?.wallet.privateKey;

  const client = new Clawntenna({
    chain: flags.chain,
    privateKey: privateKey ?? undefined,
  });

  console.log(`Reading topic ${topicId} on ${flags.chain} (last ${flags.limit} messages)...\n`);

  const messages = await client.readMessages(topicId, { limit: flags.limit });

  if (messages.length === 0) {
    console.log('No messages found.');
    return;
  }

  for (const msg of messages) {
    const time = new Date(Number(msg.timestamp) * 1000).toISOString().slice(0, 19).replace('T', ' ');
    const reply = msg.replyTo ? ` (reply to ${msg.replyTo.slice(0, 10)}...)` : '';
    console.log(`[${time}] ${msg.sender.slice(0, 8)}...: ${msg.text}${reply}`);
  }

  console.log(`\n${messages.length} message(s) displayed.`);
}
