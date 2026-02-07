import { loadClient, output, type CommonFlags } from './util.js';

const PERM_NAMES: Record<number, string> = {
  0: 'none',
  1: 'read',
  2: 'write',
  3: 'read_write',
  4: 'admin',
};

export async function permissionSet(topicId: number, address: string, level: number, flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Setting permission for ${address} on topic ${topicId} to ${PERM_NAMES[level] ?? level}...`);

  const tx = await client.setTopicPermission(topicId, address, level);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, topicId, address, permission: level }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

export async function permissionGet(topicId: number, address: string, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  const perm = await client.getTopicPermission(topicId, address);

  if (json) {
    output({ topicId, address, permission: perm, permissionName: PERM_NAMES[perm] ?? 'unknown' }, true);
  } else {
    console.log(`${PERM_NAMES[perm] ?? perm} (${perm})`);
  }
}

export async function accessCheck(topicId: number, address: string, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  const [canRead, canWrite] = await Promise.all([
    client.canRead(topicId, address),
    client.canWrite(topicId, address),
  ]);

  if (json) {
    output({ topicId, address, canRead, canWrite }, true);
  } else {
    console.log(`Topic ${topicId} / ${address}:`);
    console.log(`  Can read:  ${canRead}`);
    console.log(`  Can write: ${canWrite}`);
  }
}
