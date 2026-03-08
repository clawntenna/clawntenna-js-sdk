import { loadClient, output, outputError, chainIdForCredentials, loadPrivateTopicSecrets, type CommonFlags } from './util.js';
import { loadCredentials } from './init.js';
import { loadSecretStore, saveCredentials, saveSecretStore } from './secrets.js';

export async function keysRegister(flags: CommonFlags) {
  const client = await loadClient(flags);
  const json = flags.json ?? false;
  const creds = await loadCredentials(json);

  const chainId = chainIdForCredentials(flags.chain);
  const hadExistingRegistration = await client.hasPublicKey(client.address!);

  if (hadExistingRegistration && !flags.force) {
    outputError(
      'ECDH public key already registered on-chain. Re-run with --force to update it. Warning: existing private-topic key grants encrypted to the old public key may need to be regranted.',
      json
    );
  }

  await loadPrivateTopicSecrets(client, flags, { topicId });
  if (!client.getECDHKeypairHex()) {
    if (!json) console.log('Deriving ECDH keypair from wallet signature...');
    await client.deriveECDHFromWallet();
  }

  if (!json) console.log('Registering ECDH public key on-chain...');

  const tx = await client.registerPublicKey();
  const receipt = await tx.wait();
  const txHash = tx.hash;
  const blockNumber = receipt?.blockNumber;
  const registeredOnChain = true;

  const keypair = client.getECDHKeypairHex();
  if (creds && keypair) {
    if (!creds.chains[chainId]) {
      creds.chains[chainId] = {
        name: flags.chain,
        ecdh: null,
        apps: {},
      };
    }

    creds.chains[chainId].ecdh = {
      publicKey: keypair.publicKey,
      mode: flags.force ? 'derived' : (creds.chains[chainId].ecdh?.mode ?? 'derived'),
      registered: registeredOnChain,
    };

    if (creds.chains[chainId].ecdh?.mode === 'stored' && !flags.force) {
      const store = await loadSecretStore(creds);
      if (!store.chains[chainId]) {
        store.chains[chainId] = { ecdh: null, apps: {} };
      }
      store.chains[chainId].ecdh = {
        privateKey: keypair.privateKey,
        publicKey: keypair.publicKey,
      };
      await saveSecretStore(creds, store);
    } else {
      creds.chains[chainId].ecdh.mode = 'derived';
      const store = await loadSecretStore(creds);
      if (store.chains[chainId]?.ecdh) {
        store.chains[chainId].ecdh = null;
        await saveSecretStore(creds, store);
      }
    }

    saveCredentials(creds);
  }

  if (json) {
    output({
      txHash,
      blockNumber,
      chain: flags.chain,
      registered: registeredOnChain,
      updated: hadExistingRegistration,
    }, true);
  } else {
    console.log(`TX: ${txHash}`);
    console.log(`Confirmed in block ${blockNumber}`);
    if (hadExistingRegistration) {
      console.log('ECDH public key updated on-chain.');
      console.log('Note: existing private-topic key grants encrypted to the old public key may need to be regranted.');
    }
  }
}

export async function keysCheck(address: string, flags: CommonFlags) {
  const client = await loadClient(flags, false);
  const json = flags.json ?? false;

  const hasKey = await client.hasPublicKey(address);

  if (json) {
    output({ address, hasPublicKey: hasKey }, true);
  } else {
    console.log(hasKey ? `${address} has a registered ECDH public key.` : `${address} does NOT have a registered ECDH public key.`);
  }
}

export async function keysGrant(topicId: number, address: string, flags: CommonFlags) {
  const client = await loadClient(flags);
  const json = flags.json ?? false;
  await loadPrivateTopicSecrets(client, flags);

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
  const client = await loadClient(flags);
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
  const client = await loadClient(flags);
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
  const client = await loadClient(flags, false);
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
  const client = await loadClient(flags, false);
  const json = flags.json ?? false;

  const has = await client.hasKeyAccess(topicId, address);

  if (json) {
    output({ topicId, address, hasKeyAccess: has }, true);
  } else {
    console.log(has ? `${address} has key access to topic ${topicId}.` : `${address} does NOT have key access to topic ${topicId}.`);
  }
}
