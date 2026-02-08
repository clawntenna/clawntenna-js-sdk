import { loadClient, output, outputError, chainIdForCredentials, type CommonFlags } from './util.js';
import { loadCredentials } from './init.js';
import { bytesToHex } from '../crypto/ecdh.js';

export async function keysRegister(flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;
  const creds = loadCredentials();

  const chainId = chainIdForCredentials(flags.chain);
  const ecdhCreds = creds?.chains[chainId]?.ecdh;

  if (ecdhCreds?.privateKey) {
    client.loadECDHKeypair(ecdhCreds.privateKey);
  } else {
    if (!json) console.log('Deriving ECDH keypair from wallet signature...');
    await client.deriveECDHFromWallet();
  }

  if (!json) console.log('Registering ECDH public key on-chain...');

  const tx = await client.registerPublicKey();
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, chain: flags.chain }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

export async function keysCheck(address: string, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  const hasKey = await client.hasPublicKey(address);

  if (json) {
    output({ address, hasPublicKey: hasKey }, true);
  } else {
    console.log(hasKey ? `${address} has a registered ECDH public key.` : `${address} does NOT have a registered ECDH public key.`);
  }
}

export async function keysGrant(topicId: number, address: string, flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;
  const creds = loadCredentials();

  const chainId = chainIdForCredentials(flags.chain);
  const ecdhCreds = creds?.chains[chainId]?.ecdh;
  if (ecdhCreds?.privateKey) {
    client.loadECDHKeypair(ecdhCreds.privateKey);
  } else {
    await client.deriveECDHFromWallet();
  }

  if (!json) console.log(`Fetching topic key for topic ${topicId}...`);
  const topicKey = await client.getOrInitializeTopicKey(topicId);

  if (!json) console.log(`Granting key access to ${address}...`);
  const tx = await client.grantKeyAccess(topicId, address, topicKey);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, topicId, address }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

export async function keysRevoke(topicId: number, address: string, flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Revoking key access for ${address} on topic ${topicId}...`);

  const tx = await client.revokeKeyAccess(topicId, address);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, topicId, address }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

export async function keysRotate(topicId: number, flags: CommonFlags) {
  const client = loadClient(flags);
  const json = flags.json ?? false;

  if (!json) console.log(`Rotating key for topic ${topicId}...`);

  const tx = await client.rotateKey(topicId);
  const receipt = await tx.wait();

  if (json) {
    output({ txHash: tx.hash, blockNumber: receipt?.blockNumber, topicId }, true);
  } else {
    console.log(`TX: ${tx.hash}`);
    console.log(`Confirmed in block ${receipt?.blockNumber}`);
  }
}

export async function keysPending(topicId: number, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  if (!json) console.log(`Checking pending key grants for topic ${topicId}...`);

  const { pending, granted } = await client.getPendingKeyGrants(topicId);

  if (json) {
    output({ topicId, pending, granted, pendingCount: pending.length, grantedCount: granted.length }, true);
  } else {
    if (pending.length === 0) {
      console.log('No pending members — all members have been granted key access.');
    } else {
      console.log(`\n${pending.length} member(s) awaiting key grant:\n`);
      for (const p of pending) {
        const keyStatus = p.hasPublicKey ? '(ECDH key registered — ready to grant)' : '(no ECDH key — must run keys register first)';
        console.log(`  ${p.address} ${keyStatus}`);
      }
    }
    if (granted.length > 0) {
      console.log(`\n${granted.length} member(s) already granted.`);
    }
  }
}

export async function keysHas(topicId: number, address: string, flags: CommonFlags) {
  const client = loadClient(flags, false);
  const json = flags.json ?? false;

  const has = await client.hasKeyAccess(topicId, address);

  if (json) {
    output({ topicId, address, hasKeyAccess: has }, true);
  } else {
    console.log(has ? `${address} has key access to topic ${topicId}.` : `${address} does NOT have key access to topic ${topicId}.`);
  }
}
