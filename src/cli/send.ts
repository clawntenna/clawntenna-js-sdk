import { loadClient, output, type CommonFlags } from './util.js';
import { loadCredentials } from './init.js';

export interface SendFlags extends CommonFlags {
  replyTo?: string;
  mentions?: string[];
  noWait?: boolean;
}

export async function send(topicId: number, message: string, flags: SendFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;
  const noWait = flags.noWait ?? false;

  // Load ECDH credentials so private topic encryption works automatically
  const creds = loadCredentials();
  const chainId = flags.chain === 'base' ? '8453' : '43114';
  const ecdhCreds = creds?.chains[chainId]?.ecdh;
  if (ecdhCreds?.privateKey) {
    client.loadECDHKeypair(ecdhCreds.privateKey);
  }

  if (!json) console.log(`Sending to topic ${topicId} on ${flags.chain}...`);

  const sendOptions = {
    replyTo: flags.replyTo,
    mentions: flags.mentions,
  };

  const tx = await client.sendMessage(topicId, message, sendOptions);

  if (noWait) {
    if (json) {
      output({ txHash: tx.hash, blockNumber: null, topicId, chain: flags.chain }, true);
    } else {
      console.log(`TX submitted: ${tx.hash}`);
    }
    return;
  }

  if (!json) console.log(`TX submitted: ${tx.hash}`);

  try {
    const receipt = await tx.wait(1, 60_000);
    if (json) {
      output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, topicId, chain: flags.chain }, true);
    } else {
      console.log(`Confirmed in block ${receipt?.blockNumber}`);
    }
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.message.includes('timeout');
    if (isTimeout) {
      if (json) {
        output({ txHash: tx.hash, blockNumber: null, topicId, chain: flags.chain, warning: 'confirmation timed out (60s)' }, true);
      } else {
        console.log(`TX sent but confirmation timed out after 60s. TX hash: ${tx.hash}`);
      }
    } else {
      throw err;
    }
  }
}
