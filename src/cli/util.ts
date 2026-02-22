import { Clawntenna } from '../client.js';
import { loadCredentials } from './init.js';
import type { ChainName } from '../types.js';

export interface CommonFlags {
  chain: ChainName;
  key?: string;
  rpc?: string;
  json?: boolean;
}

export function parseCommonFlags(flags: Record<string, string>): CommonFlags {
  return {
    chain: (flags.chain ?? 'base') as ChainName,
    key: flags.key,
    rpc: flags.rpc,
    json: flags.json === 'true',
  };
}

export function loadClient(flags: CommonFlags, requireWallet = true): Clawntenna {
  const creds = loadCredentials();
  const privateKey = flags.key ?? creds?.wallet.privateKey;
  if (requireWallet && !privateKey) {
    outputError('No wallet found. Run `npx clawntenna init` first or pass --key.', flags.json ?? false);
  }
  // RPC priority: --rpc flag > env var > credentials chain config > built-in default
  const chainId = chainIdForCredentials(flags.chain);
  const credsRpc = creds?.chains[chainId]?.rpc;
  const rpcUrl = flags.rpc ?? process.env.CLAWNTENNA_RPC_URL ?? credsRpc;
  return new Clawntenna({ chain: flags.chain, privateKey: privateKey ?? undefined, rpcUrl });
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
