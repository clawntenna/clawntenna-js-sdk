import { loadClient, output, outputError, type CommonFlags } from './util.js';
import { loadCredentials } from './init.js';
import { chainIdForCredentials } from './util.js';

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

export async function escrowInbox(topicId: number, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  // Load ECDH keys for decryption if available
  const creds = loadCredentials();
  if (creds) {
    const chainKey = chainIdForCredentials(flags.chain);
    const ecdhKey = creds.chains?.[chainKey]?.ecdh?.privateKey;
    if (ecdhKey) {
      client.loadECDHKeypair(ecdhKey);
      // Load topic keys from credentials
      const apps = creds.chains?.[chainKey]?.apps;
      if (apps) {
        for (const app of Object.values(apps)) {
          for (const [tId, key] of Object.entries(app.topicKeys || {})) {
            client.setTopicKey(Number(tId), Buffer.from(key, 'hex'));
          }
        }
      }
    }
  }

  if (!json) console.log(`Loading inbox for topic #${topicId}...`);

  const inbox = await client.getEscrowInbox(topicId);

  if (json) {
    output({
      topicId,
      count: inbox.length,
      deposits: inbox.map(d => ({
        id: d.id.toString(),
        sender: d.sender,
        token: d.token,
        amount: d.amount.toString(),
        formattedAmount: d.formattedAmount,
        depositedAt: d.depositedAt.toString(),
        txHash: d.txHash,
        blockNumber: d.blockNumber,
        messageText: d.messageText,
        hasResponse: d.hasResponse,
        remainingSeconds: d.remainingSeconds,
        formattedRemaining: d.formattedRemaining,
        expired: d.expired,
        status: d.status,
      })),
    }, true);
    return;
  }

  if (inbox.length === 0) {
    console.log(`Topic #${topicId} inbox: empty (no pending deposits).`);
    return;
  }

  console.log(`\nTopic #${topicId} inbox (${inbox.length} pending):\n`);

  for (const d of inbox) {
    const icon = d.hasResponse ? '\u2713' : '\u25CB';
    const amountStr = d.formattedAmount
      ? (d.token === '0x0000000000000000000000000000000000000000' ? `${d.formattedAmount} ETH` : d.formattedAmount)
      : d.amount.toString();
    const ago = formatAgo(Number(d.depositedAt));
    const timerStr = d.expired ? 'EXPIRED' : `${d.formattedRemaining} left`;

    console.log(`  #${d.id}  ${icon}  ${amountStr}  ${ago}  [${timerStr}]`);
    console.log(`    From: ${d.sender}`);
    if (d.messageText) {
      const truncated = d.messageText.length > 80 ? d.messageText.slice(0, 77) + '...' : d.messageText;
      console.log(`    Msg:  ${truncated}`);
    }
    console.log();
  }
}

export async function escrowStats(address: string, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  const cred = await client.getWalletCredibility(address);

  if (json) {
    output({
      address,
      responseRate: cred.responseRate,
      depositsReceived: cred.depositsReceived.toString(),
      depositsReleased: cred.depositsReleased.toString(),
      depositsRefunded: cred.depositsRefunded.toString(),
      totalEarned: cred.totalEarned.toString(),
      totalRefunded: cred.totalRefunded.toString(),
      formattedEarned: cred.formattedEarned,
      formattedRefunded: cred.formattedRefunded,
    }, true);
    return;
  }

  const shortAddr = address.slice(0, 6) + '...' + address.slice(-4);
  console.log(`\nEscrow stats for ${shortAddr}:\n`);
  console.log(`  Response rate:     ${cred.responseRate.toFixed(1)}%`);
  console.log(`  Deposits received: ${cred.depositsReceived}`);
  console.log(`  Released: ${cred.depositsReleased}  |  Refunded: ${cred.depositsRefunded}`);
  console.log(`  Total earned:      ${cred.formattedEarned ?? cred.totalEarned.toString()} ETH`);
  console.log(`  Total refunded:    ${cred.formattedRefunded ?? cred.totalRefunded.toString()} ETH`);
  console.log();
}

function formatAgo(epochSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - epochSeconds;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
