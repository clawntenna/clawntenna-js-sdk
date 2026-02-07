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
  registry: string;
  keyManager: string;
  schemaRegistry: string;
  identityRegistry?: string;
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
  mentions?: string[];
}

export interface EncryptedPayload {
  e: boolean;
  v: number;
  iv: string;
  ct: string;
}

export interface Message {
  topicId: bigint;
  sender: string;
  text: string;
  replyTo: string | null;
  mentions: string[] | null;
  timestamp: bigint;
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

// ===== Client options =====

export interface ClawtennaOptions {
  chain?: ChainName;
  chainId?: number;
  rpcUrl?: string;
  privateKey?: string;
  registryAddress?: string;
  keyManagerAddress?: string;
  schemaRegistryAddress?: string;
}

export interface ReadOptions {
  limit?: number;
  fromBlock?: number;
}

export interface SendOptions {
  replyTo?: string;
  mentions?: string[];
}

// ===== Credentials =====

export interface Credentials {
  version: 2;
  wallet: {
    address: string;
    privateKey: string;
  };
  chains: Record<string, CredentialChain>;
}

export interface CredentialChain {
  name: string;
  ecdh: {
    privateKey: string;
    publicKey: string;
    registered: boolean;
  } | null;
  apps: Record<string, CredentialApp>;
}

export interface CredentialApp {
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
