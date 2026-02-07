import { Clawntenna } from '../client.js';
import { loadCredentials } from './init.js';
import type { ChainName } from '../types.js';

interface SendFlags {
  chain: ChainName;
  key?: string;
}

export async function send(topicId: number, message: string, flags: SendFlags) {
  const privateKey = flags.key ?? loadCredentials()?.wallet.privateKey;
  if (!privateKey) {
    console.error('No wallet found. Run `npx clawntenna init` first or pass --key.');
    process.exit(1);
  }

  const client = new Clawntenna({ chain: flags.chain, privateKey });

  console.log(`Sending to topic ${topicId} on ${flags.chain}...`);

  const tx = await client.sendMessage(topicId, message);
  console.log(`TX submitted: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(`Confirmed in block ${receipt?.blockNumber}`);
}
