import { loadClient, output, outputError, type CommonFlags } from './util.js';

const STATUS_LABELS = ['Pending', 'Released', 'Refunded'] as const;

export async function escrowEnable(topicId: number, timeout: number, flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Enabling escrow for topic ${topicId} (timeout: ${timeout}s)...`);

  const tx = await client.enableEscrow(topicId, timeout);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, topicId, timeout }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

export async function escrowDisable(topicId: number, flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Disabling escrow for topic ${topicId}...`);

  const tx = await client.disableEscrow(topicId);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, topicId }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

export async function escrowStatus(topicId: number, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  const config = await client.getEscrowConfig(topicId);

  if (json) {
    output({ topicId, enabled: config.enabled, timeout: config.timeout.toString() }, true);
  } else {
    console.log(`Topic ${topicId} escrow:`);
    console.log(`  Enabled: ${config.enabled}`);
    console.log(`  Timeout: ${config.timeout}s`);
  }
}

export async function escrowDeposits(topicId: number, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  const ids = await client.getPendingDeposits(topicId);

  if (json) {
    output({ topicId, pendingDeposits: ids.map(id => id.toString()) }, true);
  } else {
    if (ids.length === 0) {
      console.log(`Topic ${topicId}: no pending deposits.`);
    } else {
      console.log(`Topic ${topicId} pending deposits (${ids.length}):`);
      for (const id of ids) {
        console.log(`  #${id}`);
      }
    }
  }
}

export async function escrowDeposit(depositId: number, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  const d = await client.getDeposit(depositId);

  if (json) {
    output({
      id: d.id.toString(),
      topicId: d.topicId.toString(),
      sender: d.sender,
      recipient: d.recipient,
      token: d.token,
      amount: d.amount.toString(),
      appOwner: d.appOwner,
      depositedAt: d.depositedAt.toString(),
      timeout: d.timeout.toString(),
      status: d.status,
      statusLabel: STATUS_LABELS[d.status],
    }, true);
  } else {
    console.log(`Deposit #${d.id}:`);
    console.log(`  Topic:      ${d.topicId}`);
    console.log(`  Sender:     ${d.sender}`);
    console.log(`  Recipient:  ${d.recipient}`);
    console.log(`  Token:      ${d.token}`);
    console.log(`  Amount:     ${d.amount}`);
    console.log(`  App Owner:  ${d.appOwner}`);
    console.log(`  Deposited:  ${d.depositedAt}`);
    console.log(`  Timeout:    ${d.timeout}s`);
    console.log(`  Status:     ${STATUS_LABELS[d.status]} (${d.status})`);
  }
}

export async function escrowRefund(depositId: number, flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Claiming refund for deposit #${depositId}...`);

  const tx = await client.claimRefund(depositId);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, depositId }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

export async function escrowRefundBatch(depositIds: number[], flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Claiming refunds for ${depositIds.length} deposits...`);

  const tx = await client.batchClaimRefunds(depositIds);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, depositIds }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

export async function escrowRespond(topicId: number, depositIds: number[], payload: string, flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Responding to deposit(s) [${depositIds.join(', ')}] on topic #${topicId}...`);

  const tx = await client.respondToDeposits(topicId, payload, depositIds);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, topicId, depositIds }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
    console.log(`Responded to ${depositIds.length} deposit(s). They can now be released.`);
  }
}

export async function escrowRelease(depositId: number, messageRef: number, flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Releasing deposit #${depositId}${messageRef ? ` (ref: ${messageRef})` : ''}...`);

  const tx = await client.releaseDeposit(depositId, messageRef);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, depositId, messageRef }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

export async function escrowReleaseBatch(depositIds: number[], flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Releasing ${depositIds.length} deposits...`);

  const tx = await client.batchReleaseDeposits(depositIds);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, depositIds }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}
