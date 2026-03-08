import type { SecretSource } from '../types.js';
import { loadCredentials } from './init.js';
import {
  createPromptPassphrase,
  loadSecretStore,
  resolveSecretSource,
  saveCredentials,
  saveSecretStoreWithPassphrase,
  setCachedPromptPassphrase,
} from './secrets.js';
import { output } from './util.js';

function getNextSecretSource(flags: Record<string, string>): SecretSource {
  if (flags.env) {
    return { type: 'env', env: flags.env };
  }
  if (flags.command) {
    return { type: 'command', command: flags.command };
  }
  return { type: 'prompt' };
}

export async function secretsPassphraseSet(flags: Record<string, string>, json: boolean): Promise<void> {
  const credentials = await loadCredentials(json);
  if (!credentials) {
    throw new Error('No Clawntenna credentials found. Run `clawntenna init` first.');
  }

  const store = await loadSecretStore(credentials);
  const nextSource = getNextSecretSource(flags);

  let nextPassphrase: string;
  if (nextSource.type === 'prompt') {
    if (!json) {
      console.log('Re-encrypting local Clawntenna secrets with a new passphrase.');
    }
    nextPassphrase = await createPromptPassphrase('New Clawntenna passphrase: ');
  } else {
    setCachedPromptPassphrase(null);
    if (!json) {
      console.log(
        nextSource.type === 'env'
          ? `Re-encrypting local Clawntenna secrets using env var ${nextSource.env}.`
          : `Re-encrypting local Clawntenna secrets using command: ${nextSource.command}`,
      );
    }
    nextPassphrase = await resolveSecretSource(nextSource);
  }

  credentials.secrets.passphrase = nextSource;
  saveSecretStoreWithPassphrase(credentials, store, nextPassphrase);
  saveCredentials(credentials);

  output(
    json
      ? {
          status: 'updated',
          secretsPath: credentials.secrets.path,
          passphraseSource: nextSource.type,
          env: nextSource.type === 'env' ? nextSource.env : undefined,
          command: nextSource.type === 'command' ? nextSource.command : undefined,
        }
      : `Updated local secret-store passphrase for ${credentials.secrets.path}`,
    json,
  );
}
