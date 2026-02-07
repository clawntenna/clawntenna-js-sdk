import { loadClient, output, type CommonFlags } from './util.js';

export async function subscribe(topicId: number, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  if (!json) console.log(`Listening for messages on topic ${topicId} (${flags.chain})...\n`);

  const unsubscribe = client.onMessage(topicId, (msg) => {
    if (json) {
      // NDJSON: one JSON object per line
      console.log(JSON.stringify({
        sender: msg.sender,
        text: msg.text,
        replyTo: msg.replyTo,
        mentions: msg.mentions,
        timestamp: msg.timestamp.toString(),
        txHash: msg.txHash,
        blockNumber: msg.blockNumber,
      }));
    } else {
      const time = new Date(Number(msg.timestamp) * 1000).toISOString().slice(0, 19).replace('T', ' ');
      const reply = msg.replyTo ? ` (reply to ${msg.replyTo.slice(0, 10)}...)` : '';
      console.log(`[${time}] ${msg.sender.slice(0, 8)}...: ${msg.text}${reply}`);
    }
  });

  // Keep process alive until SIGINT
  process.on('SIGINT', () => {
    unsubscribe();
    if (!json) console.log('\nUnsubscribed.');
    process.exit(0);
  });

  // Keep event loop alive
  await new Promise(() => {});
}
