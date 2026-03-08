import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname, isAbsolute } from 'path';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { execSync } from 'child_process';
import { ethers } from 'ethers';
import {
  deriveKeypairFromSignature,
  keypairFromPrivateKey,
} from '../crypto/ecdh.js';
import type {
  Credentials,
  CredentialsV1,
  CredentialsV2,
  EncryptedSecretStore,
  SecretSource,
  SecretStore,
  SecretStoreChain,
} from '../types.js';

export const CONFIG_DIR = join(homedir(), '.config', 'clawntenna');
export const CREDS_PATH = join(CONFIG_DIR, 'credentials.json');
export const LEGACY_DIR = join(homedir(), '.clawntenna');
export const LEGACY_CREDS_PATH = join(LEGACY_DIR, 'credentials.json');
export const DEFAULT_SECRETS_PATH = join(CONFIG_DIR, 'secrets.enc.json');

const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
let cachedPromptPassphrase: string | null = null;

function emit(data: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  } else if (typeof data === 'string') {
    console.log(data);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

function normalizePath(pathValue: string): string {
  return isAbsolute(pathValue) ? pathValue : join(CONFIG_DIR, pathValue);
}

function timestampSuffix(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function backupFileIfExists(pathValue: string): string | null {
  if (!existsSync(pathValue)) return null;
  const backupPath = `${pathValue}.bak.${timestampSuffix()}`;
  copyFileSync(pathValue, backupPath);
  return backupPath;
}

function readJson(pathValue: string): unknown {
  return JSON.parse(readFileSync(pathValue, 'utf-8'));
}

function writeJson(pathValue: string, data: unknown): void {
  mkdirSync(dirname(pathValue), { recursive: true, mode: 0o700 });
  writeFileSync(pathValue, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function deriveEncryptionKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
}

export function encryptSecretStore(store: SecretStore, passphrase: string): EncryptedSecretStore {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveEncryptionKey(passphrase, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(store), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    version: 1,
    kdf: {
      name: 'scrypt',
      salt: salt.toString('hex'),
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    },
    cipher: {
      name: 'aes-256-gcm',
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    },
    ciphertext: ciphertext.toString('hex'),
  };
}

export function decryptSecretStore(payload: EncryptedSecretStore, passphrase: string): SecretStore {
  const salt = Buffer.from(payload.kdf.salt, 'hex');
  const iv = Buffer.from(payload.cipher.iv, 'hex');
  const tag = Buffer.from(payload.cipher.tag, 'hex');
  const ciphertext = Buffer.from(payload.ciphertext, 'hex');
  const key = deriveEncryptionKey(passphrase, salt);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const parsed = JSON.parse(plaintext.toString('utf8')) as SecretStore;
  if (parsed.version !== 1) {
    throw new Error(`Unsupported secret store version: ${parsed.version}`);
  }
  return parsed;
}

async function promptPassphrase(prompt: string, confirm = false): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Interactive passphrase prompt requires a TTY. Set CLAWNTENNA_PASSPHRASE or CLAWNTENNA_PASSPHRASE_COMMAND for non-interactive use.');
  }

  const readHidden = async (label: string): Promise<string> => {
    return await new Promise((resolve, reject) => {
      const stdin = process.stdin;
      const stdout = process.stdout;
      let value = '';

      const cleanup = () => {
        stdout.write('\n');
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.removeListener('data', onData);
      };

      const onData = (chunk: Buffer | string) => {
        const input = String(chunk);
        for (const char of input) {
          if (char === '\u0003') {
            cleanup();
            reject(new Error('Passphrase entry cancelled.'));
            return;
          }
          if (char === '\r' || char === '\n') {
            cleanup();
            resolve(value);
            return;
          }
          if (char === '\u007f') {
            if (value.length > 0) value = value.slice(0, -1);
            continue;
          }
          value += char;
        }
      };

      stdout.write(label);
      stdin.setRawMode?.(true);
      stdin.resume();
      stdin.on('data', onData);
    });
  };

  const first = await readHidden(prompt);
  if (!first) {
    throw new Error('Passphrase cannot be empty.');
  }

  if (!confirm) return first;

  const second = await readHidden('Confirm passphrase: ');
  if (!timingSafeEqual(Buffer.from(first), Buffer.from(second))) {
    throw new Error('Passphrases did not match.');
  }
  return first;
}

export async function resolveSecretSource(source: SecretSource): Promise<string> {
  if (source.type === 'prompt') {
    if (cachedPromptPassphrase) return cachedPromptPassphrase;
    cachedPromptPassphrase = await promptPassphrase('Clawntenna passphrase: ');
    return cachedPromptPassphrase;
  }

  if (source.type === 'env') {
    const value = process.env[source.env];
    if (!value) {
      throw new Error(`Secret env var ${source.env} is not set.`);
    }
    return value.trim();
  }

  const output = execSync(source.command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (!output) {
    throw new Error(`Secret command produced no output: ${source.command}`);
  }
  return output;
}

async function resolveMigrationPassphrase(source: SecretSource, json: boolean): Promise<string> {
  if (source.type !== 'prompt') {
    return await resolveSecretSource(source);
  }

  if (cachedPromptPassphrase) return cachedPromptPassphrase;

  if (!json) {
    emit('Existing Clawntenna credentials were found in plaintext local storage.', false);
    emit('A new passphrase is required to migrate them into encrypted local secrets.', false);
    emit('This passphrase protects your local wallet and topic secrets on disk.', false);
  }

  cachedPromptPassphrase = await promptPassphrase('Create Clawntenna passphrase: ', true);
  return cachedPromptPassphrase;
}

function defaultSecretSource(): SecretSource {
  if (process.env.CLAWNTENNA_PASSPHRASE) {
    return { type: 'env', env: 'CLAWNTENNA_PASSPHRASE' };
  }
  if (process.env.CLAWNTENNA_PASSPHRASE_COMMAND) {
    return { type: 'command', command: process.env.CLAWNTENNA_PASSPHRASE_COMMAND };
  }
  return { type: 'prompt' };
}

export function loadRawCredentials(): Credentials | CredentialsV2 | CredentialsV1 | null {
  if (existsSync(CREDS_PATH)) {
    return readJson(CREDS_PATH) as Credentials | CredentialsV2 | CredentialsV1;
  }
  if (existsSync(LEGACY_CREDS_PATH)) {
    return readJson(LEGACY_CREDS_PATH) as Credentials | CredentialsV2 | CredentialsV1;
  }
  return null;
}

function migrateV1ToV2(v1: CredentialsV1): CredentialsV2 {
  const v2: CredentialsV2 = {
    version: 2,
    wallet: v1.wallet,
    chains: {},
  };

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

async function deriveDefaultEcdh(walletPrivateKey: string): Promise<{ privateKey: string; publicKey: string }> {
  const wallet = new ethers.Wallet(walletPrivateKey);
  const derived = await deriveKeypairFromSignature(
    wallet.address,
    (message) => wallet.signMessage(message),
    1
  );

  return {
    privateKey: ethers.hexlify(derived.privateKey),
    publicKey: ethers.hexlify(derived.publicKey),
  };
}

function createEmptySecretStore(): SecretStore {
  return {
    version: 1,
    wallet: {
      privateKey: '',
    },
    chains: {},
  };
}

function getOrCreateSecretChain(store: SecretStore, chainId: string): SecretStoreChain {
  if (!store.chains[chainId]) {
    store.chains[chainId] = {
      ecdh: null,
      apps: {},
    };
  }
  return store.chains[chainId];
}

function sanitizeMetadataFromV2(v2: CredentialsV2, secretSource: SecretSource): Credentials {
  const metadata: Credentials = {
    version: 3,
    wallet: {
      address: v2.wallet.address,
    },
    secrets: {
      type: 'encrypted-file',
      path: DEFAULT_SECRETS_PATH,
      passphrase: secretSource,
    },
    chains: {},
  };

  for (const [chainId, chain] of Object.entries(v2.chains)) {
    metadata.chains[chainId] = {
      name: chain.name,
      rpc: chain.rpc,
      ecdh: chain.ecdh
        ? {
            mode: 'stored',
            registered: chain.ecdh.registered,
            publicKey: chain.ecdh.publicKey,
          }
        : null,
      apps: {},
    };

    for (const [appId, app] of Object.entries(chain.apps)) {
      metadata.chains[chainId].apps[appId] = {
        name: app.name,
        nickname: app.nickname,
        agentTokenId: app.agentTokenId,
      };
    }
  }

  return metadata;
}

async function migrateV2ToV3(v2: CredentialsV2, secretSource: SecretSource, passphrase: string): Promise<Credentials> {
  const metadata = sanitizeMetadataFromV2(v2, secretSource);
  const secretStore = createEmptySecretStore();
  secretStore.wallet.privateKey = v2.wallet.privateKey;

  const derivedEcdh = await deriveDefaultEcdh(v2.wallet.privateKey);

  for (const [chainId, chain] of Object.entries(v2.chains)) {
    const secretChain = getOrCreateSecretChain(secretStore, chainId);
    const metadataChain = metadata.chains[chainId];

    if (chain.ecdh) {
      if (chain.ecdh.publicKey.toLowerCase() === derivedEcdh.publicKey.toLowerCase()) {
        metadataChain.ecdh = {
          mode: 'derived',
          registered: chain.ecdh.registered,
          publicKey: chain.ecdh.publicKey,
        };
      } else {
        secretChain.ecdh = {
          privateKey: chain.ecdh.privateKey,
          publicKey: chain.ecdh.publicKey,
        };
        metadataChain.ecdh = {
          mode: 'stored',
          registered: chain.ecdh.registered,
          publicKey: chain.ecdh.publicKey,
        };
      }
    }

    for (const [appId, app] of Object.entries(chain.apps)) {
      if (Object.keys(app.topicKeys ?? {}).length > 0) {
        secretChain.apps[appId] = {
          topicKeys: app.topicKeys,
        };
      }
    }
  }

  const encrypted = encryptSecretStore(secretStore, passphrase);
  writeJson(normalizePath(metadata.secrets.path), encrypted);
  writeJson(CREDS_PATH, metadata);
  return metadata;
}

export async function ensureCredentials(json = false): Promise<Credentials | null> {
  const raw = loadRawCredentials();
  if (!raw) return null;

  if ('version' in raw && raw.version === 3) {
    return raw as Credentials;
  }

  const backupPath = backupFileIfExists(CREDS_PATH);
  const legacyBackup = existsSync(LEGACY_CREDS_PATH) ? backupFileIfExists(LEGACY_CREDS_PATH) : null;
  const secretSource = defaultSecretSource();
  const passphrase = await resolveMigrationPassphrase(secretSource, json);

  let migrated: Credentials;
  if (!('version' in raw) || !raw.version) {
    migrated = await migrateV2ToV3(migrateV1ToV2(raw as CredentialsV1), secretSource, passphrase);
  } else if (raw.version === 2) {
    migrated = await migrateV2ToV3(raw as CredentialsV2, secretSource, passphrase);
  } else {
    throw new Error(`Unsupported credentials version: ${(raw as { version?: number }).version ?? 'unknown'}`);
  }

  if (!json) {
    emit(`Migrated local secrets into encrypted storage at ${normalizePath(migrated.secrets.path)}`, false);
    if (backupPath) emit(`Backup saved: ${backupPath}`, false);
    if (legacyBackup) emit(`Legacy backup saved: ${legacyBackup}`, false);
  }

  return migrated;
}

export async function loadSecretStore(credentials: Credentials): Promise<SecretStore> {
  const payload = readJson(normalizePath(credentials.secrets.path)) as EncryptedSecretStore;
  const passphrase = await resolveSecretSource(credentials.secrets.passphrase);
  return decryptSecretStore(payload, passphrase);
}

export async function saveSecretStore(credentials: Credentials, store: SecretStore): Promise<void> {
  const passphrase = await resolveSecretSource(credentials.secrets.passphrase);
  const payload = encryptSecretStore(store, passphrase);
  writeJson(normalizePath(credentials.secrets.path), payload);
}

export function saveSecretStoreWithPassphrase(credentials: Credentials, store: SecretStore, passphrase: string): void {
  const payload = encryptSecretStore(store, passphrase);
  writeJson(normalizePath(credentials.secrets.path), payload);
}

export async function createPromptPassphrase(label = 'Create Clawntenna passphrase: '): Promise<string> {
  cachedPromptPassphrase = await promptPassphrase(label, true);
  return cachedPromptPassphrase;
}

export function setCachedPromptPassphrase(passphrase: string | null): void {
  cachedPromptPassphrase = passphrase;
}

export function saveCredentials(credentials: Credentials): void {
  writeJson(CREDS_PATH, credentials);
}

export function validateWalletAddress(address: string, privateKey: string): void {
  const derived = ethers.computeAddress(privateKey);
  if (derived.toLowerCase() !== address.toLowerCase()) {
    throw new Error(`Stored wallet secret derives to ${derived}, expected ${address}.`);
  }
}

export async function createSecureCredentials(json = false): Promise<{ credentials: Credentials; secretStore: SecretStore }> {
  const wallet = ethers.Wallet.createRandom();
  const secretSource = defaultSecretSource();
  let passphrase: string;

  if (secretSource.type === 'prompt') {
    passphrase = await promptPassphrase('Create Clawntenna passphrase: ', true);
    cachedPromptPassphrase = passphrase;
  } else {
    passphrase = await resolveSecretSource(secretSource);
  }

  const credentials: Credentials = {
    version: 3,
    wallet: {
      address: wallet.address,
    },
    secrets: {
      type: 'encrypted-file',
      path: DEFAULT_SECRETS_PATH,
      passphrase: secretSource,
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

  const store: SecretStore = {
    version: 1,
    wallet: {
      privateKey: wallet.privateKey,
    },
    chains: {},
  };

  const encrypted = encryptSecretStore(store, passphrase);
  writeJson(CREDS_PATH, credentials);
  writeJson(normalizePath(credentials.secrets.path), encrypted);

  if (!json) {
    emit(`Encrypted wallet created for ${wallet.address}`, false);
  }

  return { credentials, secretStore: store };
}

export async function resolveWalletPrivateKey(credentials: Credentials): Promise<string> {
  const store = await loadSecretStore(credentials);
  validateWalletAddress(credentials.wallet.address, store.wallet.privateKey);
  return store.wallet.privateKey;
}

export async function resolveChainSecrets(credentials: Credentials, chainId: string): Promise<SecretStoreChain> {
  const store = await loadSecretStore(credentials);
  return store.chains[chainId] ?? { ecdh: null, apps: {} };
}

export async function ensureDerivedEcdh(credentials: Credentials, chainId: string): Promise<{ privateKey: string; publicKey: string }> {
  const walletPrivateKey = await resolveWalletPrivateKey(credentials);
  const derived = await deriveDefaultEcdh(walletPrivateKey);
  const chain = credentials.chains[chainId];
  if (chain?.ecdh) {
    chain.ecdh.publicKey = derived.publicKey;
  }
  return derived;
}

export function exportStoredEcdh(privateKeyHex: string): { privateKey: string; publicKey: string } {
  const { publicKey } = keypairFromPrivateKey(privateKeyHex);
  return {
    privateKey: privateKeyHex,
    publicKey: ethers.hexlify(publicKey),
  };
}
