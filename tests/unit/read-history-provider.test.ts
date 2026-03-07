import { describe, it, expect, vi, afterEach } from 'vitest';
import { Clawntenna } from '../../src/client.js';

describe('readMessages history providers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses explorer history for historical reads when supported', async () => {
    const client = new Clawntenna({ chain: 'base' });
    vi.spyOn(client as any, 'getEncryptionKey').mockResolvedValue(new Uint8Array(32));
    const getBlockNumber = vi.spyOn(client.provider, 'getBlockNumber').mockResolvedValue(123);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: '0', message: 'No records found', result: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const messages = await client.readMessages(1, { limit: 20 });

    expect(messages).toEqual([]);
    expect(getBlockNumber).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const url = new URL(fetchMock.mock.calls[0][0].toString());
    expect(url.origin).toBe('https://api.routescan.io');
    expect(url.searchParams.get('module')).toBe('logs');
    expect(url.searchParams.get('action')).toBe('getLogs');
    expect(url.searchParams.get('topic0_1_opr')).toBe('and');
    expect(url.searchParams.get('offset')).toBe('20');
    expect(url.searchParams.get('sort')).toBe('desc');
  });

  it('uses RPC reads when fromBlock is provided', async () => {
    const client = new Clawntenna({ chain: 'base' });
    vi.spyOn(client as any, 'getEncryptionKey').mockResolvedValue(new Uint8Array(32));
    const getBlockNumber = vi.spyOn(client.provider, 'getBlockNumber').mockResolvedValue(10_000);
    const queryFilter = vi.spyOn(client.registry, 'queryFilter').mockResolvedValue([]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const messages = await client.readMessages(1, { fromBlock: 9_500, limit: 20 });

    expect(messages).toEqual([]);
    expect(getBlockNumber).toHaveBeenCalled();
    expect(queryFilter).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
