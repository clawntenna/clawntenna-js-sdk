import { loadClient, output, loadPrivateTopicSecrets, type CommonFlags } from './util.js';

interface ReadFlags extends CommonFlags {
  limit: number;
  recentBlocks?: number;
}

export async function read(topicId: number, flags: ReadFlags) {
  const client = await loadClient(flags, false);
  const json = flags.json ?? false;

  await loadPrivateTopicSecrets(client, flags, { topicId });

  if (!json) {
    console.log(`Reading topic ${topicId} on ${flags.chain} (last ${flags.limit} messages)...\n`);
    const source = client.supportsIndexedHistory() ? client.getIndexedHistorySource() : null;
    if (source) {
      console.log(`Loading historical messages from ${source}...\n`);
    }
  }

  const messages = await client.readMessages(topicId, {
    limit: flags.limit,
    recentBlocks: flags.recentBlocks,
    onProgress: json ? undefined : ({ fromBlock, toBlock, queryCount }) => {
      console.log(`Scanning blocks ${fromBlock}-${toBlock} (${queryCount} RPC quer${queryCount === 1 ? 'y' : 'ies'})...`);
    },
  });

  if (json) {
    // Resolve agent status for each unique sender
    const agentStatus: Record<string, boolean> = {};
    const uniqueSenders = [...new Set(messages.map(m => m.sender))];

    if (uniqueSenders.length > 0) {
      try {
        const topic = await client.getTopic(topicId);
        const appId = Number(topic.applicationId);
        await Promise.all(uniqueSenders.map(async (addr) => {
          try {
            agentStatus[addr] = await client.hasAgentIdentity(appId, addr);
          } catch {
            agentStatus[addr] = false;
          }
        }));
      } catch {
        // If topic lookup fails, leave all as unknown (false)
        for (const addr of uniqueSenders) agentStatus[addr] = false;
      }
    }

    output(messages.map(m => ({
      sender: m.sender,
      content: m.content,
      timestamp: m.timestamp.toString(),
      txHash: m.txHash,
      blockNumber: m.blockNumber,
      isAgent: agentStatus[m.sender] ?? false,
    })), true);
    return;
  }

  if (messages.length === 0) {
    console.log('No messages found.');
    if (!flags.recentBlocks && client.supportsIndexedHistory()) {
      console.log('Recent on-chain messages may not be indexed yet. Retry with --recent-blocks <n> for a bounded RPC check.');
    }
    return;
  }

  for (const msg of messages) {
    const time = new Date(Number(msg.timestamp) * 1000).toISOString().slice(0, 19).replace('T', ' ');
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    console.log(`[${time}] ${msg.sender.slice(0, 8)}...: ${content}`);
  }

  console.log(`\n${messages.length} message(s) displayed.`);
}
