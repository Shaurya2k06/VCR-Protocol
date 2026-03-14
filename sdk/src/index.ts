// ─── VCR Protocol SDK — Public API ────────────────────────────────────────────
// Single entry point for the vcr-protocol SDK.
// Import from here for the full public API surface.

// ─── Core Types ───────────────────────────────────────────────────────────────

export type {
  // Policy
  VCRPolicy,
  VCRConstraints,
  PolicyConstraints, // alias for backward compatibility
  PolicyMetadata,
  TimeRestrictions,
  TokenAmount,
  // Spend verification
  SpendRequest,
  SpendResult,
  SpendSummary,
  // Agent lifecycle
  CreateAgentConfig,
  AgentRecord,
  // ENSIP-25
  ENSAgentLink,
  LinkVerificationResult,
  // BitGo
  BitGoConfig,
  BitGoWalletResult,
  BitGoPolicy,
  // Integrity
  IntegrityResult,
  // ERC-8004
  AgentMetadata,
  AgentService,
  // x402
  X402PaymentRequirement,
  // IPFS
  PinResult,
  FileversePolicyResult,
  // ENS
  ENSSetResult,
} from "./types.js";

// ─── Constants ────────────────────────────────────────────────────────────────

export { CONTRACTS, CHAIN_IDS } from "./constants.js";
export type { NetworkName, ChainName } from "./constants.js";

// ─── Policy Management ────────────────────────────────────────────────────────

export {
  createPolicy,
  validatePolicy,
  pinPolicy,
  fetchPolicy,
  extractPolicyCid,
  serializePolicy,
  computePolicyHash,
} from "./policy.js";

// ─── Policy Resolution (ENS → IPFS, with cache) ───────────────────────────────

export {
  resolveAgentPolicy,
  invalidatePolicyCache,
  clearPolicyCache,
  getPolicyCacheEntry,
} from "./resolvePolicy.js";

// ─── Spend Tracker ────────────────────────────────────────────────────────────

export {
  getDailySpent,
  recordSpend,
  getSpendSummary,
  resetDailySpend,
  clearAllSpendData,
} from "./spendTracker.js";

// ─── Core Verifier ────────────────────────────────────────────────────────────

export { canAgentSpend, canAgentSpendWithPolicy } from "./verifier.js";
export type { DailySpentGetter } from "./verifier.js";

// ─── Policy Integrity ─────────────────────────────────────────────────────────

export { verifyPolicyIntegrity } from "./verifyIntegrity.js";

// ─── Agent Lifecycle ──────────────────────────────────────────────────────────

export { createAgent } from "./createAgent.js";
export {
  buildPolicyNamespace,
  storePolicyDocument,
} from "./fileverse.js";

// ─── ENS Integration ──────────────────────────────────────────────────────────

export {
  ENS_ADDRESSES,
  ERC8004_REGISTRY_SEPOLIA,
  encodeERC7930,
  buildAgentRegistrationKey,
  buildPolicyGatewayUrl,
  setVCRPolicyRecord,
  setAgentRegistrationRecord,
  setAllENSRecords,
  getVCRPolicyUri,
  getVCRPolicyContenthashUri,
  getLegacyVCRPolicyText,
  getAgentRegistrationRecord,
  verifyAgentENSLink,
} from "./ens.js";

// ─── ERC-8004 ─────────────────────────────────────────────────────────────────

export {
  ERC8004_ADDRESSES,
  registerAgent,
  waitForAgentRegistration,
  getAgentOwner,
  setAgentMetadata,
  setAgentWallet,
  getAgentReputation,
  buildAgentMetadataJson,
} from "./erc8004.js";
export type { RegistrationResult, ReputationSummary } from "./erc8004.js";

// ─── BitGo ────────────────────────────────────────────────────────────────────

export {
  createAgentWallet,
  getWallet,
  getWalletPolicy,
  setWalletPolicy,
  sendTransaction,
  approvePendingApproval,
  rejectPendingApproval,
  verifyWebhookSignature,
  computeBitGoPolicyHash, // also re-exported from verifyIntegrity.ts under same name
} from "./bitgo.js";
export type { SendResult } from "./bitgo.js";

// ─── IPFS / Pinata ────────────────────────────────────────────────────────────

// ─── x402 ─────────────────────────────────────────────────────────────────────

export {
  X402_HEADERS,
  X402_FACILITATOR,
  vcrPaymentMiddleware,
  parsePaymentRequired,
  buildEIP3009TypedData,
} from "./x402.js";
export type { VCRPaymentOptions, VCRClientOptions } from "./x402.js";

// ─── On-Chain VCRPolicyRegistry ───────────────────────────────────────────────

export {
  setPolicyOnChain,
  revokePolicyOnChain,
  getPolicyOnChain,
  verifyPolicyOnChain,
  getTotalPoliciesOnChain,
  getPolicyHistoryCount,
} from "./contract.js";
export type {
  SetPolicyOnChainResult,
  OnChainPolicyRecord,
} from "./contract.js";
