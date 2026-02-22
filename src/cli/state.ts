import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CONFIG_DIR, loadCredentials } from './init.js';
import { output } from './util.js';

const STATE_PATH = join(CONFIG_DIR, 'state.json');

export function initState(address: string): 'created' | 'exists' {
  if (existsSync(STATE_PATH)) {
    return 'exists';
  }

  const now = new Date().toISOString();

  const state = {
    version: 2,

    agent: {
      address,
      startedAt: now,
      lastScanAt: now,
      mode: 'active',
      skillVersion: '0.12.2',
      lastSkillCheck: now,
    },

    chains: {
      base: {
        lastScanAt: null,
        gasBalance: '0',
        gasCheckedAt: null,
        apps: {},
      },
      avalanche: {
        lastScanAt: null,
        gasBalance: '0',
        gasCheckedAt: null,
        apps: {},
      },
    },

    escrow: {
      base: {
        watching: {},
        history: [],
        stats: {
          totalEarned: '0',
          totalRefunded: '0',
          depositsResponded: 0,
          depositsReleased: 0,
          depositsRefunded: 0,
          depositsExpired: 0,
        },
      },
      avalanche: {
        watching: {},
        history: [],
        stats: {
          totalEarned: '0',
          totalRefunded: '0',
          depositsResponded: 0,
          depositsReleased: 0,
          depositsRefunded: 0,
          depositsExpired: 0,
        },
      },
    },

    people: {},

    messages: {
      sent: [],
      repliedTo: [],
    },

    rateLimits: {
      windowStart: now,
      messagesInWindow: 0,
      perTopic: {},
    },
  };

  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });

  return 'created';
}

export function stateInit(json: boolean): void {
  const creds = loadCredentials();
  const address = creds?.wallet?.address ?? '';
  const status = initState(address);

  if (status === 'exists') {
    output(
      json
        ? { status: 'exists', path: STATE_PATH }
        : `State file already exists: ${STATE_PATH}`,
      json,
    );
  } else {
    output(
      json
        ? { status: 'created', path: STATE_PATH, address }
        : `State file created: ${STATE_PATH}`,
      json,
    );
  }
}
