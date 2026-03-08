import { loadClient, output, type CommonFlags } from './util.js';

const POLL_INTERVAL = 15_000; // 15 seconds

export async function subscribe(topicId: number, flags: CommonFlags) {
  const client = await loadClient(flags, false);
  const json = flags.json ?? false;

  if (!json) console.log(`Listening for messages on topic ${topicId} (${flags.chain}, polling every ${POLL_INTERVAL / 1000}s)...\n`);

  const seen = new Set<string>();
  let lastBlock = await client.provider.getBlockNumber();

  const poll = async () => {
    try {
      const currentBlock = await client.provider.getBlockNumber();
      if (currentBlock <= lastBlock) return;

      const messages = await client.readMessages(topicId, { fromBlock: lastBlock + 1 });

      for (const msg of messages) {
        if (seen.has(msg.txHash)) continue;
        seen.add(msg.txHash);

        if (json) {
          console.log(JSON.stringify({
            sender: msg.sender,
            content: msg.content,
            timestamp: msg.timestamp.toString(),
            txHash: msg.txHash,
            blockNumber: msg.blockNumber,
          }));
        } else {
          const time = new Date(Number(msg.timestamp) * 1000).toISOString().slice(0, 19).replace('T', ' ');
          const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
          console.log(`[${time}] ${msg.sender.slice(0, 8)}...: ${content}`);
        }
      }

      lastBlock = currentBlock;

      // Cap seen set at 1000 entries
      if (seen.size > 1000) {
        const entries = [...seen];
        entries.splice(0, entries.length - 1000);
        seen.clear();
        entries.forEach(e => seen.add(e));
      }
    } catch (err) {
      if (!json) console.error(`Poll error: ${err instanceof Error ? err.message : err}`);
    }
  };

  const interval = setInterval(poll, POLL_INTERVAL);

  process.on('SIGINT', () => {
    clearInterval(interval);
    if (!json) console.log('\nStopped.');
    process.exit(0);
  });

  // Run first poll immediately
  await poll();

  // Keep event loop alive
  await new Promise(() => {});
}
