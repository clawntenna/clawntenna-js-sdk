import { loadClient, output, type CommonFlags } from './util.js';

export async function agentRegister(appId: number, tokenId: number, flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Registering agent identity (token #${tokenId}) in app ${appId}...`);

  const tx = await client.registerAgentIdentity(appId, tokenId);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, appId, tokenId }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

export async function agentClear(appId: number, flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Clearing agent identity in app ${appId}...`);

  const tx = await client.clearAgentIdentity(appId);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, appId }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

export async function agentInfo(appId: number, address: string, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  const [hasAgent, tokenId] = await Promise.all([
    client.hasAgentIdentity(appId, address),
    client.getAgentTokenId(appId, address),
  ]);

  if (json) {
    output({
      appId,
      address,
      hasAgentIdentity: hasAgent,
      agentTokenId: tokenId.toString(),
    }, true);
  } else {
    console.log(`Agent identity for ${address} in app ${appId}:`);
    console.log(`  Registered: ${hasAgent}`);
    if (hasAgent) {
      console.log(`  Token ID:   ${tokenId}`);
    }
  }
}
