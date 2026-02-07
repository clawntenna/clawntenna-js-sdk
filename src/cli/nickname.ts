import { loadClient, output, type CommonFlags } from './util.js';

export async function nicknameSet(appId: number, name: string, flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Setting nickname to "${name}" in app ${appId}...`);

  const tx = await client.setNickname(appId, name);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, appId, nickname: name }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

export async function nicknameGet(appId: number, address: string, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  const nickname = await client.getNickname(appId, address);

  if (json) {
    output({ appId, address, nickname: nickname || null }, true);
  } else {
    console.log(nickname || '(no nickname set)');
  }
}

export async function nicknameClear(appId: number, flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Clearing nickname in app ${appId}...`);

  const tx = await client.clearNickname(appId);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, appId }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}
