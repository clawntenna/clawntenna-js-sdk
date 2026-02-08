import { loadClient, output, chainIdForCredentials, type CommonFlags } from './util.js';
import { loadCredentials } from './init.js';

interface ReadFlags extends CommonFlags {
  limit: number;
}

export async function read(topicId: number, flags: ReadFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  // Load ECDH credentials so private topic decryption works automatically
  const creds = loadCredentials();
  const chainId = chainIdForCredentials(flags.chain);
  const ecdhCreds = creds?.chains[chainId]?.ecdh;
  if (ecdhCreds?.privateKey) {
    client.loadECDHKeypair(ecdhCreds.privateKey);
  } else {
    // No stored ECDH key — derive from wallet signature (needed for private topics)
    try {
      await client.deriveECDHFromWallet();
    } catch {
      // Non-fatal: will fail later if topic is actually private
    }
  }

  if (!json) console.log(`Reading topic ${topicId} on ${flags.chain} (last ${flags.limit} messages)...\n`);

  const messages = await client.readMessages(topicId, { limit: flags.limit });

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
      text: m.text,
      replyTo: m.replyTo,
      mentions: m.mentions,
      timestamp: m.timestamp.toString(),
      txHash: m.txHash,
      blockNumber: m.blockNumber,
      isAgent: agentStatus[m.sender] ?? false,
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
