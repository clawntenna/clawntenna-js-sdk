import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { REGISTRY_ABI } from '../../src/contracts.js';

describe('event parsing from receipt logs', () => {
  const iface = new ethers.Interface(REGISTRY_ABI);

  it('extracts applicationId from ApplicationCreated event', () => {
    // Encode a fake ApplicationCreated event
    const event = iface.getEvent('ApplicationCreated');
    expect(event).not.toBeNull();

    const appId = 42n;
    const name = 'TestApp';
    const owner = '0x' + '11'.repeat(20);

    const log = iface.encodeEventLog(event!, [appId, name, owner]);

    // Simulate what receipt.logs would contain
    const fakeLog = {
      topics: log.topics as string[],
      data: log.data,
      address: '0x' + 'aa'.repeat(20),
    };

    // Parse it back (same pattern as in app.ts)
    const parsed = (() => {
      try { return iface.parseLog(fakeLog); } catch { return null; }
    })();

    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('ApplicationCreated');
    expect(parsed!.args.applicationId.toString()).toBe('42');
    expect(parsed!.args.name).toBe('TestApp');
    expect(parsed!.args.owner).toBe(owner);
  });

  it('extracts topicId from TopicCreated event', () => {
    const event = iface.getEvent('TopicCreated');
    expect(event).not.toBeNull();

    const topicId = 7n;
    const appId = 1n;
    const name = 'general';
    const creator = '0x' + '22'.repeat(20);
    const accessLevel = 0; // PUBLIC

    const log = iface.encodeEventLog(event!, [topicId, appId, name, creator, accessLevel]);

    const fakeLog = {
      topics: log.topics as string[],
      data: log.data,
      address: '0x' + 'bb'.repeat(20),
    };

    const parsed = (() => {
      try { return iface.parseLog(fakeLog); } catch { return null; }
    })();

    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('TopicCreated');
    expect(parsed!.args.topicId.toString()).toBe('7');
    expect(parsed!.args.applicationId.toString()).toBe('1');
    expect(parsed!.args.name).toBe('general');
    expect(Number(parsed!.args.accessLevel)).toBe(accessLevel);
  });

  it('skips non-matching logs gracefully', () => {
    const fakeLogs = [
      { topics: ['0xdeadbeef'], data: '0x', address: '0x' + 'cc'.repeat(20) },
      { topics: [], data: '0x', address: '0x' + 'dd'.repeat(20) },
    ];

    const parsed = fakeLogs
      .map(l => { try { return iface.parseLog(l); } catch { return null; } })
      .find(l => l?.name === 'ApplicationCreated');

    expect(parsed).toBeUndefined();
  });

  it('finds the right event among multiple logs', () => {
    const event = iface.getEvent('ApplicationCreated');
    const appId = 99n;
    const name = 'MultiLogApp';
    const owner = '0x' + '33'.repeat(20);
    const log = iface.encodeEventLog(event!, [appId, name, owner]);

    const fakeLogs = [
      // Some unrelated log
      { topics: ['0x' + 'ff'.repeat(32)], data: '0x', address: '0x' + 'aa'.repeat(20) },
      // The actual event
      { topics: log.topics as string[], data: log.data, address: '0x' + 'bb'.repeat(20) },
      // Another unrelated log
      { topics: ['0x' + 'ee'.repeat(32)], data: '0x', address: '0x' + 'cc'.repeat(20) },
    ];

    const parsed = fakeLogs
      .map(l => { try { return iface.parseLog(l); } catch { return null; } })
      .find(l => l?.name === 'ApplicationCreated');

    expect(parsed).not.toBeNull();
    expect(parsed!.args.applicationId.toString()).toBe('99');
  });
});
