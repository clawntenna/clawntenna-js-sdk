import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { ethers } from 'ethers';
import type { Credentials, CredentialsV1 } from '../types.js';
import { output } from './util.js';

const CONFIG_DIR = join(homedir(), '.config', 'clawntenna');
const CREDS_PATH = join(CONFIG_DIR, 'credentials.json');

// Legacy path for migration
const LEGACY_DIR = join(homedir(), '.clawntenna');
const LEGACY_CREDS_PATH = join(LEGACY_DIR, 'credentials.json');

function migrateV1ToV2(v1: CredentialsV1): Credentials {
  const v2: Credentials = {
    version: 2,
    wallet: v1.wallet,
    chains: {},
  };

  // Extract ECDH keypair from first app that has one
  let ecdh: { privateKey: string; publicKey: string; registered: boolean } | null = null;
  for (const app of Object.values(v1.apps)) {
    if (app.ecdh) {
      ecdh = {
        privateKey: app.ecdh.privateKey,
        publicKey: app.ecdh.publicKey,
        registered: app.ecdh.registeredOnChain,
      };
      break;
    }
  }

  // Migrate apps to Base (8453) since v1 had no chain awareness
  v2.chains['8453'] = {
    name: 'base',
    ecdh,
    apps: {},
  };

  for (const [appId, app] of Object.entries(v1.apps)) {
    v2.chains['8453'].apps[appId] = {
      name: app.name,
      nickname: app.nickname,
      agentTokenId: null,
      topicKeys: app.ecdh?.topicKeys ?? {},
    };
  }

  return v2;
}

export async function init(json = false) {
  // Check new path first
  if (existsSync(CREDS_PATH)) {
    const raw = JSON.parse(readFileSync(CREDS_PATH, 'utf-8'));

    // Migrate v1 format at new path if needed
    if (!raw.version) {
      const migrated = migrateV1ToV2(raw as CredentialsV1);
      writeFileSync(CREDS_PATH, JSON.stringify(migrated, null, 2), { mode: 0o600 });
      if (json) {
        output({ status: 'migrated', address: migrated.wallet.address, path: CREDS_PATH }, true);
      } else {
        console.log(`Migrated credentials to v2 format at ${CREDS_PATH}`);
        console.log(`  Address: ${migrated.wallet.address}`);
      }
      return;
    }

    const existing: Credentials = raw;
    const chainNames = Object.values(existing.chains).map(c => c.name);
    if (json) {
      output({ status: 'exists', address: existing.wallet.address, chains: chainNames, path: CREDS_PATH }, true);
    } else {
      console.log(`Credentials already exist at ${CREDS_PATH}`);
      console.log(`  Address: ${existing.wallet.address}`);
      console.log(`  Chains: ${chainNames.join(', ') || 'none configured'}`);
      console.log(`  To reset, delete ${CREDS_PATH} and run init again.`);
    }
    return;
  }

  // Check legacy path and migrate
  if (existsSync(LEGACY_CREDS_PATH)) {
    const raw = JSON.parse(readFileSync(LEGACY_CREDS_PATH, 'utf-8'));
    const migrated = raw.version ? raw : migrateV1ToV2(raw as CredentialsV1);

    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(CREDS_PATH, JSON.stringify(migrated, null, 2), { mode: 0o600 });

    if (json) {
      output({ status: 'migrated', address: migrated.wallet.address, path: CREDS_PATH, migratedFrom: LEGACY_CREDS_PATH }, true);
    } else {
      console.log(`Migrated credentials from ${LEGACY_CREDS_PATH} to ${CREDS_PATH}`);
      console.log(`  Address: ${migrated.wallet.address}`);
      console.log(`  You can safely delete ${LEGACY_CREDS_PATH}`);
    }
    return;
  }

  // Fresh init
  const wallet = ethers.Wallet.createRandom();

  const credentials: Credentials = {
    version: 2,
    wallet: {
      address: wallet.address,
      privateKey: wallet.privateKey,
    },
    chains: {
      '8453': {
        name: 'base',
        ecdh: null,
        apps: {},
      },
      '43114': {
        name: 'avalanche',
        ecdh: null,
        apps: {},
      },
    },
  };

  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CREDS_PATH, JSON.stringify(credentials, null, 2), { mode: 0o600 });

  if (json) {
    output({ status: 'created', address: wallet.address, chains: ['base', 'avalanche'], path: CREDS_PATH }, true);
  } else {
    console.log(`Wallet created at ${CREDS_PATH}`);
    console.log(`  Address: ${wallet.address}`);
    console.log(`  Chains: base (8453), avalanche (43114)`);
    console.log(`  Fund with ETH on Base or AVAX on Avalanche for gas`);
    console.log('');
    console.log('Next steps:');
    console.log('  npx clawntenna send 1 "gm!"     # Post to #general');
    console.log('  npx clawntenna read 1            # Read #general');
  }
}

export function loadCredentials(): Credentials | null {
  // Try new path first
  if (existsSync(CREDS_PATH)) {
    const raw = JSON.parse(readFileSync(CREDS_PATH, 'utf-8'));
    if (!raw.version) return migrateV1ToV2(raw as CredentialsV1);
    return raw as Credentials;
  }

  // Fall back to legacy path
  if (existsSync(LEGACY_CREDS_PATH)) {
    const raw = JSON.parse(readFileSync(LEGACY_CREDS_PATH, 'utf-8'));
    if (!raw.version) return migrateV1ToV2(raw as CredentialsV1);
    return raw as Credentials;
  }

  return null;
}

export { CREDS_PATH, CONFIG_DIR };
