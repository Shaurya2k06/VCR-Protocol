// ─── VCR Protocol SDK — Core Types ───────────────────────────────────────────

// ─── Policy Schema ────────────────────────────────────────────────────────────

export interface TimeRestrictions {
  timezone: "UTC";
  /** [startHour, endHour] in UTC, e.g. [9, 17] means 09:00–17:00 UTC */
  allowedHours: [number, number];
}

export interface TokenAmount {
  /** Amount in base units as string (USDC uses 6 decimals) */
  amount: string;
  token: string;
  chain: string;
}

/** @alias PolicyConstraints — spec name */
export interface VCRConstraints {
  /** Maximum per-transaction amount */
  maxTransaction: TokenAmount;
  /** Maximum cumulative spend in a rolling 24-hour window */
  dailyLimit: TokenAmount;
  /** Whitelisted recipient addresses (checksummed) */
  allowedRecipients: string[];
  /** Allowed token symbols, e.g. ["USDC", "USDT"] */
  allowedTokens: string[];
  /** Allowed chain identifiers, e.g. ["base", "base-sepolia"] */
  allowedChains: string[];
  /** Optional time-of-day restriction */
  timeRestrictions?: TimeRestrictions;
}

/** Alias kept for backward compatibility */
export type PolicyConstraints = VCRConstraints;

export interface PolicyMetadata {
  createdAt: string; // ISO 8601
  createdBy: string; // Owner EOA address
  description?: string;
  expiresAt?: string; // ISO 8601
}

export interface VCRPolicy {
  version: "1.0";
  /**
   * Fully-qualified agent ID: eip155:<chainId>:<registryAddress>:<agentId>
   * Example: "eip155:11155111:0x8004A818BFB912233c491871b3d84c89A494BD9e:0"
   */
  agentId: string;
  constraints: VCRConstraints;
  metadata: PolicyMetadata;

  // ── VCR extension fields (populated by createAgent) ──────────────────────
  /** ENS name of this agent, e.g. "researcher-001.acmecorp.eth" */
  ensName?: string;
  /** BitGo forwarder address — the address the agent actually spends from */
  walletAddress?: string;
  /** Custody provider — "bitgo" */
  custodian?: string;
  /** BitGo coin/network identifier — "hteth" (Hoodi testnet) | "ethereum" */
  network?: string;
  /**
   * keccak256 of deterministic-serialized live BitGo wallet policy.
   * Set at wallet creation time; used for integrity verification.
   */
  policy_hash?: string;
  /**
   * This document's own IPFS CID (set after pinning).
   * Allows self-referential verification.
   */
  ipfs_cid?: string;
  /**
   * Specifies which enforcement layers are active
   */
  enforcement?: {
    vcr_layer: boolean;
    bitgo_native_policies: boolean;
    reason?: string;
  };
}

// ─── Spend Verification ───────────────────────────────────────────────────────

export interface SpendRequest {
  /** Amount in base units as string */
  amount: string;
  /** Token symbol, e.g. "USDC" */
  token: string;
  /** Recipient address (checksummed) */
  recipient: string;
  /** Chain identifier, e.g. "base-sepolia" */
  chain: string;
}

export interface SpendResult {
  allowed: boolean;
  reason?: string;
  policy?: VCRPolicy;
  /** CID of the policy document (if fetched) */
  policyCid?: string;
  /** The aggregated daily spend amount (base units) at time of check */
  dailySpentAtCheck?: string;
}

// ─── Spend Tracking ───────────────────────────────────────────────────────────

export interface SpendSummary {
  /** Cumulative spend today (base units) */
  dailySpent: string;
  /** Policy daily limit (base units) */
  dailyLimit: string;
  /** Remaining spend available today (base units) */
  remainingToday: string;
  /** Percentage of daily limit consumed (0–100) */
  percentUsed: number;
  /** ISO 8601 timestamp when the daily window resets (next UTC midnight) */
  resetsAt: string;
  lastTransaction?: {
    amount: string;
    recipient: string;
    timestamp: string;
  };
}

// ─── Agent Lifecycle ──────────────────────────────────────────────────────────

export interface CreateAgentConfig {
  /** Used to derive the ENS name: "${name}.${baseDomain}" */
  name: string;
  /** e.g. "acmecorp.eth" — must be owned by the PRIVATE_KEY EOA */
  baseDomain: string;
  /** Maximum per-transaction amount in USDC (human-readable), e.g. "500" */
  maxPerTxUsdc: string;
  /** Maximum daily cumulative amount in USDC (human-readable), e.g. "5000" */
  dailyLimitUsdc: string;
  /**
   * All allowed recipient addresses — must be final before 48h lock.
   * BitGo policies are immutable after 48 hours.
   */
  allowedRecipients: string[];
  /** Default: ["USDC"] */
  allowedTokens?: string[];
  /** Default: ["base-sepolia"] */
  allowedChains?: string[];
  /** UTC hours window [start, end], e.g. [9, 17] = 9 am–5 pm UTC */
  allowedHours?: [number, number];
  description?: string;
}

export interface AgentRecord {
  /** "researcher-001.acmecorp.eth" */
  ensName: string;
  /** BitGo wallet ID */
  walletId: string;
  /** BitGo forwarder address (the address the agent actually uses) */
  walletAddress: string;
  /**
   * Address linked on ERC-8004 via setAgentWallet (may be BitGo baseAddress
   * for TSS wallets where forwarders cannot produce ECDSA signatures).
   */
  registryWalletAddress?: string;
  /** ERC-8004 agentId (starts from 0) */
  agentId: number;
  /** IPFS CID of the final VCR policy document */
  policyCid: string;
  /** ipfs:// URI of the final VCR policy document */
  policyUri: string;
  /** Explorer-friendly HTTP gateway URL for the final VCR policy document */
  policyGatewayUrl?: string;
  /** Fileverse file identifier for the stored policy document */
  policyFileId?: string;
  /** Fileverse portal address that manages the policy document */
  policyPortalAddress?: string;
  /** Fileverse namespace used to provision agent storage */
  policyNamespace?: string;
  /** True if BitGo returned the one-time plaintext user key during creation */
  bitgoUserKeyCaptured?: boolean;
  /** keccak256 of the live BitGo wallet policy at creation time */
  policyHash: string;
  /** ERC-8004 registration transaction hash */
  registrationTx: string;
  /** ENS text records transaction hash */
  ensTx: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
}

// ─── ENSIP-25 ────────────────────────────────────────────────────────────────

export interface ENSAgentLink {
  ensName: string;
  agentId: number;
  registryAddress: string;
  chainId: number;
}

export interface LinkVerificationResult {
  valid: boolean;
  reason?: string;
  /** The raw ENSIP-25 text record value (should be "1") */
  ensRecord?: string;
  /** Address that owns agentId on the ERC-8004 registry */
  registryOwner?: string;
  /** Address that the ENS name resolves to */
  ensOwner?: string;
}

// ─── ERC-8004 Agent ───────────────────────────────────────────────────────────

export interface AgentService {
  name: string;
  endpoint: string;
  version?: string;
}

export interface AgentMetadata {
  /** Must be the official ERC-8004 registration type URI */
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
  name: string;
  description?: string;
  image?: string;
  /** Each entry links back to on-chain identity via agentRegistry = "{namespace}:{chainId}:{registryAddress}" */
  registrations?: Array<{
    agentRegistry: string;
    agentId: number;
  }>;
  services?: AgentService[];
  x402Support?: boolean;
  active: boolean;
  supportedTrust?: string[];
}

// ─── BitGo ────────────────────────────────────────────────────────────────────

export interface BitGoConfig {
  accessToken: string;
  enterpriseId: string;
  env: "test" | "prod";
}

export interface BitGoWalletResult {
  /** BitGo internal wallet identifier */
  walletId: string;
  /**
   * Forwarder address created for this wallet — the address the agent
   * actually uses for spending. Created via wallet.createAddress().
   */
  forwarderAddress: string;
  /**
   * Plaintext user key private key (BIP32).
   * ONLY returned once — caller MUST persist this securely before function returns.
   */
  userKeyPrv: string;
  /** keccak256 of deterministic-serialized live BitGo wallet policy */
  policyHash: string;
  /** The version of the wallet created (e.g. 2 or 3) */
  walletVersion: number;
  /** Whether native BitGo policies were successfully set (usually false on testnets) */
  nativePoliciesSet: boolean;
}

export interface BitGoPolicy {
  advancedWhitelist?: string[];
  velocityLimit?: {
    /** Amount in WEI as string — NOT USD, NOT USDC base units */
    amount: string;
    timeWindow: number; // seconds
  };
  allocationLimit?: {
    /** Amount in WEI as string */
    amount: string;
  };
}

// ─── Policy Integrity ─────────────────────────────────────────────────────────

export interface IntegrityResult {
  /** True if live BitGo policy hash matches the on-chain commitment */
  match: boolean;
  /** Hash stored in the VCR policy document (from IPFS) */
  onChainHash: string;
  /** Hash freshly computed from the live BitGo wallet.getPolicies() response */
  liveHash: string;
  /** Fields that differ (if match = false) */
  driftedFields?: string[];
}

// ─── x402 ─────────────────────────────────────────────────────────────────────

export interface X402PaymentRequirement {
  price: string; // base units
  token: string;
  network: string;
  recipient: string;
  facilitator: string;
}

// ─── IPFS / Pinata ────────────────────────────────────────────────────────────

export interface PinResult {
  cid: string;
  ipfsUri: string; // ipfs://<cid>
}

export interface FileversePolicyResult {
  fileId: string;
  portalAddress: string;
  namespace: string;
  contentUri: string;
  metadataUri: string;
  txHash: string;
}

// ─── ENS ─────────────────────────────────────────────────────────────────────

export interface ENSSetResult {
  txHash: string;
  ensName: string;
  key: string;
  value: string;
}
