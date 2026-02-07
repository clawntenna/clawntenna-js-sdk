// Main client
export { Clawntenna } from './client.js';

// Types
export {
  AccessLevel,
  Permission,
  Role,
} from './types.js';
export type {
  ChainConfig,
  ChainName,
  ClawtennaOptions,
  ReadOptions,
  SendOptions,
  Message,
  MessageContent,
  EncryptedPayload,
  Topic,
  Application,
  Member,
  KeyGrant,
  TopicMessageFee,
  SchemaInfo,
  TopicSchemaBinding,
  Credentials,
  CredentialChain,
  CredentialApp,
  CredentialsV1,
} from './types.js';

// Chain configs
export { CHAINS, CHAIN_IDS, getChain } from './chains.js';

// Constants
export {
  ACCESS_PUBLIC,
  ACCESS_PUBLIC_LIMITED,
  ACCESS_PRIVATE,
  PERMISSION_NONE,
  PERMISSION_READ,
  PERMISSION_WRITE,
  PERMISSION_READ_WRITE,
  PERMISSION_ADMIN,
  ROLE_MEMBER,
  ROLE_SUPPORT_MANAGER,
  ROLE_TOPIC_MANAGER,
  ROLE_ADMIN,
  ROLE_OWNER_DELEGATE,
} from './constants.js';

// Contract ABIs
export { REGISTRY_ABI, KEY_MANAGER_ABI, SCHEMA_REGISTRY_ABI, IDENTITY_REGISTRY_ABI } from './contracts.js';

// Crypto utilities
export {
  derivePublicTopicKey,
  deriveKeyFromPassphrase,
  encrypt,
  decrypt,
  encryptMessage,
  decryptMessage,
  deriveKeypairFromSignature,
  keypairFromPrivateKey,
  computeSharedSecret,
  deriveAESKeyFromSecret,
  encryptTopicKeyForUser,
  decryptTopicKey,
  bytesToHex,
  hexToBytes,
} from './crypto/index.js';
