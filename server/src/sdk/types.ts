// ─── VCR Protocol SDK — Core Types ───────────────────────────────────────────

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

export interface PolicyConstraints {
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

export interface PolicyMetadata {
  createdAt: string;       // ISO 8601
  createdBy: string;       // Owner address
  description?: string;
  expiresAt?: string;      // ISO 8601
  /** keccak256 hash of deterministic-serialized BitGo wallet policy — for integrity checks */
  policy_hash?: string;
}

export interface VCRPolicy {
  version: "1.0";
  /**
   * Fully-qualified agent ID: eip155:<chainId>:<registryAddress>:<agentId>
   * Example: eip155:11155111:0x8004A818BFB912233c491871b3d84c89A494BD9e:0
   */
  agentId: string;
  constraints: PolicyConstraints;
  metadata: PolicyMetadata;
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
  /** The aggregated daily spend amount (base units) at time of check */
  dailySpentAtCheck?: string;
}

// ─── ERC-8004 Agent ───────────────────────────────────────────────────────────

export interface AgentService {
  type: string;
  endpoint: string;
}

export interface AgentMetadata {
  type: "autonomous-agent";
  name: string;
  description?: string;
  image?: string;
  registrations?: Array<{
    chain: string;
    registry: string;
    agentId: number;
  }>;
  services?: AgentService[];
  x402Support?: {
    enabled: boolean;
    supportedTokens: string[];
    supportedChains: string[];
  };
  active: boolean;
  supportedTrust?: string[];
}

// ─── BitGo ────────────────────────────────────────────────────────────────────

export interface BitGoWalletResult {
  walletId: string;
  receiveAddress: string;
  userKeyEncrypted: string;
  pendingChainInitialization: boolean;
}

export interface BitGoPolicy {
  advancedWhitelist?: string[];
  velocityLimit?: {
    amount: string; // wei
    timeWindow: number; // seconds
  };
  allocationLimit?: {
    amount: string; // wei
  };
}

// ─── x402 ─────────────────────────────────────────────────────────────────────

export interface X402PaymentRequirement {
  price: string;         // base units
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

// ─── ENS ─────────────────────────────────────────────────────────────────────

export interface ENSSetResult {
  txHash: string;
  ensName: string;
  key: string;
  value: string;
}
