import { Credentials } from '../types.js';
import type { SkillFilesResult } from './skill.js';
import {
  CONFIG_DIR,
  CREDS_PATH,
  DEFAULT_SECRETS_PATH,
  LEGACY_CREDS_PATH,
  backupFileIfExists,
  ensureCredentials,
  createSecureCredentials,
  loadRawCredentials,
  saveCredentials,
} from './secrets.js';

function emit(data: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  } else if (typeof data === 'string') {
    console.log(data);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

const STATE_PATH = `${CONFIG_DIR}/state.json`;

async function runPostInit(address: string, force = false) {
  const { initState } = await import('./state.js');
  const { copySkillFiles } = await import('./skill.js');
  const stateResult = initState(address, force);
  const skillResult = copySkillFiles();
  return { stateResult, skillResult };
}

function formatPostInit(stateResult: 'created' | 'exists', skillResult: SkillFilesResult): void {
  console.log(`  State: ~/.config/clawntenna/state.json (${stateResult})`);
  const createdFiles = Object.entries(skillResult.files)
    .filter(([, s]) => s === 'created')
    .map(([f]) => f);
  const existsFiles = Object.entries(skillResult.files)
    .filter(([, s]) => s === 'exists')
    .map(([f]) => f);
  if (createdFiles.length > 0) {
    console.log(`  Skill files: ${createdFiles.join(', ')} (created)`);
  }
  if (existsFiles.length > 0) {
    console.log(`  Skill files: ${existsFiles.join(', ')} (exists)`);
  }
}

export async function init(json = false, force = false) {
  if (force) {
    const raw = loadRawCredentials();
    const backupPaths: string[] = [];

    const credsBackup = backupFileIfExists(CREDS_PATH);
    if (credsBackup) backupPaths.push(credsBackup);

    const legacyBackup = backupFileIfExists(LEGACY_CREDS_PATH);
    if (legacyBackup) backupPaths.push(legacyBackup);

    const existingSecretsPath =
      raw && 'version' in raw && raw.version === 3 && 'secrets' in raw
        ? (raw.secrets.path as string)
        : DEFAULT_SECRETS_PATH;
    const secretsBackup = backupFileIfExists(existingSecretsPath);
    if (secretsBackup) backupPaths.push(secretsBackup);

    const stateBackup = backupFileIfExists(STATE_PATH);
    if (stateBackup) backupPaths.push(stateBackup);

    const { credentials } = await createSecureCredentials(json);
    saveCredentials(credentials);

    const { stateResult, skillResult } = await runPostInit(credentials.wallet.address, true);
    if (json) {
      emit({
        status: 'created',
        forced: true,
        address: credentials.wallet.address,
        chains: ['base', 'avalanche'],
        path: CREDS_PATH,
        secretsPath: credentials.secrets.path,
        backups: backupPaths,
        state: { status: stateResult, path: `${CONFIG_DIR}/state.json` },
        skillFiles: { status: skillResult.status, path: skillResult.path, files: skillResult.files },
      }, true);
    } else {
      console.log(`Force-created new secure profile at ${CREDS_PATH}`);
      console.log(`  Address: ${credentials.wallet.address}`);
      console.log(`  Secrets: ${credentials.secrets.path}`);
      console.log('  Local secrets are encrypted at rest and unlocked with your Clawntenna passphrase.');
      if (backupPaths.length > 0) {
        console.log('  Backups:');
        for (const path of backupPaths) console.log(`    ${path}`);
      }
      console.log('  Previous credentials and state were backed up before replacement.');
      console.log(`  Chains: base (8453), avalanche (43114)`);
      formatPostInit(stateResult, skillResult);
    }
    return;
  }

  const existing = await ensureCredentials(json);
  if (existing) {
    const chainNames = Object.values(existing.chains).map((c) => c.name);
    const { stateResult, skillResult } = await runPostInit(existing.wallet.address);
    if (json) {
      emit({
        status: 'exists',
        address: existing.wallet.address,
        chains: chainNames,
        path: CREDS_PATH,
        state: { status: stateResult, path: `${CONFIG_DIR}/state.json` },
        skillFiles: { status: skillResult.status, path: skillResult.path, files: skillResult.files },
      }, true);
    } else {
      console.log(`Credentials already exist at ${CREDS_PATH}`);
      console.log(`  Address: ${existing.wallet.address}`);
      console.log(`  Chains: ${chainNames.join(', ') || 'none configured'}`);
      console.log(`  Secrets: encrypted at ${existing.secrets.path}`);
      console.log('  Init is safe to re-run: existing credentials are reused, not overwritten.');
      formatPostInit(stateResult, skillResult);
    }
    return;
  }

  const { credentials } = await createSecureCredentials(json);
  saveCredentials(credentials);

  const { stateResult, skillResult } = await runPostInit(credentials.wallet.address);
  if (json) {
    emit({
      status: 'created',
      address: credentials.wallet.address,
      chains: ['base', 'avalanche'],
      path: CREDS_PATH,
      secretsPath: credentials.secrets.path,
      state: { status: stateResult, path: `${CONFIG_DIR}/state.json` },
      skillFiles: { status: skillResult.status, path: skillResult.path, files: skillResult.files },
    }, true);
  } else {
    console.log(`Secure profile created at ${CREDS_PATH}`);
    console.log(`  Address: ${credentials.wallet.address}`);
    console.log(`  Secrets: ${credentials.secrets.path}`);
    console.log('  Local secrets are encrypted at rest and unlocked with your Clawntenna passphrase.');
    console.log(`  Chains: base (8453), avalanche (43114)`);
    formatPostInit(stateResult, skillResult);
    console.log(`  Fund with ETH on Base or AVAX on Avalanche for gas`);
    console.log('');
    console.log('Next steps:');
    console.log('  npx clawntenna send --app "ClawtennaChat" --topic "general" "gm!"');
    console.log('  npx clawntenna read --app "ClawtennaChat" --topic "general"');
    console.log('');
    console.log('Non-interactive unlock options:');
    console.log('  export CLAWNTENNA_PASSPHRASE=...');
    console.log('  export CLAWNTENNA_PASSPHRASE_COMMAND=\'aws secretsmanager get-secret-value ...\'');
  }
}

export async function loadCredentials(json = false): Promise<Credentials | null> {
  return await ensureCredentials(json);
}

export { CREDS_PATH, CONFIG_DIR };
