import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { Clawntenna } from '../../src/client.js';

describe('NonceManager wrapping', () => {
  it('wraps Wallet signer with NonceManager when privateKey is provided', () => {
    const wallet = ethers.Wallet.createRandom();
    const client = new Clawntenna({
      chain: 'base',
      privateKey: wallet.privateKey,
    });

    // The signer should be a NonceManager, not a raw Wallet
    expect(client.signer).toBeInstanceOf(ethers.NonceManager);
  });

  it('has null signer when no privateKey is provided', () => {
    const client = new Clawntenna({ chain: 'base' });
    expect(client.signer).toBeNull();
  });

  it('preserves wallet address through NonceManager', () => {
    const wallet = ethers.Wallet.createRandom();
    const client = new Clawntenna({
      chain: 'base',
      privateKey: wallet.privateKey,
    });

    expect(client.address).toBe(wallet.address);
  });

  it('does NOT wrap external signers from connectSigner', async () => {
    const client = new Clawntenna({ chain: 'base' });
    const wallet = ethers.Wallet.createRandom();
    // connectSigner takes an external signer as-is
    await client.connectSigner(wallet);

    // External signers should NOT be wrapped in NonceManager
    expect(client.signer).toBe(wallet);
    expect(client.signer).not.toBeInstanceOf(ethers.NonceManager);
  });
});
