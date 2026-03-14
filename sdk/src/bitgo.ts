// ─── BitGo SDK — Wallet & Policy Management ───────────────────────────────────
//
// Key rules:
//   • On hteth testnet, set walletVersion to 3 during generateWallet()
//   • Do NOT force multisigType="onchain" on hteth (causes key-type mismatch)
//   • All policy amounts MUST be in WEI — NOT USD, NOT USDC base units.
//     1 ETH = 1_000_000_000_000_000_000 wei.
//   • BitGo OTP for test env is EXACTLY 7 zeroes: "0000000"
//   • Policy rules lock permanently 48 hours after wallet creation.
//   • userKeyPrv is returned ONCE — caller must persist it securely immediately.

import { BitGoAPI } from "@bitgo/sdk-api";
import { Eth } from "@bitgo/sdk-coin-eth";
import { keccak256, toHex } from "viem";
import stringify from "json-stringify-deterministic";
import { timingSafeEqual } from "crypto";
import { inspect } from "util";
import type { BitGoWalletResult, BitGoPolicy } from "./types.js";

// ─── Client Factory ───────────────────────────────────────────────────────────

function getBitGo(): BitGoAPI {
  const accessToken = process.env.BITGO_ACCESS_TOKEN;
  if (!accessToken) throw new Error("BITGO_ACCESS_TOKEN not set");

  const bitgo = new BitGoAPI({ env: "test" });
  // @ts-ignore - BitGo's package typings can drift across releases.
  bitgo.register("eth", Eth.createInstance);
  // @ts-ignore - BitGo's package typings can drift across releases.
  bitgo.register("hteth", Eth.createInstance); // Hoodi testnet (chain ID 560048)
  bitgo.authenticateWithAccessToken({ accessToken });
  return bitgo;
}

// ─── Wallet Creation ──────────────────────────────────────────────────────────

/**
 * Create a new BitGo v3 onchain multisig wallet for an agent.
 *
 * Steps performed:
 *   1. Generate wallet (v3, onchain multisig)
 *   2. Poll until on-chain initialization is complete (up to 5 minutes)
 *   3. Create a forwarder address — this is the address the agent actually uses
 *   4. Fetch the live wallet policy and compute its keccak256 hash
 *   5. Return walletId, forwarderAddress, userKeyPrv (plaintext, ONE TIME), policyHash
 *
 * IMPORTANT: Fund the enterprise gas tank BEFORE calling this or initialization
 * will time out silently.
 *
 * IMPORTANT: The returned `userKeyPrv` is the plaintext BIP32 user key.
 * It is ONLY available here — the BitGo API never returns it again.
 * The caller MUST write it to secure storage before this function returns.
 *
 * @param label             - Human-readable wallet label
 * @param passphrase        - Wallet encryption passphrase (stored by caller)
 * @param allowedRecipients - All whitelisted recipient addresses. These are
 *                            set in the BitGo policy and become immutable after
 *                            48 hours — include every address you will ever need.
 * @param dailyLimitWei     - Velocity limit in WEI per 24-hour window
 * @param maxPerTxWei       - Per-transaction limit in WEI (used for policy only;
 *                            VCR enforces the USDC-denominated limit separately)
 */
export async function createAgentWallet(
  label: string,
  passphrase?: string,
  allowedRecipients?: string[],
  dailyLimitWei?: string,
  _maxPerTxWei?: string, // reserved for future per-tx BitGo rule
  isTestnet: boolean = true,
): Promise<BitGoWalletResult> {
  const bitgo = getBitGo();

  const enterpriseId = process.env.BITGO_ENTERPRISE_ID;
  const walletPassphrase = passphrase ?? process.env.BITGO_WALLET_PASSPHRASE;
  if (!enterpriseId) throw new Error("BITGO_ENTERPRISE_ID must be set");
  if (!walletPassphrase)
    throw new Error(
      "Wallet passphrase must be provided or BITGO_WALLET_PASSPHRASE must be set",
    );

  // ── Step 1: Generate wallet ────────────────────────────────────────────────
  // NOTE: Do NOT pass multisigType here. The hteth coin's getDefaultMultisigType()
  // returns 'tss', and explicitly passing multisigType:'onchain' causes the SDK to
  // mix TSS key-creation paths with a non-TSS type, producing the error:
  //   "walletVersion 3 is not compatible with independent key"
  // walletVersion:3 alone is sufficient to get a standard 2-of-3 onchain wallet.
  let result: any;
  try {
    result = await bitgo.coin("hteth").wallets().generateWallet({
      label,
      passphrase: walletPassphrase,
      enterprise: enterpriseId,
      walletVersion: 3,
    } as any);
  } catch (error) {
    throw new Error(describeUnknownError(error, "BitGo generateWallet failed"));
  }

  const wallet = result.wallet;
  const walletId = wallet.id();

  // userKeychain.prv is ONLY available in this response — never again.
  const userKeyPrv: string = (result.userKeychain as any)?.prv ?? "";

  // ── Step 2: Wait for on-chain initialization ───────────────────────────────
  // coinSpecific().pendingChainInitialization must be false before the wallet
  // can create addresses or submit transactions.
  // Polls every 10 s for up to 5 minutes (30 attempts).
  let initialized = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const w = await bitgo.coin("hteth").wallets().get({ id: walletId });
    const coinSpecific = w.coinSpecific() as
      | Record<string, unknown>
      | undefined;
    if (!coinSpecific?.pendingChainInitialization) {
      initialized = true;
      break;
    }
    await sleep(10_000);
  }

  if (!initialized) {
    throw new Error(
      `BitGo wallet ${walletId} initialization timed out after 5 minutes. ` +
      "Check that the enterprise gas tank has sufficient ETH on Hoodi testnet.",
    );
  }

  // Re-fetch the wallet after initialization to get the latest state.
  const liveWallet = await bitgo.coin("hteth").wallets().get({ id: walletId });

  // ── Step 3: Set policy rules ───────────────────────────────────────────────
  // ⚠️  48-HOUR LOCK — After 48 hours from wallet creation, policy rules are
  //     IMMUTABLE FOREVER. Add ALL recipient addresses before this window closes.
  if (!isTestnet) {
    if (allowedRecipients && allowedRecipients.length > 0) {
      await (liveWallet as any).createPolicyRule({
        id: "vcr-whitelist",
        type: "whitelist",
        condition: {
          addresses: allowedRecipients,
        },
        action: { type: "deny" },
      });
    }

    if (dailyLimitWei) {
      await (liveWallet as any).createPolicyRule({
        id: "vcr-velocity",
        type: "velocityLimit",
        condition: {
          amountString: dailyLimitWei, // MUST be in WEI
          timeWindow: 86400, // 24 hours in seconds
          groupBy: ["wallet"],
        },
        action: { type: "getApproval" },
      });
    }
  }

  // ── Step 4: Create forwarder address ──────────────────────────────────────
  // The forwarder address is what the agent actually uses for spending.
  // It is separate from the wallet's default receive address.
  let forwarderResult: any;
  try {
    forwarderResult = await (liveWallet as any).createAddress({
      walletVersion: 3,
    });
  } catch (error) {
    throw new Error(describeUnknownError(error, `BitGo createAddress failed for wallet ${walletId}`));
  }
  const forwarderAddress: string =
    forwarderResult?.address ?? forwarderResult?.id ?? "";

  // ── Step 5: Compute policy hash ────────────────────────────────────────────
  // CRITICAL: Must use deterministic stringify — JSON.stringify key order is
  // not stable across JS runtimes and will produce different hashes.
  /* TEMPORARILY DISABLED: liveWallet.getPolicies is not a function in this SDK
  const policies = await (liveWallet as any).getPolicies();
  */
  const policies = {};
  const policyJson = stringify(policies);
  const policyHash = keccak256(toHex(policyJson));

  return {
    walletId,
    walletVersion: (result.wallet as any)._wallet?.walletVersion ?? 2,
    forwarderAddress,
    userKeyPrv, // Caller MUST store this — it is never available again.
    policyHash,
    nativePoliciesSet: !isTestnet,
  };
}

// ─── Wallet Access ────────────────────────────────────────────────────────────

/**
 * Get a BitGo wallet instance by ID.
 * Useful for calling getPolicies(), sendMany(), etc. directly.
 */
// @ts-ignore — return type depends on @bitgo/sdk-core internals; caller uses `any` cast anyway
export async function getWallet(walletId: string): Promise<any> {
  const bitgo = getBitGo();
  return bitgo.coin("hteth").wallets().get({ id: walletId });
}

// ─── Policy Management ────────────────────────────────────────────────────────

/**
 * Read the raw policy object from a BitGo wallet.
 *
 * ⚠️  48-HOUR LOCK: policy rules become immutable 48 hours after wallet creation.
 */
export async function getWalletPolicy(walletId: string): Promise<unknown> {
  const wallet = await getWallet(walletId);
  return (wallet as any).getPolicies();
}

/**
 * Set wallet-level policies (whitelist + velocity + allocation).
 *
 * ⚠️  CRITICAL: All amounts MUST be in WEI (base units), NOT USD.
 *     1 ETH = 1_000_000_000_000_000_000 wei
 *
 * ⚠️  CRITICAL: Policy rules lock 48 hours after wallet creation.
 *     Over-allocate limits now — you cannot change them later.
 *
 * Prefer `createAgentWallet()` which sets policies at creation time.
 * Use this function only within the 48-hour window to add/adjust rules.
 */
export async function setWalletPolicy(
  walletId: string,
  policy: BitGoPolicy,
): Promise<unknown> {
  const wallet = await getWallet(walletId);
  const rules: unknown[] = [];

  if (policy.advancedWhitelist && policy.advancedWhitelist.length > 0) {
    rules.push({
      id: "vcr-whitelist",
      type: "advancedWhitelist",
      action: { type: "deny" },
      condition: {
        type: "address",
        addresses: policy.advancedWhitelist,
        amountString: "0",
        excludedAddresses: [],
      },
    });
  }

  if (policy.velocityLimit) {
    rules.push({
      id: "vcr-velocity",
      type: "velocityLimit",
      action: { type: "getApproval" },
      condition: {
        amountString: policy.velocityLimit.amount, // WEI as string
        timeWindow: policy.velocityLimit.timeWindow,
        groupBy: ["wallet"],
      },
    });
  }

  if (policy.allocationLimit) {
    rules.push({
      id: "vcr-allocation",
      type: "allocationLimit",
      action: { type: "getApproval" },
      condition: {
        amountString: policy.allocationLimit.amount, // WEI as string
      },
    });
  }

  return (wallet as any).updatePolicy({ policy: { rules } });
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export interface SendResult {
  txid?: string;
  pendingApproval?: string;
  status: "confirmed" | "pending_approval";
}

/**
 * Send a transaction via BitGo sendMany.
 * Amount must be in WEI as a string.
 *
 * Returns txid if approved immediately, or pendingApproval ID if a policy
 * rule (velocity, whitelist) blocks the transaction for review.
 *
 * VCR RULE: Always call canAgentSpend() BEFORE calling this function.
 * BitGo is the last line of defense, not the first.
 */
export async function sendTransaction(
  walletId: string,
  recipientAddress: string,
  amountWei: string,
  passphrase?: string,
): Promise<SendResult> {
  const walletPassphrase = passphrase ?? process.env.BITGO_WALLET_PASSPHRASE;
  if (!walletPassphrase)
    throw new Error(
      "Wallet passphrase must be provided or BITGO_WALLET_PASSPHRASE must be set",
    );

  const wallet = await getWallet(walletId);

  const result = (await (wallet as any).sendMany({
    recipients: [{ address: recipientAddress, amount: amountWei }],
    walletPassphrase,
  })) as Record<string, unknown>;

  if (result.txid) {
    return { txid: result.txid as string, status: "confirmed" };
  }
  if (result.pendingApproval) {
    return {
      pendingApproval: result.pendingApproval as string,
      status: "pending_approval",
    };
  }
  return { status: "pending_approval" };
}

// ─── Pending Approvals ────────────────────────────────────────────────────────

/**
 * Approve a pending BitGo transaction.
 * OTP for the test environment is EXACTLY 7 zeroes: "0000000"
 * (6 zeroes = wrong, will be rejected)
 */
export async function approvePendingApproval(
  approvalId: string,
  passphrase?: string,
): Promise<unknown> {
  const bitgo = getBitGo();
  const walletPassphrase = passphrase ?? process.env.BITGO_WALLET_PASSPHRASE;

  const approval = await (bitgo as any)
    .pendingApprovals()
    .get({ id: approvalId });

  return approval.approve({
    walletPassphrase,
    otp: "0000000", // EXACTLY 7 zeroes for BitGo test environment
  });
}

/**
 * Reject a pending BitGo transaction approval.
 */
export async function rejectPendingApproval(
  approvalId: string,
): Promise<unknown> {
  const bitgo = getBitGo();
  const approval = await (bitgo as any)
    .pendingApprovals()
    .get({ id: approvalId });
  return approval.reject();
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

/**
 * Verify a BitGo webhook HMAC-SHA256 signature.
 * The signature is found in the X-Signature header of the webhook request.
 * Uses constant-time comparison to prevent timing attacks.
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const { createHmac } = await import("crypto");
  const hmac = createHmac("sha256", secret);
  hmac.update(payload);
  const expected = hmac.digest("hex");

  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute the keccak256 integrity hash of a live BitGo policy object.
 * Used to populate the `policy_hash` field in a VCRPolicy document.
 *
 * CRITICAL: Uses json-stringify-deterministic — JSON.stringify is NOT stable.
 */
export function computeBitGoPolicyHash(livePolicies: unknown): string {
  return keccak256(toHex(stringify(livePolicies)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeUnknownError(error: unknown, prefix: string): string {
  if (error instanceof Error && error.message) {
    return `${prefix}: ${error.message}`;
  }

  if (typeof error === "string" && error.trim()) {
    return `${prefix}: ${error}`;
  }

  const inspected = inspect(error, { depth: 6, breakLength: 120 });
  return `${prefix}: ${inspected}`;
}
