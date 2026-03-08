// ===== Enums =====

export enum AccessLevel {
  PUBLIC = 0,
  PUBLIC_LIMITED = 1,
  PRIVATE = 2,
}

export enum Permission {
  NONE = 0,
  READ = 1,
  WRITE = 2,
  READ_WRITE = 3,
  ADMIN = 4,
}

export enum Role {
  MEMBER = 1,
  SUPPORT_MANAGER = 2,
  TOPIC_MANAGER = 4,
  ADMIN = 8,
  OWNER_DELEGATE = 16,
}

// ===== Chain types =====

export interface ChainConfig {
  chainId: number;
  name: string;
  shortName: string;
  rpc: string;
  explorer: string;
  explorerApi?: string;
  registry: string;
  keyManager: string;
  schemaRegistry: string;
  identityRegistry?: string;
  escrow?: string;
  defaultLookback: number;
  logChunkSize: number;
}

export type ChainName = 'base' | 'avalanche' | 'baseSepolia';

// ===== Contract return types =====

export interface Application {
  id: bigint;
  name: string;
  description: string;
  frontendUrl: string;
  owner: string;
  createdAt: bigint;
  memberCount: number;
  topicCount: number;
  active: boolean;
  allowPublicTopicCreation: boolean;
  topicCreationFeeToken?: string;
  topicCreationFeeAmount?: bigint;
}

export interface Topic {
  id: bigint;
  applicationId: bigint;
  name: string;
  description: string;
  owner: string;
  creator: string;
  createdAt: bigint;
  lastMessageAt: bigint;
  messageCount: bigint;
  accessLevel: number;
  active: boolean;
}

export interface Member {
  account: string;
  nickname: string;
  roles: number;
  joinedAt: bigint;
}

export interface KeyGrant {
  encryptedKey: Uint8Array;
  granterPublicKey: Uint8Array;
  granter: string;
  keyVersion: bigint;
  grantedAt?: bigint;
  currentVersion?: bigint;
}

// ===== Message types =====

export interface MessageContent {
  text: string;
  replyTo?: string;
  replyText?: string;
  replyAuthor?: string;
  mentions?: string[];
}

export type DecryptedContent = unknown;

export interface EncryptedPayload {
  e: boolean;
  v: number;
  iv: string;
  ct: string;
}

export interface Message {
  topicId: number;
  sender: string;
  content: DecryptedContent;
  timestamp: number;
  txHash: string;
  blockNumber: number;
}

export interface TopicMessageFee {
  token: string;
  amount: bigint;
}

export interface SchemaInfo {
  id: number;
  name: string;
  description: string;
  creator: string;
  createdAt: number;
  versionCount: number;
  active: boolean;
  applicationId: number;
}

export interface TopicSchemaBinding {
  schemaId: number;
  version: number;
  body: string;
}

export enum DepositStatus {
  Pending = 0,
  Released = 1,
  Refunded = 2,
}

export interface EscrowDeposit {
  id: bigint;
  topicId: bigint;
  sender: string;
  recipient: string;
  token: string;
  amount: bigint;
  appOwner: string;
  depositedAt: bigint;
  timeout: bigint;
  status: DepositStatus;
}

export interface EscrowConfig {
  enabled: boolean;
  timeout: bigint;
}

export interface DepositTimer {
  depositId: bigint;
  expired: boolean;
  remainingSeconds: number;
  deadline: number;
  formattedRemaining: string;
  canClaim: boolean;
}

export interface EnrichedDeposit extends EscrowDeposit {
  txHash: string;
  blockNumber: number;
  messageText: string | null;
  hasResponse: boolean;
  remainingSeconds: number;
  formattedRemaining: string;
  expired: boolean;
  formattedAmount: string | null;
}

// ===== Credibility (V4) =====

export interface RecipientStats {
  depositsReceived: bigint;
  depositsReleased: bigint;
  depositsRefunded: bigint;
  depositsExpired: bigint;
}

export interface WalletCredibility {
  responseRate: number;        // 0-100 (percentage, converted from basis points)
  depositsReceived: bigint;
  depositsReleased: bigint;
  depositsRefunded: bigint;
  totalEarned: bigint;
  totalRefunded: bigint;
  formattedEarned: string | null;
  formattedRefunded: string | null;
}

// ===== Client options =====

export interface ClawtennaOptions {
  chain?: ChainName;
  chainId?: number;
  rpcUrl?: string;
  privateKey?: string;
  historyApiKey?: string;
  registryAddress?: string;
  keyManagerAddress?: string;
  schemaRegistryAddress?: string;
  escrowAddress?: string;
}

export interface ReadOptions {
  limit?: number;
  fromBlock?: number;
  recentBlocks?: number;
  onProgress?: (update: {
    fromBlock: number;
    toBlock: number;
    queryCount: number;
  }) => void;
}

export interface SendOptions {
  replyTo?: string;
  replyText?: string;
  replyAuthor?: string;
  mentions?: string[];
  skipRefundCheck?: boolean;
}

// ===== Credentials =====

export interface Credentials {
  version: 3;
  wallet: {
    address: string;
  };
  secrets: {
    type: 'encrypted-file';
    path: string;
    passphrase: SecretSource;
  };
  chains: Record<string, CredentialChain>;
}

export type SecretSource =
  | {
      type: 'prompt';
    }
  | {
      type: 'env';
      env: string;
    }
  | {
      type: 'command';
      command: string;
    };

export interface CredentialChain {
  name: string;
  rpc?: string;
  ecdh: {
    mode: 'derived' | 'stored';
    registered: boolean;
    publicKey?: string;
  } | null;
  apps: Record<string, CredentialApp>;
}

export interface CredentialApp {
  name: string;
  nickname: string;
  agentTokenId: number | null;
}

export interface SecretStore {
  version: 1;
  wallet: {
    privateKey: string;
  };
  chains: Record<string, SecretStoreChain>;
}

export interface SecretStoreChain {
  ecdh: {
    privateKey: string;
    publicKey: string;
  } | null;
  apps: Record<string, SecretStoreApp>;
}

export interface SecretStoreApp {
  topicKeys: Record<string, string>;
}

export interface EncryptedSecretStore {
  version: 1;
  kdf: {
    name: 'scrypt';
    salt: string;
    N: number;
    r: number;
    p: number;
  };
  cipher: {
    name: 'aes-256-gcm';
    iv: string;
    tag: string;
  };
  ciphertext: string;
}

export interface CredentialsV2 {
  version: 2;
  wallet: {
    address: string;
    privateKey: string;
  };
  chains: Record<string, CredentialChainV2>;
}

export interface CredentialChainV2 {
  name: string;
  rpc?: string;
  ecdh: {
    privateKey: string;
    publicKey: string;
    registered: boolean;
  } | null;
  apps: Record<string, CredentialAppV2>;
}

export interface CredentialAppV2 {
  name: string;
  nickname: string;
  agentTokenId: number | null;
  topicKeys: Record<string, string>;
}

// Legacy v1 format for migration
export interface CredentialsV1 {
  wallet: {
    address: string;
    privateKey: string;
  };
  apps: Record<string, {
    name: string;
    nickname: string;
    ecdh: {
      privateKey: string;
      publicKey: string;
      registeredOnChain: boolean;
      topicKeys: Record<string, string>;
    } | null;
  }>;
}
