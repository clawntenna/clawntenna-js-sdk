import { loadClient, output, type CommonFlags } from './util.js';

interface ReadFlags extends CommonFlags {
  limit: number;
}

export async function read(topicId: number, flags: ReadFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  if (!json) console.log(`Reading topic ${topicId} on ${flags.chain} (last ${flags.limit} messages)...\n`);

  const messages = await client.readMessages(topicId, { limit: flags.limit });

  if (json) {
    output(messages.map(m => ({
      sender: m.sender,
      text: m.text,
      replyTo: m.replyTo,
      mentions: m.mentions,
      timestamp: m.timestamp.toString(),
      txHash: m.txHash,
      blockNumber: m.blockNumber,
    })), true);
    return;
  }

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
