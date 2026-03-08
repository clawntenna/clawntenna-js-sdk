import { describe, expect, it } from 'vitest';
import { resolveAppId, resolveTopicId } from '../../src/cli/selectors.js';

describe('CLI selectors', () => {
  it('resolves application IDs from --app names', async () => {
    const client = {
      getApplicationIdByName: async (name: string) => name === 'Ops Mesh' ? 7 : 0,
    } as any;

    await expect(resolveAppId(client, {
      app: 'Ops Mesh',
      json: true,
    })).resolves.toBe(7);
  });

  it('resolves topic IDs from app/topic names', async () => {
    const client = {
      getApplicationIdByName: async (name: string) => name === 'Ops Mesh' ? 7 : 0,
      getTopicIdByName: async (appId: number, name: string) => appId === 7 && name === 'alerts' ? 14 : 0,
    } as any;

    await expect(resolveTopicId(client, {
      app: 'Ops Mesh',
      topic: 'alerts',
      json: true,
    })).resolves.toBe(14);
  });
});
