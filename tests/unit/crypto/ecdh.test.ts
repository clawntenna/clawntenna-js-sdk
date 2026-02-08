import { describe, it, expect } from 'vitest';
import {
  keypairFromPrivateKey,
  computeSharedSecret,
  deriveAESKeyFromSecret,
  encryptTopicKeyForUser,
  decryptTopicKey,
  bytesToHex,
  hexToBytes,
} from '../../../src/crypto/ecdh.js';
import { randomBytes } from '@noble/hashes/utils';

describe('keypairFromPrivateKey', () => {
  it('produces 32-byte private key and 33-byte compressed public key', () => {
    const privHex = bytesToHex(randomBytes(32));
    const { privateKey, publicKey } = keypairFromPrivateKey(privHex);
    expect(privateKey.length).toBe(32);
    expect(publicKey.length).toBe(33);
    // Compressed key starts with 0x02 or 0x03
    expect([0x02, 0x03]).toContain(publicKey[0]);
  });

  it('handles 0x prefix', () => {
    const raw = randomBytes(32);
    const a = keypairFromPrivateKey(bytesToHex(raw));
    const b = keypairFromPrivateKey(bytesToHex(raw).slice(2)); // without 0x
    expect(bytesToHex(a.publicKey)).toBe(bytesToHex(b.publicKey));
  });

  it('is deterministic', () => {
    const privHex = '0x' + '0a'.repeat(32);
    const a = keypairFromPrivateKey(privHex);
    const b = keypairFromPrivateKey(privHex);
    expect(bytesToHex(a.publicKey)).toBe(bytesToHex(b.publicKey));
  });
});

describe('ECDH shared secret', () => {
  it('produces matching shared secrets from both sides', () => {
    const alice = keypairFromPrivateKey(bytesToHex(randomBytes(32)));
    const bob = keypairFromPrivateKey(bytesToHex(randomBytes(32)));

    const secretAB = computeSharedSecret(alice.privateKey, bob.publicKey);
    const secretBA = computeSharedSecret(bob.privateKey, alice.publicKey);

    expect(bytesToHex(secretAB)).toBe(bytesToHex(secretBA));
  });

  it('produces 32-byte shared secret', () => {
    const alice = keypairFromPrivateKey(bytesToHex(randomBytes(32)));
    const bob = keypairFromPrivateKey(bytesToHex(randomBytes(32)));
    const secret = computeSharedSecret(alice.privateKey, bob.publicKey);
    expect(secret.length).toBe(32);
  });
});

describe('deriveAESKeyFromSecret', () => {
  it('produces 32-byte AES key', () => {
    const secret = randomBytes(32);
    const aesKey = deriveAESKeyFromSecret(secret);
    expect(aesKey.length).toBe(32);
  });

  it('is deterministic', () => {
    const secret = randomBytes(32);
    const a = deriveAESKeyFromSecret(secret);
    const b = deriveAESKeyFromSecret(secret);
    expect(bytesToHex(a)).toBe(bytesToHex(b));
  });
});

describe('topic key encrypt/decrypt round-trip', () => {
  it('encrypts and decrypts a topic key', () => {
    const alice = keypairFromPrivateKey(bytesToHex(randomBytes(32)));
    const bob = keypairFromPrivateKey(bytesToHex(randomBytes(32)));
    const topicKey = randomBytes(32);

    // Alice encrypts for Bob
    const encrypted = encryptTopicKeyForUser(topicKey, alice.privateKey, bob.publicKey);

    // Bob decrypts from Alice
    const decrypted = decryptTopicKey(encrypted, bob.privateKey, alice.publicKey);

    expect(bytesToHex(decrypted)).toBe(bytesToHex(topicKey));
  });

  it('encrypted output is IV (12) + ciphertext (32 + 16 tag)', () => {
    const alice = keypairFromPrivateKey(bytesToHex(randomBytes(32)));
    const bob = keypairFromPrivateKey(bytesToHex(randomBytes(32)));
    const topicKey = randomBytes(32);

    const encrypted = encryptTopicKeyForUser(topicKey, alice.privateKey, bob.publicKey);
    // 12 (IV) + 32 (key) + 16 (GCM tag) = 60
    expect(encrypted.length).toBe(60);
  });

  it('fails to decrypt with wrong key', () => {
    const alice = keypairFromPrivateKey(bytesToHex(randomBytes(32)));
    const bob = keypairFromPrivateKey(bytesToHex(randomBytes(32)));
    const eve = keypairFromPrivateKey(bytesToHex(randomBytes(32)));
    const topicKey = randomBytes(32);

    const encrypted = encryptTopicKeyForUser(topicKey, alice.privateKey, bob.publicKey);

    // Eve tries to decrypt with her key but Alice's public key
    expect(() => decryptTopicKey(encrypted, eve.privateKey, alice.publicKey)).toThrow();
  });
});

describe('hex helpers', () => {
  it('bytesToHex produces 0x-prefixed hex', () => {
    const bytes = new Uint8Array([0, 1, 255, 128]);
    expect(bytesToHex(bytes)).toBe('0x0001ff80');
  });

  it('hexToBytes converts hex string to bytes', () => {
    const hex = '0001ff80';
    const bytes = hexToBytes(hex);
    expect(Array.from(bytes)).toEqual([0, 1, 255, 128]);
  });

  it('round-trips', () => {
    const original = randomBytes(32);
    const hex = bytesToHex(original);
    const restored = hexToBytes(hex);
    expect(bytesToHex(restored)).toBe(bytesToHex(original));
  });
});
