import { loadClient, output, type CommonFlags } from './util.js';

export async function send(topicId: number, message: string, flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Sending to topic ${topicId} on ${flags.chain}...`);

  const tx = await client.sendMessage(topicId, message);
  if (!json) console.log(`TX submitted: ${tx.hash}`);

  const receipt = await tx.wait();
  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, topicId, chain: flags.chain }, true);
  } else {
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}
