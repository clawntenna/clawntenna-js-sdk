import { ethers } from 'ethers';
import { CHAINS } from './chains.js';
import { REGISTRY_ABI, KEY_MANAGER_ABI, SCHEMA_REGISTRY_ABI, IDENTITY_REGISTRY_ABI, ESCROW_ABI } from './contracts.js';
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
import { randomBytes } from '@noble/hashes/utils';
import { AccessLevel, DepositStatus } from './types.js';
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
  EscrowDeposit,
  EscrowConfig,
  DepositTimer,
} from './types.js';
import {
  formatTimeout,
  isDepositExpired,
  timeUntilRefund,
  getDepositDeadline,
} from './escrow.js';
import { classifyRpcError } from './rpc-errors.js';
import { withRetry } from './retry.js';

export class Clawntenna {
  readonly provider: ethers.JsonRpcProvider;
  readonly chainName: ChainName;

  private _signer: ethers.Signer | null;
  private _address: string | null;
  private _registry: ethers.Contract;
  private _keyManager: ethers.Contract;
  private _schemaRegistry: ethers.Contract;
  private _identityRegistry: ethers.Contract | null;
  private _escrow: ethers.Contract | null;

  /** @deprecated Use `signer` instead. */
  get wallet(): ethers.Signer | null { return this._signer; }
  get signer(): ethers.Signer | null { return this._signer; }
  get registry(): ethers.Contract { return this._registry; }
  get keyManager(): ethers.Contract { return this._keyManager; }
  get schemaRegistry(): ethers.Contract { return this._schemaRegistry; }
  get identityRegistry(): ethers.Contract | null { return this._identityRegistry; }
  get escrow(): ethers.Contract | null { return this._escrow; }

  // In-memory ECDH state
  private ecdhPrivateKey: Uint8Array | null = null;
  private ecdhPublicKey: Uint8Array | null = null;
  private topicKeys: Map<number, Uint8Array> = new Map();

  // Token decimals cache (ERC-20 decimals never change)
  private tokenDecimalsCache: Map<string, number> = new Map();
  private static ERC20_DECIMALS_ABI = ['function decimals() view returns (uint8)'];

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
    const escrowAddr = options.escrowAddress ?? chain.escrow;

    const wallet = options.privateKey
      ? new ethers.Wallet(options.privateKey, this.provider)
      : null;
    const runner = wallet ?? this.provider;

    this._signer = wallet;
    this._address = wallet?.address ?? null;
    this._registry = new ethers.Contract(registryAddr, REGISTRY_ABI, runner);
    this._keyManager = new ethers.Contract(keyManagerAddr, KEY_MANAGER_ABI, runner);
    this._schemaRegistry = new ethers.Contract(schemaRegistryAddr, SCHEMA_REGISTRY_ABI, runner);
    this._identityRegistry = chain.identityRegistry
      ? new ethers.Contract(chain.identityRegistry, IDENTITY_REGISTRY_ABI, runner)
      : null;
    this._escrow = escrowAddr
      ? new ethers.Contract(escrowAddr, ESCROW_ABI, runner)
      : null;
  }

  /**
   * Connect an external signer (e.g. from BrowserProvider).
   * Reconnects all contract instances to the new signer.
   */
  async connectSigner(signer: ethers.Signer): Promise<void> {
    this._address = await signer.getAddress();
    this._signer = signer;
    this._registry = this._registry.connect(signer) as ethers.Contract;
    this._keyManager = this._keyManager.connect(signer) as ethers.Contract;
    this._schemaRegistry = this._schemaRegistry.connect(signer) as ethers.Contract;
    if (this._identityRegistry) {
      this._identityRegistry = this._identityRegistry.connect(signer) as ethers.Contract;
    }
    if (this._escrow) {
      this._escrow = this._escrow.connect(signer) as ethers.Contract;
    }
  }

  private requireSigner(): ethers.Signer {
    if (!this._signer) {
      throw new Error('Signer required. Pass privateKey in constructor or call connectSigner().');
    }
    return this._signer;
  }

  private requireAddress(): string {
    if (!this._address) {
      throw new Error('Signer required. Pass privateKey in constructor or call connectSigner().');
    }
    return this._address;
  }

  private async _wrapRpcError<T>(fn: () => Promise<T>, method: string): Promise<T> {
    try {
      return await withRetry(fn);
    } catch (err) {
      if (err instanceof Error) {
        const hint = classifyRpcError(err, { method, chainName: this.chainName });
        if (hint) throw new Error(hint, { cause: err });
      }
      throw err;
    }
  }

  get address(): string | null {
    return this._address;
  }

  // ===== MESSAGING =====

  /**
   * Send an encrypted message to a topic.
   * Automatically determines encryption key based on topic access level.
   */
  async sendMessage(topicId: number, text: string, options?: SendOptions): Promise<ethers.TransactionResponse> {
    this.requireSigner();

    // Auto-check: refuse to reply to a message whose escrow deposit was refunded
    if (options?.replyTo && this.escrow && !options?.skipRefundCheck) {
      const refunded = await this.isMessageRefunded(options.replyTo);
      if (refunded) {
        throw new Error(`Cannot reply: escrow deposit was refunded (tx: ${options.replyTo})`);
      }
    }

    let replyText = options?.replyText;
    let replyAuthor = options?.replyAuthor;

    // Auto-resolve reply metadata if replyTo is set but text/author aren't
    if (options?.replyTo && (!replyText || !replyAuthor)) {
      try {
        const messages = await this.readMessages(topicId, { limit: 50 });
        const original = messages.find(m => m.txHash === options.replyTo);
        if (original) {
          replyText = replyText || original.text.slice(0, 100);
          replyAuthor = replyAuthor || original.sender;
        }
      } catch {
        // Non-fatal: reply will still work, just without cached text/author
      }
    }

    const key = await this.getEncryptionKey(topicId);
    const encrypted = encryptMessage(text, key, {
      replyTo: options?.replyTo,
      replyText,
      replyAuthor,
      mentions: options?.mentions,
    });

    return this.registry.sendMessage(topicId, ethers.toUtf8Bytes(encrypted));
  }

  /**
   * Read and decrypt recent messages from a topic.
   */
  async readMessages(topicId: number, options?: ReadOptions): Promise<Message[]> {
    const limit = options?.limit ?? 50;
    const key = await this.getEncryptionKey(topicId);
    const filter = this.registry.filters.MessageSent(topicId);

    // Chunked log fetching to stay within RPC limits (e.g. Avalanche 2048 block cap)
    const CHUNK_SIZE = 2000;
    const currentBlock = await this.provider.getBlockNumber();
    const chain = CHAINS[this.chainName];
    const maxRange = options?.fromBlock != null ? currentBlock - options.fromBlock : chain.defaultLookback;
    const startBlock = currentBlock - maxRange;

    const allEvents: ethers.EventLog[] = [];
    let toBlock = currentBlock;

    while (toBlock > startBlock && allEvents.length < limit) {
      const chunkFrom = Math.max(toBlock - CHUNK_SIZE + 1, startBlock);
      const events = await this._wrapRpcError(
        () => this.registry.queryFilter(filter, chunkFrom, toBlock),
        'readMessages',
      );
      // Prepend since we're walking backwards
      allEvents.unshift(...(events as ethers.EventLog[]));
      toBlock = chunkFrom - 1;
    }

    const recent = allEvents.slice(-limit);
    const messages: Message[] = [];

    for (const log of recent) {
      const payloadStr = ethers.toUtf8String(log.args.payload);
      const parsed = decryptMessage(payloadStr, key);

      messages.push({
        topicId,
        sender: log.args.sender,
        text: parsed?.text ?? '[decryption failed]',
        replyTo: parsed?.replyTo ?? null,
        mentions: parsed?.mentions ?? null,
        timestamp: Number(log.args.timestamp),
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
        topicId: Number(tId),
        sender,
        text: parsed?.text ?? '[decryption failed]',
        replyTo: parsed?.replyTo ?? null,
        mentions: parsed?.mentions ?? null,
        timestamp: Number(timestamp),
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
    this.requireSigner();
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
    this.requireSigner();
    return this.registry.clearNickname(appId);
  }

  async setNicknameCooldown(appId: number, cooldownSeconds: number): Promise<ethers.TransactionResponse> {
    this.requireSigner();
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
    this.requireSigner();
    return this.registry.createTopic(appId, name, description, accessLevel);
  }

  async getTopic(topicId: number): Promise<Topic> {
    return this._wrapRpcError(async () => {
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
    }, 'getTopic');
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
    this.requireSigner();
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
    this.requireSigner();
    return this.registry.addMember(appId, address, nickname, roles);
  }

  async removeMember(appId: number, address: string): Promise<ethers.TransactionResponse> {
    this.requireSigner();
    return this.registry.removeMember(appId, address);
  }

  async updateMemberRoles(
    appId: number,
    address: string,
    roles: number
  ): Promise<ethers.TransactionResponse> {
    this.requireSigner();
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
    this.requireSigner();
    return this.registry.createApplication(name, description, frontendUrl, allowPublicTopicCreation);
  }

  async getApplicationCount(): Promise<number> {
    const count = await this.registry.applicationCount();
    return Number(count);
  }

  async updateFrontendUrl(appId: number, frontendUrl: string): Promise<ethers.TransactionResponse> {
    this.requireSigner();
    return this.registry.updateApplicationFrontendUrl(appId, frontendUrl);
  }

  async getApplication(appId: number): Promise<Application> {
    return this._wrapRpcError(async () => {
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
    }, 'getApplication');
  }

  // ===== FEES =====

  async getTopicMessageFee(topicId: number): Promise<TopicMessageFee> {
    const [token, amount] = await this.registry.getTopicMessageFee(topicId);
    return { token, amount };
  }

  /**
   * Set topic creation fee for an application (app admin only).
   * feeAmount accepts:
   *   - bigint: raw token units (e.g. 150000n for 0.15 USDC)
   *   - string | number: human-readable amount — decimals are auto-resolved from the token contract
   *     (e.g. '0.15' or 0.15 with USDC → 150000n, '0.01' with native ETH → 10000000000000000n)
   */
  async setTopicCreationFee(
    appId: number,
    feeToken: string,
    feeAmount: bigint | string | number
  ): Promise<ethers.TransactionResponse> {
    this.requireSigner();
    const rawAmount = typeof feeAmount === 'bigint'
      ? feeAmount
      : await this.parseTokenAmount(feeToken, feeAmount);
    return this.registry.setTopicCreationFee(appId, feeToken, rawAmount);
  }

  /**
   * Set per-message fee for a topic (topic admin only).
   * feeAmount accepts:
   *   - bigint: raw token units (e.g. 150000n for 0.15 USDC)
   *   - string | number: human-readable amount — decimals are auto-resolved from the token contract
   *     (e.g. '0.15' or 0.15 with USDC → 150000n, '0.01' with native ETH → 10000000000000000n)
   */
  async setTopicMessageFee(
    topicId: number,
    feeToken: string,
    feeAmount: bigint | string | number
  ): Promise<ethers.TransactionResponse> {
    this.requireSigner();
    const rawAmount = typeof feeAmount === 'bigint'
      ? feeAmount
      : await this.parseTokenAmount(feeToken, feeAmount);
    return this.registry.setTopicMessageFee(topicId, feeToken, rawAmount);
  }

  // ===== TOKEN AMOUNTS =====

  /**
   * Get the number of decimals for an ERC-20 token.
   * Returns 18 for native ETH (address(0)).
   * Results are cached per token address.
   */
  async getTokenDecimals(tokenAddress: string): Promise<number> {
    if (tokenAddress === ethers.ZeroAddress) return 18;

    const key = tokenAddress.toLowerCase();
    const cached = this.tokenDecimalsCache.get(key);
    if (cached !== undefined) return cached;

    const erc20 = new ethers.Contract(tokenAddress, Clawntenna.ERC20_DECIMALS_ABI, this.provider);
    const decimals = Number(await erc20.decimals());
    this.tokenDecimalsCache.set(key, decimals);
    return decimals;
  }

  /**
   * Convert a human-readable token amount to raw units (bigint).
   * Looks up the token's on-chain decimals automatically.
   *
   * Examples:
   *   parseTokenAmount('0xUSDC...', '0.15')  → 150000n       (USDC = 6 decimals)
   *   parseTokenAmount('0xUSDC...', 10)       → 10000000n     (USDC = 6 decimals)
   *   parseTokenAmount(ZeroAddress, '0.01')   → 10000000000000000n  (native ETH = 18 decimals)
   */
  async parseTokenAmount(tokenAddress: string, amount: string | number): Promise<bigint> {
    const decimals = await this.getTokenDecimals(tokenAddress);
    return ethers.parseUnits(String(amount), decimals);
  }

  /**
   * Convert raw token units (bigint) to a human-readable string.
   * Looks up the token's on-chain decimals automatically.
   *
   * Examples:
   *   formatTokenAmount('0xUSDC...', 150000n)  → '0.15'
   *   formatTokenAmount(ZeroAddress, 10000000000000000n) → '0.01'
   */
  async formatTokenAmount(tokenAddress: string, amount: bigint): Promise<string> {
    const decimals = await this.getTokenDecimals(tokenAddress);
    return ethers.formatUnits(amount, decimals);
  }

  // ===== ESCROW =====

  private requireEscrow(): ethers.Contract {
    if (!this.escrow) {
      throw new Error('Escrow not available on this chain. Use baseSepolia or pass escrowAddress.');
    }
    return this.escrow;
  }

  /**
   * Enable escrow for a topic (topic owner only).
   */
  async enableEscrow(topicId: number, timeout: number): Promise<ethers.TransactionResponse> {
    this.requireSigner();
    return this.requireEscrow().enableEscrow(topicId, timeout);
  }

  /**
   * Disable escrow for a topic (topic owner only).
   */
  async disableEscrow(topicId: number): Promise<ethers.TransactionResponse> {
    this.requireSigner();
    return this.requireEscrow().disableEscrow(topicId);
  }

  /**
   * Check if escrow is enabled for a topic.
   */
  async isEscrowEnabled(topicId: number): Promise<boolean> {
    return this.requireEscrow().isEscrowEnabled(topicId);
  }

  /**
   * Get escrow config for a topic (enabled + timeout).
   */
  async getEscrowConfig(topicId: number): Promise<EscrowConfig> {
    const escrow = this.requireEscrow();
    const [enabled, timeout] = await Promise.all([
      escrow.isEscrowEnabled(topicId) as Promise<boolean>,
      escrow.topicEscrowTimeout(topicId) as Promise<bigint>,
    ]);
    return { enabled, timeout };
  }

  /**
   * Get full deposit details by ID.
   */
  async getDeposit(depositId: number): Promise<EscrowDeposit> {
    const d = await this.requireEscrow().getDeposit(depositId);
    return {
      id: d.id,
      topicId: d.topicId,
      sender: d.sender,
      recipient: d.recipient,
      token: d.token,
      amount: d.amount,
      appOwner: d.appOwner,
      depositedAt: d.depositedAt,
      timeout: d.timeout,
      status: Number(d.status) as DepositStatus,
    };
  }

  /**
   * Get deposit status (0=Pending, 1=Released, 2=Refunded).
   */
  async getDepositStatus(depositId: number): Promise<DepositStatus> {
    const status = await this.requireEscrow().getDepositStatus(depositId);
    return Number(status) as DepositStatus;
  }

  /**
   * Get pending deposit IDs for a topic.
   */
  async getPendingDeposits(topicId: number): Promise<bigint[]> {
    return this.requireEscrow().getPendingDeposits(topicId);
  }

  /**
   * Check if a deposit can be refunded (timeout expired and still pending).
   */
  async canClaimRefund(depositId: number): Promise<boolean> {
    return this.requireEscrow().canClaimRefund(depositId);
  }

  /**
   * Claim a refund for a single deposit.
   */
  async claimRefund(depositId: number): Promise<ethers.TransactionResponse> {
    this.requireSigner();
    return this.requireEscrow().claimRefund(depositId);
  }

  /**
   * Batch claim refunds for multiple deposits.
   */
  async batchClaimRefunds(depositIds: number[]): Promise<ethers.TransactionResponse> {
    this.requireSigner();
    return this.requireEscrow().batchClaimRefunds(depositIds);
  }

  /**
   * Respond to specific deposits by sending a message and binding it on-chain (topic owner only).
   * This creates an auditable record: "at block X, owner sent message Y for deposits [a, b, c]".
   * Each deposit must have a recorded response before it can be released.
   * @param topicId Topic ID
   * @param payload Message payload (encrypted response)
   * @param depositIds Array of deposit IDs being responded to
   */
  async respondToDeposits(topicId: number, payload: string | Uint8Array, depositIds: number[]): Promise<ethers.TransactionResponse> {
    this.requireSigner();
    return this.registry.respondToDeposits(topicId, payload, depositIds);
  }

  /**
   * Release a single escrow deposit (topic owner only).
   * Requires a prior respondToDeposits() call for this deposit.
   * @param depositId Deposit ID to release
   * @param messageRef Optional off-chain message reference (default 0)
   */
  async releaseDeposit(depositId: number, messageRef: number = 0): Promise<ethers.TransactionResponse> {
    this.requireSigner();
    return this.requireEscrow().releaseDeposit(depositId, messageRef);
  }

  /**
   * Batch release escrow deposits (topic owner only, max 50).
   * Requires a prior respondToDeposits() call for each deposit.
   * @param depositIds Array of deposit IDs to release
   * @param messageRefs Optional array of off-chain references (empty or same length)
   */
  async batchReleaseDeposits(depositIds: number[], messageRefs: number[] = []): Promise<ethers.TransactionResponse> {
    this.requireSigner();
    return this.requireEscrow().batchReleaseDeposits(depositIds, messageRefs);
  }

  /**
   * Get the message reference for a released deposit.
   */
  async getDepositMessageRef(depositId: number): Promise<bigint> {
    return this.requireEscrow().getDepositMessageRef(depositId);
  }

  /**
   * Check if a deposit has a recorded owner response.
   */
  async hasResponse(depositId: number): Promise<boolean> {
    return this.requireEscrow().hasResponse(depositId);
  }

  /**
   * Parse a transaction receipt to extract the depositId from a DepositRecorded event.
   * Returns null if no DepositRecorded event is found (e.g. no escrow on this tx).
   */
  async getMessageDepositId(txHash: string): Promise<bigint | null> {
    if (!this.escrow) return null;

    const receipt = await this.provider.getTransactionReceipt(txHash);
    if (!receipt) return null;

    const iface = this.escrow.interface;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed?.name === 'DepositRecorded') {
          return parsed.args.depositId;
        }
      } catch { /* skip non-matching logs */ }
    }
    return null;
  }

  /**
   * Get the deposit status for a message by its transaction hash.
   * Returns null if the message has no associated escrow deposit.
   */
  async getMessageDepositStatus(txHash: string): Promise<DepositStatus | null> {
    const depositId = await this.getMessageDepositId(txHash);
    if (depositId === null) return null;
    return this.getDepositStatus(Number(depositId));
  }

  /**
   * Check if a message's escrow deposit was refunded.
   * Returns false if no escrow deposit exists for the tx.
   */
  async isMessageRefunded(txHash: string): Promise<boolean> {
    const status = await this.getMessageDepositStatus(txHash);
    return status === DepositStatus.Refunded;
  }

  /**
   * Get timer info for a deposit — remaining time, expiry status, and claimability.
   * Useful for building countdown UIs.
   */
  async getDepositTimer(depositId: number): Promise<DepositTimer> {
    const d = await this.getDeposit(depositId);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const remaining = timeUntilRefund(d.depositedAt, d.timeout, nowSeconds);
    const expired = remaining === 0;
    const canClaim = expired && d.status === DepositStatus.Pending
      ? await this.canClaimRefund(depositId)
      : false;

    return {
      depositId: d.id,
      expired,
      remainingSeconds: remaining,
      deadline: getDepositDeadline(d.depositedAt, d.timeout),
      formattedRemaining: formatTimeout(remaining),
      canClaim,
    };
  }

  // ===== ECDH (Private Topics) =====

  /**
   * Derive ECDH keypair from wallet signature (deterministic).
   * Requires a signer capable of signing messages.
   */
  async deriveECDHFromWallet(appId: number = 1): Promise<{ publicKey: Uint8Array }> {
    this.requireSigner();

    const signer = this._signer!;
    const { privateKey, publicKey } = await deriveKeypairFromSignature(
      this.requireAddress(),
      (msg) => signer.signMessage(msg),
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
    this.requireSigner();
    if (!this.ecdhPublicKey) throw new Error('ECDH key not derived yet');

    const hasKey = await this.keyManager.hasPublicKey(this.requireAddress());
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

    // No grant exists yet (empty bytes) — cannot decrypt
    if (encryptedKey.length === 0 || granterPubKey.length === 0) {
      throw new Error(`No key grant found for topic ${topicId}. The topic key needs to be initialized first.`);
    }

    const topicKey = decryptTopicKey(encryptedKey, this.ecdhPrivateKey, granterPubKey);
    this.topicKeys.set(topicId, topicKey);
    return topicKey;
  }

  /**
   * Initialize a private topic's symmetric key by generating a random key and self-granting.
   * This should be called once by the topic owner after creating a PRIVATE topic.
   * Returns the generated topic key.
   */
  async initializeTopicKey(topicId: number): Promise<Uint8Array> {
    this.requireSigner();
    if (!this.ecdhPrivateKey || !this.ecdhPublicKey) {
      throw new Error('ECDH key not derived yet');
    }

    // Generate random 32-byte topic symmetric key
    const topicKey = randomBytes(32);

    // Encrypt for ourselves (self-grant)
    const encrypted = encryptTopicKeyForUser(topicKey, this.ecdhPrivateKey, this.ecdhPublicKey);

    // Store on-chain as a self-grant
    const tx = await this.keyManager.grantKeyAccess(topicId, this.requireAddress(), encrypted);
    await tx.wait();

    // Cache locally
    this.topicKeys.set(topicId, topicKey);
    return topicKey;
  }

  /**
   * Get the topic key, initializing it if the caller is the topic owner and no grant exists.
   * Tries fetchAndDecryptTopicKey first; if no grant exists and caller is topic owner,
   * auto-initializes with initializeTopicKey.
   */
  async getOrInitializeTopicKey(topicId: number): Promise<Uint8Array> {
    try {
      return await this.fetchAndDecryptTopicKey(topicId);
    } catch (err) {
      const isNoGrant = err instanceof Error && err.message.includes('No key grant found');
      if (!isNoGrant) throw err;

      // Check if we're the topic owner — only owners can initialize
      const topic = await this.getTopic(topicId);
      if (!this._signer || topic.owner.toLowerCase() !== this._address!.toLowerCase()) {
        throw new Error(
          `No key grant found for topic ${topicId}. Ask the topic owner to grant you access with: keys grant ${topicId} ${this._address ?? '<your-address>'}`
        );
      }

      // Auto-initialize as the topic owner
      return this.initializeTopicKey(topicId);
    }
  }

  /**
   * Grant a user access to a private topic's symmetric key.
   */
  async grantKeyAccess(
    topicId: number,
    userAddress: string,
    topicKey: Uint8Array
  ): Promise<ethers.TransactionResponse> {
    this.requireSigner();
    if (!this.ecdhPrivateKey) throw new Error('ECDH key not derived yet');

    const hasKey = await this.keyManager.hasPublicKey(userAddress);
    if (!hasKey) {
      throw new Error(
        `User ${userAddress} has no ECDH public key registered. They must run 'keys register' first.`
      );
    }

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
   * Get members who have registered ECDH keys but haven't been granted access to a private topic.
   * Useful for topic owners to see who's waiting for a key grant.
   */
  async getPendingKeyGrants(topicId: number): Promise<{
    pending: Array<{ address: string; hasPublicKey: boolean }>;
    granted: string[];
  }> {
    const topic = await this.getTopic(topicId);
    const members = await this.getApplicationMembers(Number(topic.applicationId));

    // Filter out zero addresses and deduplicate
    const uniqueMembers = [...new Set(members)].filter(a => a !== ethers.ZeroAddress);

    const pending: Array<{ address: string; hasPublicKey: boolean }> = [];
    const granted: string[] = [];

    await Promise.all(
      uniqueMembers.map(async (addr) => {
        const [hasAccess, hasKey] = await Promise.all([
          this.hasKeyAccess(topicId, addr),
          this.hasPublicKey(addr),
        ]);

        if (hasAccess) {
          granted.push(addr);
        } else {
          pending.push({ address: addr, hasPublicKey: hasKey });
        }
      })
    );

    return { pending, granted };
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
    this.requireSigner();
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
    this.requireSigner();
    return this.keyManager.revokeKeyAccess(topicId, address);
  }

  /**
   * Rotate the key version for a topic. Existing grants become stale.
   */
  async rotateKey(topicId: number): Promise<ethers.TransactionResponse> {
    this.requireSigner();
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
    this.requireSigner();
    return this.schemaRegistry.createAppSchema(appId, name, description, body);
  }

  /**
   * Publish a new version of an existing schema.
   */
  async publishSchemaVersion(
    schemaId: number,
    body: string
  ): Promise<ethers.TransactionResponse> {
    this.requireSigner();
    return this.schemaRegistry.publishSchemaVersion(schemaId, body);
  }

  /**
   * Deactivate a schema.
   */
  async deactivateSchema(schemaId: number): Promise<ethers.TransactionResponse> {
    this.requireSigner();
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
    this.requireSigner();
    return this.schemaRegistry.setTopicSchema(topicId, schemaId, version);
  }

  /**
   * Remove schema binding from a topic.
   */
  async clearTopicSchema(topicId: number): Promise<ethers.TransactionResponse> {
    this.requireSigner();
    return this.schemaRegistry.clearTopicSchema(topicId);
  }

  // ===== AGENT IDENTITY (V5) =====

  /**
   * Register your ERC-8004 agent identity for an application (V5).
   * Verifies ownership via ownerOf on the identity registry.
   */
  async registerAgentIdentity(appId: number, tokenId: number): Promise<ethers.TransactionResponse> {
    this.requireSigner();
    return this.registry.registerAgentIdentity(appId, tokenId);
  }

  /**
   * Clear your agent identity registration for an application (V5).
   */
  async clearAgentIdentity(appId: number): Promise<ethers.TransactionResponse> {
    this.requireSigner();
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
    this.requireSigner();
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
    this.requireSigner();
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
    const addr = address ?? this._address;
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
    this.requireSigner();
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
    this.requireSigner();
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
      // Auto-fetch (or auto-initialize for owner) if ECDH keys are loaded
      if (this.ecdhPrivateKey) {
        return this.getOrInitializeTopicKey(topicId);
      }
      throw new Error(
        `Topic ${topicId} is PRIVATE. Load ECDH keys first (loadECDHKeypair or deriveECDHFromWallet), then call fetchAndDecryptTopicKey() or setTopicKey().`
      );
    }

    // Public or public_limited: derive deterministic key
    return derivePublicTopicKey(topicId);
  }
}
