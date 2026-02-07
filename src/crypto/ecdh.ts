import { secp256k1 } from '@noble/curves/secp256k1';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/hashes/utils';
import { ECDH_HKDF_SALT, ECDH_HKDF_INFO, ECDH_DERIVATION_MESSAGE } from '../constants.js';

const encoder = new TextEncoder();

/**
 * Derive an ECDH keypair deterministically from a wallet signature.
 * This produces the same keypair as the web frontend for the same wallet + app.
 */
export async function deriveKeypairFromSignature(
  walletAddress: string,
  signMessage: (message: string) => Promise<string>,
  appId: number = 1
): Promise<{ privateKey: Uint8Array; publicKey: Uint8Array }> {
  const message = ECDH_DERIVATION_MESSAGE(walletAddress, appId);
  const signature = await signMessage(message);

  // Hash the signature string (as UTF-8 bytes) to get private key
  const sigBytes = encoder.encode(signature);
  const hashBuffer = sha256(sigBytes);
  const privateKey = new Uint8Array(hashBuffer);

  // Derive compressed public key
  const publicKey = secp256k1.getPublicKey(privateKey, true);

  return { privateKey, publicKey };
}

/**
 * Derive ECDH keypair from a raw private key (e.g. from stored credentials).
 */
export function keypairFromPrivateKey(privateKeyHex: string): {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
} {
  const cleaned = privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex;
  const privateKey = hexToBytes(cleaned);
  const publicKey = secp256k1.getPublicKey(privateKey, true);
  return { privateKey, publicKey };
}

/**
 * Compute ECDH shared secret (x-coordinate of shared point).
 */
export function computeSharedSecret(
  ourPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array
): Uint8Array {
  const sharedPoint = secp256k1.getSharedSecret(ourPrivateKey, theirPublicKey);
  // Return x-coordinate only (skip the 0x04 prefix byte)
  return sharedPoint.slice(1, 33);
}

/**
 * Derive AES-256 key from an ECDH shared secret using HKDF.
 * Matches the web frontend: salt='antenna-ecdh-v1', info='topic-key-encryption'.
 */
export function deriveAESKeyFromSecret(
  sharedSecret: Uint8Array,
  info: string = ECDH_HKDF_INFO
): Uint8Array {
  return hkdf(sha256, sharedSecret, encoder.encode(ECDH_HKDF_SALT), info, 32);
}

/**
 * Encrypt a topic symmetric key for a recipient using ECDH.
 * Returns IV (12 bytes) + ciphertext (includes GCM auth tag).
 */
export function encryptTopicKeyForUser(
  topicKey: Uint8Array,
  ourPrivateKey: Uint8Array,
  recipientPublicKey: Uint8Array
): Uint8Array {
  const shared = computeSharedSecret(ourPrivateKey, recipientPublicKey);
  const aesKey = deriveAESKeyFromSecret(shared);
  const iv = randomBytes(12);
  const aes = gcm(aesKey, iv);
  const ciphertext = aes.encrypt(topicKey);

  // Combine: IV + ciphertext
  const result = new Uint8Array(iv.length + ciphertext.length);
  result.set(iv);
  result.set(ciphertext, iv.length);
  return result;
}

/**
 * Decrypt a topic symmetric key received via ECDH grant.
 * Input format: IV (12 bytes) + ciphertext (includes GCM auth tag).
 */
export function decryptTopicKey(
  encryptedKey: Uint8Array,
  ourPrivateKey: Uint8Array,
  granterPublicKey: Uint8Array
): Uint8Array {
  const shared = computeSharedSecret(ourPrivateKey, granterPublicKey);
  const aesKey = deriveAESKeyFromSecret(shared);
  const iv = encryptedKey.slice(0, 12);
  const ciphertext = encryptedKey.slice(12);
  const aes = gcm(aesKey, iv);
  return aes.decrypt(ciphertext);
}

// ===== Hex helpers =====

export function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
  return new Uint8Array(cleaned.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
}
