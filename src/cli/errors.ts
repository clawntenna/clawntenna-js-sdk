/**
 * Maps known contract error selectors to human-readable messages.
 */
export const ERROR_MAP: Record<string, string> = {
  '0xea8e4eb5': 'NotAuthorized — you lack permission for this action',
  '0x291fc442': 'NotMember — address is not a member of this app',
  '0x810074be': 'AlreadyMember — address is already a member',
  '0x5e03d55f': 'CannotRemoveSelf — owner cannot remove themselves',
  '0x17b29d2e': 'ApplicationNotFound — app ID does not exist',
  '0x04a29d55': 'TopicNotFound — topic ID does not exist',
  '0x430f13b3': 'InvalidName — name is empty or invalid',
  '0x9e4b2685': 'NameTaken — that name is already in use',
  '0xa2d0fee8': 'InvalidPublicKey — must be 33-byte compressed secp256k1 key',
  '0x16ea6d54': 'PublicKeyNotRegistered — user has no ECDH key (run: keys register)',
  '0x5303c506': 'InvalidEncryptedKey — encrypted key too short or malformed',
  '0xf4d678b8': 'InsufficientBalance — not enough tokens',
  '0x13be252b': 'InsufficientAllowance — token allowance too low',
  '0x0c79a8da': 'InvalidAccessLevel — use public, limited, or private',
  '0x15b3521e': 'NicknameCooldownActive — wait before changing nickname again',
  '0xae0ca2dd': 'SchemaNotFound — schema ID does not exist',
  '0x03230700': 'AppNameTaken — schema name already used in this app',
};

/**
 * Extract a human-readable error message from an Error thrown by ethers.js.
 * Looks for a 4-byte selector in the error data and maps it to a known message.
 */
export function decodeContractError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);

  const message = err.message;

  // ethers.js v6 attaches error data in various ways
  const dataMatch = message.match(/data="(0x[0-9a-fA-F]+)"/) ??
                    message.match(/error=\{[^}]*"data":"(0x[0-9a-fA-F]+)"/) ??
                    message.match(/(0x[0-9a-fA-F]{8})/);

  if (dataMatch) {
    const selector = dataMatch[1].slice(0, 10).toLowerCase();
    const decoded = ERROR_MAP[selector];
    if (decoded) return decoded;
  }

  // Also check the 'data' property on the error object (ethers v6 pattern)
  const anyErr = err as unknown as Record<string, unknown>;
  if (typeof anyErr.data === 'string' && anyErr.data.startsWith('0x')) {
    const selector = anyErr.data.slice(0, 10).toLowerCase();
    const decoded = ERROR_MAP[selector];
    if (decoded) return decoded;
  }

  // Check nested error info (ethers v6 wraps errors)
  if (anyErr.info && typeof anyErr.info === 'object') {
    const info = anyErr.info as Record<string, unknown>;
    if (info.error && typeof info.error === 'object') {
      const innerErr = info.error as Record<string, unknown>;
      if (typeof innerErr.data === 'string' && innerErr.data.startsWith('0x')) {
        const selector = innerErr.data.slice(0, 10).toLowerCase();
        const decoded = ERROR_MAP[selector];
        if (decoded) return decoded;
      }
    }
  }

  return message;
}
