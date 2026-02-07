import { loadClient, output, type CommonFlags } from './util.js';
import { ethers } from 'ethers';

export async function feeTopicCreationSet(
  appId: number,
  token: string,
  amount: string,
  flags: CommonFlags
) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Setting topic creation fee for app ${appId}...`);

  const tx = await client.setTopicCreationFee(appId, token, BigInt(amount));
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, appId, token, amount }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

export async function feeMessageSet(
  topicId: number,
  token: string,
  amount: string,
  flags: CommonFlags
) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Setting message fee for topic ${topicId}...`);

  const tx = await client.setTopicMessageFee(topicId, token, BigInt(amount));
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, topicId, token, amount }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

export async function feeMessageGet(topicId: number, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  const fee = await client.getTopicMessageFee(topicId);
  const isZero = fee.token === ethers.ZeroAddress && fee.amount === 0n;

  if (json) {
    output({ topicId, token: fee.token, amount: fee.amount.toString() }, true);
  } else {
    if (isZero) {
      console.log(`Topic ${topicId}: no message fee.`);
    } else {
      console.log(`Topic ${topicId} message fee:`);
      console.log(`  Token:  ${fee.token}`);
      console.log(`  Amount: ${fee.amount}`);
    }
  }
}
