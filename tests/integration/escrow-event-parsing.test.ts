import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { ESCROW_ABI } from '../../src/contracts.js';

describe('escrow event parsing from receipt logs', () => {
  const iface = new ethers.Interface(ESCROW_ABI);

  it('extracts depositId from DepositRecorded event', () => {
    const event = iface.getEvent('DepositRecorded');
    expect(event).not.toBeNull();

    const depositId = 5n;
    const topicId = 1n;
    const sender = '0x' + '11'.repeat(20);
    const amount = ethers.parseEther('1');

    const log = iface.encodeEventLog(event!, [depositId, topicId, sender, amount]);

    const fakeLog = {
      topics: log.topics as string[],
      data: log.data,
      address: '0x' + 'aa'.repeat(20),
    };

    const parsed = (() => {
      try { return iface.parseLog(fakeLog); } catch { return null; }
    })();

    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('DepositRecorded');
    expect(parsed!.args.depositId.toString()).toBe('5');
    expect(parsed!.args.topicId.toString()).toBe('1');
    expect(parsed!.args.sender).toBe(sender);
    expect(parsed!.args.amount).toBe(amount);
  });

  it('extracts fields from DepositReleased event', () => {
    const event = iface.getEvent('DepositReleased');
    expect(event).not.toBeNull();

    const depositId = 3n;
    const topicId = 2n;
    const recipientAmount = ethers.parseEther('0.9');
    const appOwnerAmount = ethers.parseEther('0.05');
    const platformAmount = ethers.parseEther('0.05');

    const log = iface.encodeEventLog(event!, [depositId, topicId, recipientAmount, appOwnerAmount, platformAmount]);

    const fakeLog = {
      topics: log.topics as string[],
      data: log.data,
      address: '0x' + 'bb'.repeat(20),
    };

    const parsed = (() => {
      try { return iface.parseLog(fakeLog); } catch { return null; }
    })();

    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('DepositReleased');
    expect(parsed!.args.depositId.toString()).toBe('3');
    expect(parsed!.args.recipientAmount).toBe(recipientAmount);
    expect(parsed!.args.appOwnerAmount).toBe(appOwnerAmount);
    expect(parsed!.args.platformAmount).toBe(platformAmount);
  });

  it('extracts fields from DepositRefunded event', () => {
    const event = iface.getEvent('DepositRefunded');
    expect(event).not.toBeNull();

    const depositId = 7n;
    const topicId = 4n;
    const sender = '0x' + '22'.repeat(20);
    const amount = ethers.parseEther('2');

    const log = iface.encodeEventLog(event!, [depositId, topicId, sender, amount]);

    const fakeLog = {
      topics: log.topics as string[],
      data: log.data,
      address: '0x' + 'cc'.repeat(20),
    };

    const parsed = (() => {
      try { return iface.parseLog(fakeLog); } catch { return null; }
    })();

    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('DepositRefunded');
    expect(parsed!.args.depositId.toString()).toBe('7');
    expect(parsed!.args.sender).toBe(sender);
    expect(parsed!.args.amount).toBe(amount);
  });

  it('skips non-matching logs gracefully', () => {
    const fakeLogs = [
      { topics: ['0xdeadbeef'], data: '0x', address: '0x' + 'cc'.repeat(20) },
      { topics: [], data: '0x', address: '0x' + 'dd'.repeat(20) },
    ];

    const parsed = fakeLogs
      .map(l => { try { return iface.parseLog(l); } catch { return null; } })
      .find(l => l?.name === 'DepositRecorded');

    expect(parsed).toBeUndefined();
  });

  it('finds DepositRecorded among mixed logs', () => {
    const event = iface.getEvent('DepositRecorded');
    const depositId = 42n;
    const topicId = 10n;
    const sender = '0x' + '33'.repeat(20);
    const amount = ethers.parseEther('5');

    const log = iface.encodeEventLog(event!, [depositId, topicId, sender, amount]);

    const fakeLogs = [
      { topics: ['0x' + 'ff'.repeat(32)], data: '0x', address: '0x' + 'aa'.repeat(20) },
      { topics: log.topics as string[], data: log.data, address: '0x' + 'bb'.repeat(20) },
      { topics: ['0x' + 'ee'.repeat(32)], data: '0x', address: '0x' + 'cc'.repeat(20) },
    ];

    const parsed = fakeLogs
      .map(l => { try { return iface.parseLog(l); } catch { return null; } })
      .find(l => l?.name === 'DepositRecorded');

    expect(parsed).not.toBeNull();
    expect(parsed!.args.depositId.toString()).toBe('42');
  });
});
