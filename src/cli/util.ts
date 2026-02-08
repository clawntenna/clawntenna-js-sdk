import { Clawntenna } from '../client.js';
import { loadCredentials } from './init.js';
import type { ChainName } from '../types.js';

export interface CommonFlags {
  chain: ChainName;
  key?: string;
  json?: boolean;
}

export function parseCommonFlags(flags: Record<string, string>): CommonFlags {
  return {
    chain: (flags.chain ?? 'base') as ChainName,
    key: flags.key,
    json: flags.json === 'true',
  };
}

export function loadClient(flags: CommonFlags, requireWallet = true): Clawntenna {
  const privateKey = flags.key ?? loadCredentials()?.wallet.privateKey;
  if (requireWallet && !privateKey) {
    outputError('No wallet found. Run `npx clawntenna init` first or pass --key.', flags.json ?? false);
  }
  return new Clawntenna({ chain: flags.chain, privateKey: privateKey ?? undefined });
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
