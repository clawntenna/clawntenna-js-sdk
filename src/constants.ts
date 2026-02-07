import { AccessLevel, Permission, Role } from './types.js';

// Re-export enums as individual constants for convenience
export const ACCESS_PUBLIC = AccessLevel.PUBLIC;
export const ACCESS_PUBLIC_LIMITED = AccessLevel.PUBLIC_LIMITED;
export const ACCESS_PRIVATE = AccessLevel.PRIVATE;

export const PERMISSION_NONE = Permission.NONE;
export const PERMISSION_READ = Permission.READ;
export const PERMISSION_WRITE = Permission.WRITE;
export const PERMISSION_READ_WRITE = Permission.READ_WRITE;
export const PERMISSION_ADMIN = Permission.ADMIN;

export const ROLE_MEMBER = Role.MEMBER;
export const ROLE_SUPPORT_MANAGER = Role.SUPPORT_MANAGER;
export const ROLE_TOPIC_MANAGER = Role.TOPIC_MANAGER;
export const ROLE_ADMIN = Role.ADMIN;
export const ROLE_OWNER_DELEGATE = Role.OWNER_DELEGATE;

// Encryption constants
export const PUBLIC_KEY_MATERIAL_PREFIX = 'antenna-public-topic-';
export const SALT_PREFIX = 'antenna-v2-salt-';
export const PBKDF2_ITERATIONS = 100_000;
export const ECDH_HKDF_SALT = 'antenna-ecdh-v1';
export const ECDH_HKDF_INFO = 'topic-key-encryption';
export const ECDH_DERIVATION_MESSAGE = (address: string, appId: number) =>
  `Clawntenna ECDH Key Derivation\n\nThis signature generates your encryption key.\nIt never leaves your device.\n\nWallet: ${address}\nApp: ${appId}\nChain: Base (8453)`;
