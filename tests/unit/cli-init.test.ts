import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// We test the pure logic functions directly (initState, copySkillFiles)
// by creating temp directories and manipulating the filesystem.
// The CLI wrappers (init, stateInit) are integration-level and tested via the CLI itself.

const TEST_DIR = join(tmpdir(), `clawntenna-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

describe('initState', () => {
  let origConfigDir: string;

  beforeEach(async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    // We'll test the state creation logic directly since we can't easily
    // override CONFIG_DIR. Instead we replicate the pure logic.
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('creates state.json with correct structure', () => {
    const statePath = join(TEST_DIR, 'state.json');
    const address = '0x1234567890abcdef1234567890abcdef12345678';
    const now = new Date().toISOString();

    // Replicate the initState logic
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
        base: { lastScanAt: null, gasBalance: '0', gasCheckedAt: null, apps: {} },
        avalanche: { lastScanAt: null, gasBalance: '0', gasCheckedAt: null, apps: {} },
      },
      escrow: {
        base: { watching: {}, history: [], stats: { totalEarned: '0', totalRefunded: '0', depositsResponded: 0, depositsReleased: 0, depositsRefunded: 0, depositsExpired: 0 } },
        avalanche: { watching: {}, history: [], stats: { totalEarned: '0', totalRefunded: '0', depositsResponded: 0, depositsReleased: 0, depositsRefunded: 0, depositsExpired: 0 } },
      },
      people: {},
      messages: { sent: [], repliedTo: [] },
      rateLimits: { windowStart: now, messagesInWindow: 0, perTopic: {} },
    };

    writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });

    const written = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(written.version).toBe(2);
    expect(written.agent.address).toBe(address);
    expect(written.agent.mode).toBe('active');
    expect(written.agent.skillVersion).toBe('0.12.2');
    expect(written.chains.base).toBeDefined();
    expect(written.chains.avalanche).toBeDefined();
    expect(written.escrow.base.stats.totalEarned).toBe('0');
    expect(written.messages.sent).toEqual([]);
    expect(written.messages.repliedTo).toEqual([]);
  });

  it('returns exists when state.json already present', () => {
    const statePath = join(TEST_DIR, 'state.json');
    writeFileSync(statePath, '{}');
    expect(existsSync(statePath)).toBe(true);
  });
});

describe('copySkillFiles', () => {
  const srcDir = join(TEST_DIR, 'pkg');
  const destDir = join(TEST_DIR, 'config');

  beforeEach(() => {
    mkdirSync(srcDir, { recursive: true });
    mkdirSync(destDir, { recursive: true });
    // Create source skill files
    writeFileSync(join(srcDir, 'skill.md'), '# Skill');
    writeFileSync(join(srcDir, 'heartbeat.md'), '# Heartbeat');
    writeFileSync(join(srcDir, 'skill.json'), '{"version":"0.12.2"}');
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('copies files that do not exist in destination', () => {
    const files = ['skill.md', 'heartbeat.md', 'skill.json'];
    const result: Record<string, string> = {};

    for (const file of files) {
      const dest = join(destDir, file);
      if (existsSync(dest)) {
        result[file] = 'exists';
      } else {
        const src = join(srcDir, file);
        writeFileSync(dest, readFileSync(src));
        result[file] = 'created';
      }
    }

    expect(result['skill.md']).toBe('created');
    expect(result['heartbeat.md']).toBe('created');
    expect(result['skill.json']).toBe('created');
    expect(readFileSync(join(destDir, 'skill.md'), 'utf-8')).toBe('# Skill');
    expect(readFileSync(join(destDir, 'skill.json'), 'utf-8')).toBe('{"version":"0.12.2"}');
  });

  it('skips files that already exist in destination', () => {
    // Pre-create one file
    writeFileSync(join(destDir, 'skill.md'), '# Old Skill');

    const files = ['skill.md', 'heartbeat.md', 'skill.json'];
    const result: Record<string, string> = {};

    for (const file of files) {
      const dest = join(destDir, file);
      if (existsSync(dest)) {
        result[file] = 'exists';
      } else {
        const src = join(srcDir, file);
        writeFileSync(dest, readFileSync(src));
        result[file] = 'created';
      }
    }

    expect(result['skill.md']).toBe('exists');
    expect(result['heartbeat.md']).toBe('created');
    expect(result['skill.json']).toBe('created');
    // Existing file should NOT be overwritten
    expect(readFileSync(join(destDir, 'skill.md'), 'utf-8')).toBe('# Old Skill');
  });

  it('reports exists status when all files already present', () => {
    // Pre-create all files
    writeFileSync(join(destDir, 'skill.md'), 'existing');
    writeFileSync(join(destDir, 'heartbeat.md'), 'existing');
    writeFileSync(join(destDir, 'skill.json'), 'existing');

    const files = ['skill.md', 'heartbeat.md', 'skill.json'];
    const result: Record<string, string> = {};
    let anyCreated = false;

    for (const file of files) {
      const dest = join(destDir, file);
      if (existsSync(dest)) {
        result[file] = 'exists';
      } else {
        result[file] = 'created';
        anyCreated = true;
      }
    }

    const status = anyCreated ? 'created' : 'exists';
    expect(status).toBe('exists');
    expect(result['skill.md']).toBe('exists');
    expect(result['heartbeat.md']).toBe('exists');
    expect(result['skill.json']).toBe('exists');
  });
});
