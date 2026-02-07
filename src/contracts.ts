export const REGISTRY_ABI = [
  // ===== READ FUNCTIONS =====

  // Applications
  'function applications(uint256) view returns (uint256 id, string name, string description, string frontendUrl, address owner, uint64 createdAt, uint32 memberCount, uint32 topicCount, bool active, bool allowPublicTopicCreation)',
  'function getApplication(uint256 appId) view returns (tuple(uint256 id, string name, string description, string frontendUrl, address owner, uint64 createdAt, uint32 memberCount, uint32 topicCount, bool active, bool allowPublicTopicCreation, address topicCreationFeeToken, uint256 topicCreationFeeAmount))',
  'function applicationCount() view returns (uint256)',
  'function applicationNames(string) view returns (uint256)',

  // Topics
  'function topics(uint256) view returns (uint256 id, uint256 applicationId, string name, string description, address owner, address creator, uint64 createdAt, uint64 lastMessageAt, uint256 messageCount, uint8 accessLevel, bool active)',
  'function getTopic(uint256 topicId) view returns (tuple(uint256 id, uint256 applicationId, string name, string description, address owner, address creator, uint64 createdAt, uint64 lastMessageAt, uint256 messageCount, uint8 accessLevel, bool active))',
  'function topicCount() view returns (uint256)',
  'function getApplicationTopics(uint256 appId) view returns (uint256[])',

  // Members
  'function members(uint256 appId, address user) view returns (address account, string nickname, uint8 roles, uint64 joinedAt)',
  'function getMember(uint256 appId, address account) view returns (tuple(address account, string nickname, uint8 roles, uint64 joinedAt))',
  'function isMember(uint256 appId, address account) view returns (bool)',
  'function getApplicationMembers(uint256 appId) view returns (address[])',

  // Permissions
  'function canReadTopic(uint256 topicId, address user) view returns (bool)',
  'function canWriteToTopic(uint256 topicId, address user) view returns (bool)',
  'function getTopicPermission(uint256 topicId, address user) view returns (uint8)',
  'function topicPermissions(uint256, address) view returns (uint8)',

  // Nicknames
  'function getNickname(uint256 appId, address user) view returns (string)',
  'function hasNickname(uint256 appId, address user) view returns (bool)',
  'function canChangeNickname(uint256 appId, address user) view returns (bool canChange, uint256 timeRemaining)',
  'function appNicknameCooldown(uint256 appId) view returns (uint256)',

  // Fees
  'function getTopicMessageFee(uint256 topicId) view returns (address token, uint256 amount)',

  // ===== WRITE FUNCTIONS =====

  // Applications
  'function createApplication(string name, string description, string frontendUrl, bool allowPublicTopicCreation) returns (uint256)',
  'function updateApplicationFrontendUrl(uint256 appId, string frontendUrl)',

  // Topics
  'function createTopic(uint256 appId, string name, string description, uint8 accessLevel) returns (uint256)',
  'function setTopicPermission(uint256 topicId, address user, uint8 permission)',

  // Members
  'function addMember(uint256 appId, address member, string nickname, uint8 roles)',
  'function removeMember(uint256 appId, address member)',
  'function updateMemberRoles(uint256 appId, address member, uint8 roles)',
  'function updateMemberNickname(uint256 appId, string nickname)',

  // Nicknames (V3)
  'function setNickname(uint256 appId, string nickname)',
  'function clearNickname(uint256 appId)',
  'function setNicknameCooldown(uint256 appId, uint256 cooldownSeconds)',

  // Messaging
  'function sendMessage(uint256 topicId, bytes payload)',

  // Fees
  'function setTopicCreationFee(uint256 appId, address feeTokenAddr, uint256 feeAmount)',
  'function setTopicMessageFee(uint256 topicId, address feeTokenAddr, uint256 feeAmount)',

  // ===== EVENTS =====
  'event ApplicationCreated(uint256 indexed applicationId, string name, address indexed owner)',
  'event TopicCreated(uint256 indexed topicId, uint256 indexed applicationId, string name, address indexed creator, uint8 accessLevel)',
  'event MemberAdded(uint256 indexed applicationId, address indexed member, string nickname, uint8 roles)',
  'event MemberRemoved(uint256 indexed applicationId, address indexed member)',
  'event MemberRolesUpdated(uint256 indexed applicationId, address indexed member, uint8 roles)',
  'event NicknameUpdated(uint256 indexed applicationId, address indexed member, string nickname)',
  'event UserNicknameSet(uint256 indexed applicationId, address indexed user, string nickname)',
  'event TopicPermissionSet(uint256 indexed topicId, address indexed user, uint8 permission)',
  'event MessageSent(uint256 indexed topicId, address indexed sender, bytes payload, uint256 timestamp)',
  'event TopicMessageFeeUpdated(uint256 indexed topicId, address token, uint256 amount)',

  // Agent identity (V5)
  'function registerAgentIdentity(uint256 appId, uint256 tokenId)',
  'function clearAgentIdentity(uint256 appId)',
  'function getAgentTokenId(uint256 appId, address user) view returns (uint256)',
  'function hasAgentIdentity(uint256 appId, address user) view returns (bool)',
  'event AgentIdentityRegistered(uint256 indexed applicationId, address indexed user, uint256 tokenId)',
  'event AgentIdentityCleared(uint256 indexed applicationId, address indexed user)',

  // Data export
  'function exportMemberData(uint256 appId, address user) view returns (bytes)',
  'function exportApplicationData(uint256 appId) view returns (bytes)',
] as const;

export const SCHEMA_REGISTRY_ABI = [
  // ===== READ FUNCTIONS =====

  // Schema queries
  'function schemaCount() view returns (uint256)',
  'function getSchema(uint256 schemaId) view returns (uint256 id, string name, string description, address creator, uint64 createdAt, uint256 versionCount, bool active)',
  'function getSchemaWithApp(uint256 schemaId) view returns (uint256 id, string name, string description, address creator, uint64 createdAt, uint256 versionCount, bool active, uint256 applicationId)',
  'function getSchemaBody(uint256 schemaId, uint256 version) view returns (string)',
  'function getSchemaVersion(uint256 schemaId, uint256 version) view returns (string body, uint64 publishedAt)',
  'function schemaApplicationId(uint256 schemaId) view returns (uint256)',

  // App-scoped queries (V2)
  'function getApplicationSchemas(uint256 applicationId) view returns (uint256[])',
  'function getApplicationSchemaCount(uint256 applicationId) view returns (uint256)',

  // Topic binding
  'function getTopicSchema(uint256 topicId) view returns (uint256 schemaId, uint256 version, string body)',

  // Version
  'function contractVersion() view returns (string)',

  // ===== WRITE FUNCTIONS =====

  // Schema creation (V2 app-scoped)
  'function createAppSchema(uint256 applicationId, string name, string description, string body) returns (uint256)',
  'function publishSchemaVersion(uint256 schemaId, string body) returns (uint256)',
  'function deactivateSchema(uint256 schemaId)',

  // Topic binding
  'function setTopicSchema(uint256 topicId, uint256 schemaId, uint256 version)',
  'function clearTopicSchema(uint256 topicId)',

  // ===== EVENTS =====
  'event AppSchemaCreated(uint256 indexed schemaId, uint256 indexed applicationId, string name, address indexed creator)',
  'event SchemaVersionPublished(uint256 indexed schemaId, uint256 version)',
  'event SchemaDeactivated(uint256 indexed schemaId)',
  'event TopicSchemaSet(uint256 indexed topicId, uint256 indexed schemaId, uint256 version)',
  'event TopicSchemaCleared(uint256 indexed topicId)',
  'event SchemaAssignedToApp(uint256 indexed schemaId, uint256 indexed applicationId)',
] as const;

export const IDENTITY_REGISTRY_ABI = [
  'function register() returns (uint256)',
  'function register(string agentURI) returns (uint256)',
  'function register(string agentURI, tuple(string metadataKey, bytes metadataValue)[] metadata) returns (uint256)',
  'function getMetadata(uint256 agentId, string metadataKey) view returns (bytes)',
  'function setMetadata(uint256 agentId, string metadataKey, bytes metadataValue)',
  'function setAgentURI(uint256 agentId, string newURI)',
  'function getAgentWallet(uint256 agentId) view returns (address)',
  'function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature)',
  'function unsetAgentWallet(uint256 agentId)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function isAuthorizedOrOwner(address spender, uint256 agentId) view returns (bool)',
  'function getVersion() pure returns (string)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
] as const;

export const KEY_MANAGER_ABI = [
  // ===== READ FUNCTIONS =====
  'function hasPublicKey(address user) view returns (bool)',
  'function getPublicKey(address user) view returns (bytes)',
  'function publicKeys(address) view returns (bytes)',
  'function hasKeyAccess(uint256 topicId, address user) view returns (bool)',
  'function getMyKey(uint256 topicId) view returns (bytes encryptedKey, bytes granterPublicKey, address granter, uint256 keyVersion, uint256 currentVersion)',
  'function getKeyGrant(uint256 topicId, address user) view returns (tuple(bytes encryptedKey, bytes granterPublicKey, address granter, uint256 keyVersion, uint64 grantedAt))',
  'function keyVersions(uint256 topicId) view returns (uint256)',

  // ===== WRITE FUNCTIONS =====
  'function registerPublicKey(bytes publicKey)',
  'function grantKeyAccess(uint256 topicId, address user, bytes encryptedKey)',
  'function batchGrantKeyAccess(uint256 topicId, address[] users, bytes[] encryptedKeys)',
  'function revokeKeyAccess(uint256 topicId, address user)',
  'function rotateKey(uint256 topicId)',

  // Data export
  'function exportUserData(address user, uint256[] topicIds) view returns (bytes)',

  // ===== EVENTS =====
  'event PublicKeyRegistered(address indexed user, bytes publicKey)',
  'event PublicKeyUpdated(address indexed user, bytes publicKey)',
  'event KeyAccessGranted(uint256 indexed topicId, address indexed user, address indexed granter, uint256 version)',
  'event KeyAccessRevoked(uint256 indexed topicId, address indexed user)',
  'event KeyRotated(uint256 indexed topicId, uint256 newVersion)',
] as const;
