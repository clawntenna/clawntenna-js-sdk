import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/hashes/utils';
import {
  PUBLIC_KEY_MATERIAL_PREFIX,
  SALT_PREFIX,
  PBKDF2_ITERATIONS,
} from '../constants.js';
import type { EncryptedPayload, MessageContent } from '../types.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Derive AES-256 key for a public/public_limited topic.
 * Uses PBKDF2 with SHA-256, matching the web frontend exactly.
 */
export function derivePublicTopicKey(topicId: number | bigint): Uint8Array {
  const keyMaterial = PUBLIC_KEY_MATERIAL_PREFIX + topicId;
  const salt = encoder.encode(SALT_PREFIX + topicId);
  return pbkdf2(sha256, keyMaterial, salt, { c: PBKDF2_ITERATIONS, dkLen: 32 });
}

/**
 * Derive AES-256 key from arbitrary passphrase (for private topics with manual passphrase).
 */
export function deriveKeyFromPassphrase(passphrase: string, topicId: number | bigint): Uint8Array {
  const salt = encoder.encode(SALT_PREFIX + topicId);
  return pbkdf2(sha256, passphrase, salt, { c: PBKDF2_ITERATIONS, dkLen: 32 });
}

/**
 * Encrypt a message payload with AES-256-GCM.
 * Output format: `{ e: true, v: 2, iv: base64, ct: base64 }`
 * The ciphertext includes the GCM auth tag (last 16 bytes).
 */
export function encrypt(plaintext: string, key: Uint8Array): string {
  const iv = randomBytes(12);
  const aes = gcm(key, iv);
  const ciphertext = aes.encrypt(encoder.encode(plaintext));

  const payload: EncryptedPayload = {
    e: true,
    v: 2,
    iv: toBase64(iv),
    ct: toBase64(ciphertext),
  };
  return JSON.stringify(payload);
}

/**
 * Decrypt a message payload. Handles both v1 and v2 formats.
 * Returns the decrypted string or null on failure.
 */
export function decrypt(jsonStr: string, key: Uint8Array): string | null {
  try {
    const data = JSON.parse(jsonStr) as EncryptedPayload;
    if (!data.e) {
      // Not encrypted — return raw for caller to parse
      return jsonStr;
    }

    const iv = fromBase64(data.iv);
    const ct = fromBase64(data.ct);

    const aes = gcm(key, iv);
    const decrypted = aes.decrypt(ct);
    return decoder.decode(decrypted);
  } catch {
    return null;
  }
}

/**
 * Encrypt a structured message (text + optional replyTo/mentions).
 */
export function encryptMessage(
  text: string,
  key: Uint8Array,
  options?: { replyTo?: string; replyText?: string; replyAuthor?: string; mentions?: string[] }
): string {
  const content: MessageContent = { text };
  if (options?.replyTo) content.replyTo = options.replyTo;
  if (options?.replyText) content.replyText = options.replyText;
  if (options?.replyAuthor) content.replyAuthor = options.replyAuthor;
  if (options?.mentions) content.mentions = options.mentions;
  return encrypt(JSON.stringify(content), key);
}

/**
 * Decrypt and parse a message payload into structured content.
 */
export function decryptMessage(
  jsonStr: string,
  key: Uint8Array
): { text: string; replyTo: string | null; replyText: string | null; replyAuthor: string | null; mentions: string[] | null } | null {
  const decrypted = decrypt(jsonStr, key);
  if (!decrypted) return null;

  try {
    const content = JSON.parse(decrypted);
    if (typeof content === 'object' && content.text) {
      return {
        text: content.text,
        replyTo: content.replyTo || null,
        replyText: content.replyText || null,
        replyAuthor: content.replyAuthor || null,
        mentions: content.mentions || null,
      };
    }
    // Plain text string was JSON-stringified
    return { text: decrypted, replyTo: null, replyText: null, replyAuthor: null, mentions: null };
  } catch {
    // Raw string, not JSON
    return { text: decrypted, replyTo: null, replyText: null, replyAuthor: null, mentions: null };
  }
}

// ===== Base64 helpers (isomorphic) =====

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(str: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(str, 'base64'));
  }
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}
