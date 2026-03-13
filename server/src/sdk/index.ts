// ─── VCR Protocol SDK — Public API ────────────────────────────────────────────
// Import this module to use the full VCR SDK.

// Core types
export type {
  VCRPolicy,
  PolicyConstraints,
  PolicyMetadata,
  TimeRestrictions,
  TokenAmount,
  SpendRequest,
  SpendResult,
  AgentMetadata,
  AgentService,
  BitGoWalletResult,
  BitGoPolicy,
  X402PaymentRequirement,
  PinResult,
  ENSSetResult,
} from "./types.js";

// Policy management
export {
  createPolicy,
  validatePolicy,
  pinPolicy,
  fetchPolicy,
  serializePolicy,
  computePolicyHash,
} from "./policy.js";

// ENS integration
export {
  ENS_ADDRESSES,
  ERC8004_REGISTRY_SEPOLIA,
  encodeERC7930,
  buildAgentRegistrationKey,
  setVCRPolicyRecord,
  setAgentRegistrationRecord,
  setAllENSRecords,
  getVCRPolicyUri,
  getAgentRegistrationRecord,
  verifyAgentENSLink,
} from "./ens.js";

// Core verifier
export {
  canAgentSpend,
  canAgentSpendWithPolicy,
} from "./verifier.js";
export type { DailySpentGetter } from "./verifier.js";

// ERC-8004
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

// BitGo
export {
  createAgentWallet,
  getWallet,
  getWalletPolicy,
  setWalletPolicy,
  sendTransaction,
  approvePendingApproval,
  rejectPendingApproval,
  verifyWebhookSignature,
} from "./bitgo.js";
export type { SendResult } from "./bitgo.js";

// x402
export {
  X402_HEADERS,
  X402_FACILITATOR,
  vcrPaymentMiddleware,
  parsePaymentRequired,
  buildEIP3009TypedData,
} from "./x402.js";
export type { VCRPaymentOptions, VCRClientOptions } from "./x402.js";

// VCRPolicyRegistry (on-chain)
export {
  setPolicyOnChain,
  revokePolicyOnChain,
  getPolicyOnChain,
  verifyPolicyOnChain,
  getTotalPoliciesOnChain,
  getPolicyHistoryCount,
} from "./contract.js";
export type { SetPolicyOnChainResult, OnChainPolicyRecord } from "./contract.js";

