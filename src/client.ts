import { ethers } from 'ethers';
import { CHAINS } from './chains.js';
import { REGISTRY_ABI, KEY_MANAGER_ABI, SCHEMA_REGISTRY_ABI, IDENTITY_REGISTRY_ABI } from './contracts.js';
import {
  derivePublicTopicKey,
  deriveKeyFromPassphrase,
  encryptMessage,
  decryptMessage,
} from './crypto/encrypt.js';
import {
  deriveKeypairFromSignature,
  keypairFromPrivateKey,
  computeSharedSecret,
  deriveAESKeyFromSecret,
  encryptTopicKeyForUser,
  decryptTopicKey,
  bytesToHex,
  hexToBytes,
} from './crypto/ecdh.js';
import { AccessLevel } from './types.js';
import type {
  ClawtennaOptions,
  ReadOptions,
  SendOptions,
  Message,
  Topic,
  Application,
  Member,
  TopicMessageFee,
  SchemaInfo,
  TopicSchemaBinding,
  ChainName,
} from './types.js';

export class Clawntenna {
  readonly provider: ethers.JsonRpcProvider;
  readonly wallet: ethers.Wallet | null;
  readonly registry: ethers.Contract;
  readonly keyManager: ethers.Contract;
  readonly schemaRegistry: ethers.Contract;
  readonly identityRegistry: ethers.Contract | null;
  readonly chainName: ChainName;

  // In-memory ECDH state
  private ecdhPrivateKey: Uint8Array | null = null;
  private ecdhPublicKey: Uint8Array | null = null;
  private topicKeys: Map<number, Uint8Array> = new Map();

  constructor(options: ClawtennaOptions = {}) {
    const chainName = options.chain ?? 'base';
    const chain = CHAINS[chainName];
    if (!chain) throw new Error(`Unsupported chain: ${chainName}`);
    this.chainName = chainName;

    const rpcUrl = options.rpcUrl ?? chain.rpc;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    const registryAddr = options.registryAddress ?? chain.registry;
    const keyManagerAddr = options.keyManagerAddress ?? chain.keyManager;
    const schemaRegistryAddr = options.schemaRegistryAddress ?? chain.schemaRegistry;

    if (options.privateKey) {
      this.wallet = new ethers.Wallet(options.privateKey, this.provider);
      this.registry = new ethers.Contract(registryAddr, REGISTRY_ABI, this.wallet);
      this.keyManager = new ethers.Contract(keyManagerAddr, KEY_MANAGER_ABI, this.wallet);
      this.schemaRegistry = new ethers.Contract(schemaRegistryAddr, SCHEMA_REGISTRY_ABI, this.wallet);
      this.identityRegistry = chain.identityRegistry
        ? new ethers.Contract(chain.identityRegistry, IDENTITY_REGISTRY_ABI, this.wallet)
        : null;
    } else {
      this.wallet = null;
      this.registry = new ethers.Contract(registryAddr, REGISTRY_ABI, this.provider);
      this.keyManager = new ethers.Contract(keyManagerAddr, KEY_MANAGER_ABI, this.provider);
      this.schemaRegistry = new ethers.Contract(schemaRegistryAddr, SCHEMA_REGISTRY_ABI, this.provider);
      this.identityRegistry = chain.identityRegistry
        ? new ethers.Contract(chain.identityRegistry, IDENTITY_REGISTRY_ABI, this.provider)
        : null;
    }
  }

  get address(): string | null {
    return this.wallet?.address ?? null;
  }

  // ===== MESSAGING =====

  /**
   * Send an encrypted message to a topic.
   * Automatically determines encryption key based on topic access level.
   */
  async sendMessage(topicId: number, text: string, options?: SendOptions): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required to send messages');

    const key = await this.getEncryptionKey(topicId);
    const encrypted = encryptMessage(text, key, {
      replyTo: options?.replyTo,
      mentions: options?.mentions,
    });

    return this.registry.sendMessage(topicId, ethers.toUtf8Bytes(encrypted));
  }

  /**
   * Read and decrypt recent messages from a topic.
   */
  async readMessages(topicId: number, options?: ReadOptions): Promise<Message[]> {
    const limit = options?.limit ?? 50;
    const fromBlock = options?.fromBlock ?? -100_000;

    const key = await this.getEncryptionKey(topicId);
    const filter = this.registry.filters.MessageSent(topicId);
    const events = await this.registry.queryFilter(filter, fromBlock);

    const messages: Message[] = [];
    const recent = events.slice(-limit);

    for (const event of recent) {
      const log = event as ethers.EventLog;
      const payloadStr = ethers.toUtf8String(log.args.payload);
      const parsed = decryptMessage(payloadStr, key);

      messages.push({
        topicId: BigInt(topicId),
        sender: log.args.sender,
        text: parsed?.text ?? '[decryption failed]',
        replyTo: parsed?.replyTo ?? null,
        mentions: parsed?.mentions ?? null,
        timestamp: log.args.timestamp,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
      });
    }

    return messages;
  }

  /**
   * Subscribe to real-time messages on a topic.
   * Returns an unsubscribe function.
   */
  onMessage(
    topicId: number,
    callback: (msg: Message) => void
  ): () => void {
    let key: Uint8Array | null = null;

    // Pre-derive key, then start listening
    this.getEncryptionKey(topicId).then((k) => {
      key = k;
    });

    const handler = (
      tId: bigint,
      sender: string,
      payload: string,
      timestamp: bigint,
      event: ethers.EventLog
    ) => {
      if (!key) return;
      const payloadStr = ethers.toUtf8String(payload);
      const parsed = decryptMessage(payloadStr, key);

      callback({
        topicId: tId,
        sender,
        text: parsed?.text ?? '[decryption failed]',
        replyTo: parsed?.replyTo ?? null,
        mentions: parsed?.mentions ?? null,
        timestamp,
        txHash: event.transactionHash,
        blockNumber: event.blockNumber,
      });
    };

    this.registry.on(this.registry.filters.MessageSent(topicId), handler);
    return () => {
      this.registry.off(this.registry.filters.MessageSent(topicId), handler);
    };
  }

  // ===== NICKNAMES =====

  async setNickname(appId: number, nickname: string): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    return this.registry.setNickname(appId, nickname);
  }

  async getNickname(appId: number, address: string): Promise<string> {
    return this.registry.getNickname(appId, address);
  }

  async hasNickname(appId: number, address: string): Promise<boolean> {
    return this.registry.hasNickname(appId, address);
  }

  async canChangeNickname(appId: number, address: string): Promise<{ canChange: boolean; timeRemaining: bigint }> {
    const [canChange, timeRemaining] = await this.registry.canChangeNickname(appId, address);
    return { canChange, timeRemaining };
  }

  async clearNickname(appId: number): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    return this.registry.clearNickname(appId);
  }

  async setNicknameCooldown(appId: number, cooldownSeconds: number): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    return this.registry.setNicknameCooldown(appId, cooldownSeconds);
  }

  async getNicknameCooldown(appId: number): Promise<bigint> {
    return this.registry.appNicknameCooldown(appId);
  }

  // ===== TOPICS =====

  async createTopic(
    appId: number,
    name: string,
    description: string,
    accessLevel: AccessLevel
  ): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    return this.registry.createTopic(appId, name, description, accessLevel);
  }

  async getTopic(topicId: number): Promise<Topic> {
    const t = await this.registry.getTopic(topicId);
    return {
      id: t.id,
      applicationId: t.applicationId,
      name: t.name,
      description: t.description,
      owner: t.owner,
      creator: t.creator,
      createdAt: t.createdAt,
      lastMessageAt: t.lastMessageAt,
      messageCount: t.messageCount,
      accessLevel: Number(t.accessLevel),
      active: t.active,
    };
  }

  async getApplicationTopics(appId: number): Promise<bigint[]> {
    return this.registry.getApplicationTopics(appId);
  }

  async getTopicCount(): Promise<number> {
    const count = await this.registry.topicCount();
    return Number(count);
  }

  async setTopicPermission(
    topicId: number,
    user: string,
    permission: number
  ): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    return this.registry.setTopicPermission(topicId, user, permission);
  }

  async getTopicPermission(topicId: number, user: string): Promise<number> {
    const perm = await this.registry.getTopicPermission(topicId, user);
    return Number(perm);
  }

  // ===== MEMBERS =====

  async addMember(
    appId: number,
    address: string,
    nickname: string,
    roles: number
  ): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    return this.registry.addMember(appId, address, nickname, roles);
  }

  async removeMember(appId: number, address: string): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    return this.registry.removeMember(appId, address);
  }

  async updateMemberRoles(
    appId: number,
    address: string,
    roles: number
  ): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    return this.registry.updateMemberRoles(appId, address, roles);
  }

  async getMember(appId: number, address: string): Promise<Member> {
    const m = await this.registry.getMember(appId, address);
    return {
      account: m.account,
      nickname: m.nickname,
      roles: Number(m.roles),
      joinedAt: m.joinedAt,
    };
  }

  async isMember(appId: number, address: string): Promise<boolean> {
    return this.registry.isMember(appId, address);
  }

  async getApplicationMembers(appId: number): Promise<string[]> {
    return this.registry.getApplicationMembers(appId);
  }

  // ===== ACCESS CHECKS =====

  async canRead(topicId: number, address: string): Promise<boolean> {
    return this.registry.canReadTopic(topicId, address);
  }

  async canWrite(topicId: number, address: string): Promise<boolean> {
    return this.registry.canWriteToTopic(topicId, address);
  }

  // ===== APPLICATIONS =====

  async createApplication(
    name: string,
    description: string,
    frontendUrl: string,
    allowPublicTopicCreation: boolean
  ): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    return this.registry.createApplication(name, description, frontendUrl, allowPublicTopicCreation);
  }

  async getApplicationCount(): Promise<number> {
    const count = await this.registry.applicationCount();
    return Number(count);
  }

  async updateFrontendUrl(appId: number, frontendUrl: string): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    return this.registry.updateApplicationFrontendUrl(appId, frontendUrl);
  }

  async getApplication(appId: number): Promise<Application> {
    const a = await this.registry.getApplication(appId);
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      frontendUrl: a.frontendUrl,
      owner: a.owner,
      createdAt: a.createdAt,
      memberCount: Number(a.memberCount),
      topicCount: Number(a.topicCount),
      active: a.active,
      allowPublicTopicCreation: a.allowPublicTopicCreation,
      topicCreationFeeToken: a.topicCreationFeeToken,
      topicCreationFeeAmount: a.topicCreationFeeAmount,
    };
  }

  // ===== FEES =====

  async getTopicMessageFee(topicId: number): Promise<TopicMessageFee> {
    const [token, amount] = await this.registry.getTopicMessageFee(topicId);
    return { token, amount };
  }

  async setTopicCreationFee(
    appId: number,
    feeToken: string,
    feeAmount: bigint
  ): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    return this.registry.setTopicCreationFee(appId, feeToken, feeAmount);
  }

  async setTopicMessageFee(
    topicId: number,
    feeToken: string,
    feeAmount: bigint
  ): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    return this.registry.setTopicMessageFee(topicId, feeToken, feeAmount);
  }

  // ===== ECDH (Private Topics) =====

  /**
   * Derive ECDH keypair from wallet signature (deterministic).
   * Requires a signer capable of signing messages.
   */
  async deriveECDHFromWallet(appId: number = 1): Promise<{ publicKey: Uint8Array }> {
    if (!this.wallet) throw new Error('Wallet required');

    const { privateKey, publicKey } = await deriveKeypairFromSignature(
      this.wallet.address,
      (msg) => this.wallet!.signMessage(msg),
      appId
    );

    this.ecdhPrivateKey = privateKey;
    this.ecdhPublicKey = publicKey;
    return { publicKey };
  }

  /**
   * Load ECDH keypair from a hex private key (e.g. from credentials file).
   */
  loadECDHKeypair(privateKeyHex: string): void {
    const { privateKey, publicKey } = keypairFromPrivateKey(privateKeyHex);
    this.ecdhPrivateKey = privateKey;
    this.ecdhPublicKey = publicKey;
  }

  /**
   * Register ECDH public key on-chain.
   */
  async registerPublicKey(): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    if (!this.ecdhPublicKey) throw new Error('ECDH key not derived yet');

    const hasKey = await this.keyManager.hasPublicKey(this.wallet.address);
    if (hasKey) {
      throw new Error('Public key already registered on-chain');
    }

    return this.keyManager.registerPublicKey(this.ecdhPublicKey);
  }

  /**
   * Fetch and decrypt the topic symmetric key from an on-chain ECDH grant.
   */
  async fetchAndDecryptTopicKey(topicId: number): Promise<Uint8Array> {
    if (!this.ecdhPrivateKey) throw new Error('ECDH key not derived yet');

    const grant = await this.keyManager.getMyKey(topicId);
    const encryptedKey = ethers.getBytes(grant.encryptedKey);
    const granterPubKey = ethers.getBytes(grant.granterPublicKey);

    const topicKey = decryptTopicKey(encryptedKey, this.ecdhPrivateKey, granterPubKey);
    this.topicKeys.set(topicId, topicKey);
    return topicKey;
  }

  /**
   * Grant a user access to a private topic's symmetric key.
   */
  async grantKeyAccess(
    topicId: number,
    userAddress: string,
    topicKey: Uint8Array
  ): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    if (!this.ecdhPrivateKey) throw new Error('ECDH key not derived yet');

    const userPubKeyBytes = ethers.getBytes(await this.keyManager.getPublicKey(userAddress));
    const encrypted = encryptTopicKeyForUser(topicKey, this.ecdhPrivateKey, userPubKeyBytes);
    return this.keyManager.grantKeyAccess(topicId, userAddress, encrypted);
  }

  /**
   * Store a pre-known topic key (e.g. loaded from credentials).
   */
  setTopicKey(topicId: number, key: Uint8Array): void {
    this.topicKeys.set(topicId, key);
  }

  /**
   * Check if an address has an ECDH public key registered on-chain.
   */
  async hasPublicKey(address: string): Promise<boolean> {
    return this.keyManager.hasPublicKey(address);
  }

  /**
   * Get an address's ECDH public key from chain.
   */
  async getPublicKey(address: string): Promise<Uint8Array> {
    const key = await this.keyManager.getPublicKey(address);
    return ethers.getBytes(key);
  }

  /**
   * Check if a user has key access for a topic.
   */
  async hasKeyAccess(topicId: number, address: string): Promise<boolean> {
    return this.keyManager.hasKeyAccess(topicId, address);
  }

  /**
   * Get the key grant details for a user on a topic.
   */
  async getKeyGrant(topicId: number, address: string): Promise<{
    encryptedKey: Uint8Array;
    granterPublicKey: Uint8Array;
    granter: string;
    keyVersion: bigint;
    grantedAt: bigint;
  }> {
    const g = await this.keyManager.getKeyGrant(topicId, address);
    return {
      encryptedKey: ethers.getBytes(g.encryptedKey),
      granterPublicKey: ethers.getBytes(g.granterPublicKey),
      granter: g.granter,
      keyVersion: g.keyVersion,
      grantedAt: g.grantedAt,
    };
  }

  /**
   * Get the current key version for a topic.
   */
  async getKeyVersion(topicId: number): Promise<bigint> {
    return this.keyManager.keyVersions(topicId);
  }

  /**
   * Batch grant key access to multiple users at once (max 50).
   */
  async batchGrantKeyAccess(
    topicId: number,
    users: string[],
    topicKey: Uint8Array
  ): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    if (!this.ecdhPrivateKey) throw new Error('ECDH key not derived yet');

    const encryptedKeys: Uint8Array[] = [];
    for (const user of users) {
      const userPubKeyBytes = ethers.getBytes(await this.keyManager.getPublicKey(user));
      const encrypted = encryptTopicKeyForUser(topicKey, this.ecdhPrivateKey, userPubKeyBytes);
      encryptedKeys.push(encrypted);
    }

    return this.keyManager.batchGrantKeyAccess(topicId, users, encryptedKeys);
  }

  /**
   * Revoke a user's key access for a topic.
   */
  async revokeKeyAccess(topicId: number, address: string): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    return this.keyManager.revokeKeyAccess(topicId, address);
  }

  /**
   * Rotate the key version for a topic. Existing grants become stale.
   */
  async rotateKey(topicId: number): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    return this.keyManager.rotateKey(topicId);
  }

  // ===== SCHEMAS =====

  /**
   * Create a schema scoped to an application. Requires app admin role.
   */
  async createAppSchema(
    appId: number,
    name: string,
    description: string,
    body: string
  ): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    return this.schemaRegistry.createAppSchema(appId, name, description, body);
  }

  /**
   * Publish a new version of an existing schema.
   */
  async publishSchemaVersion(
    schemaId: number,
    body: string
  ): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    return this.schemaRegistry.publishSchemaVersion(schemaId, body);
  }

  /**
   * Deactivate a schema.
   */
  async deactivateSchema(schemaId: number): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    return this.schemaRegistry.deactivateSchema(schemaId);
  }

  /**
   * Get schema info including application scope.
   */
  async getSchema(schemaId: number): Promise<SchemaInfo> {
    const s = await this.schemaRegistry.getSchemaWithApp(schemaId);
    return {
      id: Number(s.id),
      name: s.name,
      description: s.description,
      creator: s.creator,
      createdAt: Number(s.createdAt),
      versionCount: Number(s.versionCount),
      active: s.active,
      applicationId: Number(s.applicationId),
    };
  }

  /**
   * Get all schemas scoped to an application.
   */
  async getApplicationSchemas(appId: number): Promise<SchemaInfo[]> {
    const ids: bigint[] = await this.schemaRegistry.getApplicationSchemas(appId);
    const schemas: SchemaInfo[] = [];
    for (const id of ids) {
      const s = await this.getSchema(Number(id));
      schemas.push(s);
    }
    return schemas;
  }

  /**
   * Get schema body for a specific version.
   */
  async getSchemaBody(schemaId: number, version: number): Promise<string> {
    return this.schemaRegistry.getSchemaBody(schemaId, version);
  }

  /**
   * Get the schema binding for a topic.
   */
  async getTopicSchema(topicId: number): Promise<TopicSchemaBinding> {
    const s = await this.schemaRegistry.getTopicSchema(topicId);
    return {
      schemaId: Number(s.schemaId),
      version: Number(s.version),
      body: s.body,
    };
  }

  /**
   * Bind a schema version to a topic. Requires topic admin.
   */
  async setTopicSchema(
    topicId: number,
    schemaId: number,
    version: number
  ): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    return this.schemaRegistry.setTopicSchema(topicId, schemaId, version);
  }

  /**
   * Remove schema binding from a topic.
   */
  async clearTopicSchema(topicId: number): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    return this.schemaRegistry.clearTopicSchema(topicId);
  }

  // ===== AGENT IDENTITY (V5) =====

  /**
   * Register your ERC-8004 agent identity for an application (V5).
   * Verifies ownership via ownerOf on the identity registry.
   */
  async registerAgentIdentity(appId: number, tokenId: number): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    return this.registry.registerAgentIdentity(appId, tokenId);
  }

  /**
   * Clear your agent identity registration for an application (V5).
   */
  async clearAgentIdentity(appId: number): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    return this.registry.clearAgentIdentity(appId);
  }

  /**
   * Get the registered agent token ID for a user in an application (V5/V6).
   * Returns 0 if not registered. V6 validates ownership live via ownerOf.
   */
  async getAgentTokenId(appId: number, address: string): Promise<bigint> {
    return this.registry.getAgentTokenId(appId, address);
  }

  /**
   * Check if a user has a registered agent identity for an application (V5/V6).
   * V6 validates ownership live — returns false if the token was transferred.
   */
  async hasAgentIdentity(appId: number, address: string): Promise<boolean> {
    return this.registry.hasAgentIdentity(appId, address);
  }

  // ===== ERC-8004 IDENTITY REGISTRY =====

  private requireIdentityRegistry(): ethers.Contract {
    if (!this.identityRegistry) {
      throw new Error('ERC-8004 Identity Registry not available on this chain. Use Base.');
    }
    return this.identityRegistry;
  }

  /**
   * Register as an agent on the ERC-8004 Identity Registry.
   * Optionally provide a URI for the agent's metadata.
   */
  async registerAgent(agentURI?: string): Promise<{ agentId: bigint; tx: ethers.TransactionResponse }> {
    if (!this.wallet) throw new Error('Wallet required');
    const registry = this.requireIdentityRegistry();

    const tx: ethers.TransactionResponse = agentURI
      ? await registry['register(string)'](agentURI)
      : await registry['register()']();

    const receipt = await tx.wait();
    let agentId = 0n;
    if (receipt) {
      for (const log of receipt.logs) {
        try {
          const parsed = registry.interface.parseLog(log);
          if (parsed?.name === 'Registered') {
            agentId = parsed.args.agentId;
            break;
          }
        } catch { /* skip non-matching logs */ }
      }
    }

    return { agentId, tx };
  }

  /**
   * Register as an agent with metadata entries.
   */
  async registerAgentWithMetadata(
    agentURI: string,
    metadata: Array<{ metadataKey: string; metadataValue: Uint8Array }>
  ): Promise<{ agentId: bigint; tx: ethers.TransactionResponse }> {
    if (!this.wallet) throw new Error('Wallet required');
    const registry = this.requireIdentityRegistry();

    const tx: ethers.TransactionResponse = await registry['register(string,(string,bytes)[])'](agentURI, metadata);

    const receipt = await tx.wait();
    let agentId = 0n;
    if (receipt) {
      for (const log of receipt.logs) {
        try {
          const parsed = registry.interface.parseLog(log);
          if (parsed?.name === 'Registered') {
            agentId = parsed.args.agentId;
            break;
          }
        } catch { /* skip non-matching logs */ }
      }
    }

    return { agentId, tx };
  }

  /**
   * Check if an address has an ERC-8004 agent identity NFT.
   * Defaults to the connected wallet address.
   */
  async isRegisteredAgent(address?: string): Promise<boolean> {
    const registry = this.requireIdentityRegistry();
    const addr = address ?? this.wallet?.address;
    if (!addr) throw new Error('Address required');

    const balance: bigint = await registry.balanceOf(addr);
    return balance > 0n;
  }

  /**
   * Get agent info by agent ID.
   */
  async getAgentInfo(agentId: number): Promise<{ owner: string; uri: string; wallet: string }> {
    const registry = this.requireIdentityRegistry();

    const [owner, uri, wallet] = await Promise.all([
      registry.ownerOf(agentId) as Promise<string>,
      registry.tokenURI(agentId) as Promise<string>,
      registry.getAgentWallet(agentId) as Promise<string>,
    ]);

    return { owner, uri, wallet };
  }

  /**
   * Set metadata for an agent.
   */
  async setAgentMetadata(
    agentId: number,
    key: string,
    value: Uint8Array
  ): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    const registry = this.requireIdentityRegistry();
    return registry.setMetadata(agentId, key, value);
  }

  /**
   * Get metadata for an agent by key.
   */
  async getAgentMetadata(agentId: number, key: string): Promise<string> {
    const registry = this.requireIdentityRegistry();
    const data: string = await registry.getMetadata(agentId, key);
    return ethers.toUtf8String(data);
  }

  /**
   * Update the URI for an agent registration.
   */
  async setAgentURI(agentId: number, newURI: string): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet required');
    const registry = this.requireIdentityRegistry();
    return registry.setAgentURI(agentId, newURI);
  }

  /**
   * Look up an agent by its wallet address using the V5/V6 on-chain registry mapping.
   * V6 validates ownership live — stale registrations (transferred tokens) return 0.
   * Returns registration status, token ID, owner, URI, wallet, and parsed metadata.
   */
  async getAgentByAddress(address: string, appId: number): Promise<
    | { registered: false }
    | { registered: true; agentId: number; owner: string; uri: string; wallet: string; metadata: Record<string, unknown> | null }
  > {
    const onChainTokenId: bigint = await this.registry.getAgentTokenId(appId, address);
    if (onChainTokenId === 0n) return { registered: false };

    const agentId = Number(onChainTokenId);
    const { owner, uri, wallet } = await this.getAgentInfo(agentId);
    let metadata: Record<string, unknown> | null = null;
    if (uri) {
      metadata = await this.parseTokenURI(uri);
    }
    return { registered: true, agentId, owner, uri, wallet, metadata };
  }

  /**
   * Parse a tokenURI into JSON metadata.
   * Handles data:application/json;base64, data:application/json, HTTP(S), and ipfs:// URIs.
   */
  private async parseTokenURI(uri: string): Promise<Record<string, unknown> | null> {
    try {
      if (uri.startsWith('data:application/json;base64,')) {
        const json = atob(uri.slice('data:application/json;base64,'.length));
        return JSON.parse(json);
      }
      if (uri.startsWith('data:application/json,')) {
        return JSON.parse(decodeURIComponent(uri.slice('data:application/json,'.length)));
      }
      let url = uri;
      if (url.startsWith('ipfs://')) {
        url = 'https://ipfs.io/ipfs/' + url.slice('ipfs://'.length);
      }
      const resp = await fetch(url);
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      return null;
    }
  }

  // ===== DATA EXPORT =====

  /**
   * Look up an application ID by its name.
   */
  async getApplicationByName(name: string): Promise<number> {
    const id = await this.registry.applicationNames(name);
    return Number(id);
  }

  /**
   * Get schema version details including body and publish timestamp.
   */
  async getSchemaVersion(schemaId: number, version: number): Promise<{ body: string; publishedAt: bigint }> {
    const [body, publishedAt] = await this.schemaRegistry.getSchemaVersion(schemaId, version);
    return { body, publishedAt };
  }

  /**
   * Export member data for a user in an application.
   */
  async exportMemberData(appId: number, user: string): Promise<string> {
    const data = await this.registry.exportMemberData(appId, user);
    return ethers.hexlify(data);
  }

  /**
   * Export all application data.
   */
  async exportApplicationData(appId: number): Promise<string> {
    const data = await this.registry.exportApplicationData(appId);
    return ethers.hexlify(data);
  }

  /**
   * Export user data from the key manager for specified topics.
   */
  async exportUserData(user: string, topicIds: number[]): Promise<string> {
    const data = await this.keyManager.exportUserData(user, topicIds);
    return ethers.hexlify(data);
  }

  // ===== INTERNAL =====

  /**
   * Get the encryption key for a topic, determining the type automatically.
   */
  private async getEncryptionKey(topicId: number): Promise<Uint8Array> {
    // Check for a stored private topic key first
    const storedKey = this.topicKeys.get(topicId);
    if (storedKey) return storedKey;

    // Fetch topic metadata to determine access level
    const topic = await this.getTopic(topicId);

    if (topic.accessLevel === AccessLevel.PRIVATE) {
      throw new Error(
        `Topic ${topicId} is PRIVATE. Call fetchAndDecryptTopicKey() or setTopicKey() first.`
      );
    }

    // Public or public_limited: derive deterministic key
    return derivePublicTopicKey(topicId);
  }
}
