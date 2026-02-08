import { describe, it, expect } from 'vitest';
import {
  derivePublicTopicKey,
  deriveKeyFromPassphrase,
  encrypt,
  decrypt,
  encryptMessage,
  decryptMessage,
} from '../../../src/crypto/encrypt.js';

describe('encrypt/decrypt round-trip', () => {
  const key = derivePublicTopicKey(1);

  it('encrypts and decrypts a simple string', () => {
    const plaintext = 'Hello, world!';
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('produces valid JSON envelope', () => {
    const encrypted = encrypt('test', key);
    const parsed = JSON.parse(encrypted);
    expect(parsed.e).toBe(true);
    expect(parsed.v).toBe(2);
    expect(typeof parsed.iv).toBe('string');
    expect(typeof parsed.ct).toBe('string');
  });

  it('returns null for wrong key', () => {
    const wrongKey = derivePublicTopicKey(999);
    const encrypted = encrypt('secret', key);
    const decrypted = decrypt(encrypted, wrongKey);
    expect(decrypted).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(decrypt('not json', key)).toBeNull();
    expect(decrypt('{"e":true,"v":2,"iv":"bad","ct":"bad"}', key)).toBeNull();
  });

  it('handles non-encrypted payload (e=false)', () => {
    const raw = JSON.stringify({ e: false, text: 'plain' });
    const result = decrypt(raw, key);
    expect(result).toBe(raw);
  });

  it('produces different ciphertexts for same plaintext (random IV)', () => {
    const a = encrypt('same', key);
    const b = encrypt('same', key);
    expect(a).not.toBe(b);
  });
});

describe('derivePublicTopicKey', () => {
  it('produces a 32-byte key', () => {
    const key = derivePublicTopicKey(1);
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  it('is deterministic for same topicId', () => {
    const a = derivePublicTopicKey(42);
    const b = derivePublicTopicKey(42);
    expect(Buffer.from(a).toString('hex')).toBe(Buffer.from(b).toString('hex'));
  });

  it('produces different keys for different topicIds', () => {
    const a = derivePublicTopicKey(1);
    const b = derivePublicTopicKey(2);
    expect(Buffer.from(a).toString('hex')).not.toBe(Buffer.from(b).toString('hex'));
  });
});

describe('deriveKeyFromPassphrase', () => {
  it('produces a 32-byte key', () => {
    const key = deriveKeyFromPassphrase('mypassword', 1);
    expect(key.length).toBe(32);
  });

  it('is deterministic', () => {
    const a = deriveKeyFromPassphrase('pass', 1);
    const b = deriveKeyFromPassphrase('pass', 1);
    expect(Buffer.from(a).toString('hex')).toBe(Buffer.from(b).toString('hex'));
  });

  it('differs from public topic key', () => {
    const pubKey = derivePublicTopicKey(1);
    const passKey = deriveKeyFromPassphrase('password', 1);
    expect(Buffer.from(pubKey).toString('hex')).not.toBe(Buffer.from(passKey).toString('hex'));
  });
});

describe('encryptMessage / decryptMessage', () => {
  const key = derivePublicTopicKey(1);

  it('round-trips a simple message', () => {
    const encrypted = encryptMessage('Hello!', key);
    const result = decryptMessage(encrypted, key);
    expect(result).not.toBeNull();
    expect(result!.text).toBe('Hello!');
    expect(result!.replyTo).toBeNull();
    expect(result!.mentions).toBeNull();
  });

  it('round-trips message with replyTo and mentions', () => {
    const encrypted = encryptMessage('reply text', key, {
      replyTo: '0xabc123',
      replyText: 'original',
      replyAuthor: '0xdef456',
      mentions: ['0x111', '0x222'],
    });
    const result = decryptMessage(encrypted, key);
    expect(result).not.toBeNull();
    expect(result!.text).toBe('reply text');
    expect(result!.replyTo).toBe('0xabc123');
    expect(result!.replyText).toBe('original');
    expect(result!.replyAuthor).toBe('0xdef456');
    expect(result!.mentions).toEqual(['0x111', '0x222']);
  });

  it('returns null for wrong key', () => {
    const wrongKey = derivePublicTopicKey(999);
    const encrypted = encryptMessage('secret', key);
    const result = decryptMessage(encrypted, wrongKey);
    expect(result).toBeNull();
  });
});
