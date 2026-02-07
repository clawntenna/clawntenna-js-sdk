import type { ChainConfig, ChainName } from './types.js';

export const CHAINS: Record<ChainName, ChainConfig> = {
  baseSepolia: {
    chainId: 84532,
    name: 'Base Sepolia',
    shortName: 'Sepolia',
    rpc: 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
    registry: '0xf39b193aedC1Ec9FD6C5ccc24fBAe58ba9f52413',
    keyManager: '0x5562B553a876CBdc8AA4B3fb0687f22760F4759e',
    schemaRegistry: '0xB7eB50e9058198b99b5b2589E6D70b2d99d5440a',
    identityRegistry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  },
  base: {
    chainId: 8453,
    name: 'Base',
    shortName: 'Base',
    rpc: 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
    registry: '0x5fF6BF04F1B5A78ae884D977a3C80A0D8E2072bF',
    keyManager: '0xdc302ff43a34F6aEa19426D60C9D150e0661E4f4',
    schemaRegistry: '0x5c11d2eA4470eD9025D810A21a885FE16dC987Bd',
    identityRegistry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  },
  avalanche: {
    chainId: 43114,
    name: 'Avalanche C-Chain',
    shortName: 'Avalanche',
    rpc: 'https://api.avax.network/ext/bc/C/rpc',
    explorer: 'https://snowtrace.io',
    registry: '0x3Ca2FF0bD1b3633513299EB5d3e2d63e058b0713',
    keyManager: '0x5a5ea9D408FBA984fFf6e243Dcc71ff6E00C73E4',
    schemaRegistry: '0x23D96e610E8E3DA5341a75B77F1BFF7EA9c3A62B',
    identityRegistry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  },
};

export const CHAIN_IDS: Record<number, ChainName> = {
  84532: 'baseSepolia',
  8453: 'base',
  43114: 'avalanche',
};

export function getChain(nameOrId: ChainName | number): ChainConfig {
  if (typeof nameOrId === 'number') {
    const name = CHAIN_IDS[nameOrId];
    if (!name) throw new Error(`Unsupported chain ID: ${nameOrId}`);
    return CHAINS[name];
  }
  const chain = CHAINS[nameOrId];
  if (!chain) throw new Error(`Unsupported chain: ${nameOrId}`);
  return chain;
}
