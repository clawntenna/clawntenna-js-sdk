import { describe, it, expect } from 'vitest';
import { Clawntenna } from '../../src/client.js';

describe('Clawntenna signer support', () => {
  describe('read-only client (no signer)', () => {
    it('creates a client without privateKey', () => {
      const client = new Clawntenna({ chain: 'base' });
      expect(client.address).toBeNull();
      expect(client.signer).toBeNull();
      expect(client.wallet).toBeNull(); // deprecated getter
    });

    it('exposes registry and keyManager as read-only', () => {
      const client = new Clawntenna({ chain: 'base' });
      expect(client.registry).toBeDefined();
      expect(client.keyManager).toBeDefined();
      expect(client.schemaRegistry).toBeDefined();
    });

    it('throws descriptive error on write operations', async () => {
      const client = new Clawntenna({ chain: 'base' });
      await expect(client.setNickname(1, 'test')).rejects.toThrow(
        'Signer required. Pass privateKey in constructor or call connectSigner().'
      );
    });
  });

  describe('client with privateKey', () => {
    // Use a throwaway test key (not a real wallet)
    const TEST_KEY = '0x' + '1'.repeat(64);

    it('has address and signer set', () => {
      const client = new Clawntenna({ chain: 'base', privateKey: TEST_KEY });
      expect(client.address).toBeTruthy();
      expect(client.signer).toBeTruthy();
    });
  });

  describe('connectSigner', () => {
    it('updates address and signer after connectSigner', async () => {
      const client = new Clawntenna({ chain: 'base' });
      expect(client.address).toBeNull();

      const TEST_ADDR = '0x1234567890123456789012345678901234567890';
      const mockSigner = {
        getAddress: async () => TEST_ADDR,
      };

      // ethers Contract.connect() accepts any object as a runner,
      // so a minimal mock is enough for unit testing
      await client.connectSigner(mockSigner as any);

      expect(client.address).toBe(TEST_ADDR);
      expect(client.signer).toBe(mockSigner);
    });

    it('error message guides users to connectSigner', async () => {
      const client = new Clawntenna({ chain: 'base' });
      try {
        await client.createTopic(1, 'test', 'desc', 0);
      } catch (e: any) {
        expect(e.message).toContain('connectSigner');
      }
    });
  });
});
