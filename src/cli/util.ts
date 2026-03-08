import { Clawntenna } from '../client.js';
import { loadCredentials } from './init.js';
import { ensureDerivedEcdh, loadSecretStore, resolveWalletPrivateKey } from './secrets.js';
import { AccessLevel } from '../types.js';
import type { ChainName, Credentials } from '../types.js';

export interface CommonFlags {
  chain: ChainName;
  key?: string;
  rpc?: string;
  json?: boolean;
  force?: boolean;
}

export function parseCommonFlags(flags: Record<string, string>): CommonFlags {
  return {
    chain: (flags.chain ?? 'base') as ChainName,
    key: flags.key,
    rpc: flags.rpc,
    json: flags.json === 'true',
    force: flags.force === 'true',
  };
}

export async function loadClient(flags: CommonFlags, requireWallet = true): Promise<Clawntenna> {
  const creds = await loadCredentials(flags.json ?? false);
  const privateKey = flags.key ?? (requireWallet && creds ? await resolveWalletPrivateKey(creds) : undefined);
  if (requireWallet && !privateKey) {
    outputError('No wallet found. Run `npx clawntenna init` first or pass --key.', flags.json ?? false);
  }

  const chainId = chainIdForCredentials(flags.chain);
  const credsRpc = creds?.chains[chainId]?.rpc;
  const rpcUrl = flags.rpc ?? process.env.CLAWNTENNA_RPC_URL ?? credsRpc;
  const historyApiKey = process.env.ROUTESCAN_API_KEY ?? process.env.BASESCAN_API_KEY;
  return new Clawntenna({
    chain: flags.chain,
    privateKey: privateKey ?? undefined,
    rpcUrl,
    historyApiKey,
  });
}

export async function loadPrivateTopicSecrets(
  client: Clawntenna,
  flags: CommonFlags,
  options: { loadTopicKeys?: boolean; topicId?: number } = {},
): Promise<{ credentials: Credentials | null }> {
  const credentials = await loadCredentials(flags.json ?? false);
  if (!credentials) {
    if (options.topicId !== undefined || options.loadTopicKeys) {
      try {
        await client.deriveECDHFromWallet();
      } catch {
        // Ignore when no signer is available.
      }
    }
    return { credentials: null };
  }

  const chainId = chainIdForCredentials(flags.chain);
  const chain = credentials.chains[chainId];
  if (!chain) return { credentials };

  if (!options.loadTopicKeys && options.topicId !== undefined) {
    try {
      const topic = await client.getTopic(options.topicId);
      if (topic.accessLevel !== AccessLevel.PRIVATE) {
        return { credentials };
      }
    } catch {
      return { credentials };
    }
  }

  if (chain.ecdh?.mode === 'stored') {
    const store = await loadSecretStore(credentials);
    const ecdhPrivateKey = store.chains[chainId]?.ecdh?.privateKey;
    if (ecdhPrivateKey) {
      client.loadECDHKeypair(ecdhPrivateKey);
    }
    if (options.loadTopicKeys) {
      applyTopicKeysFromStore(client, store, chainId);
    }
    return { credentials };
  }

  try {
    const derived = await ensureDerivedEcdh(credentials, chainId);
    client.loadECDHKeypair(derived.privateKey);
  } catch {
    // Non-fatal for public flows.
  }

  if (options.loadTopicKeys) {
    const store = await loadSecretStore(credentials);
    applyTopicKeysFromStore(client, store, chainId);
  }

  return { credentials };
}

function applyTopicKeysFromStore(client: Clawntenna, store: Awaited<ReturnType<typeof loadSecretStore>>, chainId: string): void {
  const apps = store.chains[chainId]?.apps ?? {};
  for (const app of Object.values(apps)) {
    for (const [topicId, key] of Object.entries(app.topicKeys ?? {})) {
      client.setTopicKey(Number(topicId), Buffer.from(key, 'hex'));
    }
  }
}

export function output(data: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(data, bigintReplacer, 2));
  } else if (typeof data === 'string') {
    console.log(data);
  } else {
    console.log(JSON.stringify(data, bigintReplacer, 2));
  }
}

export function outputError(message: string, json: boolean): never {
  if (json) {
    console.error(JSON.stringify({ error: message }));
  } else {
    console.error(`Error: ${message}`);
  }
  process.exit(1);
}

export function chainIdForCredentials(chain: ChainName): string {
  const map: Record<ChainName, string> = {
    base: '8453',
    baseSepolia: '84532',
    avalanche: '43114',
  };
  return map[chain] ?? '8453';
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}
