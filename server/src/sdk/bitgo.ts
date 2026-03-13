// ─── BitGo SDK — Wallet & Policy Management ───────────────────────────────────
import { BitGoAPI } from "@bitgo/sdk-api";
import { Eth } from "@bitgo/sdk-coin-eth";
import type { BitGoWalletResult, BitGoPolicy } from "./types.js";

// ─── Client Factory ───────────────────────────────────────────────────────────

function getBitGo(): BitGoAPI {
  const accessToken = process.env.BITGO_ACCESS_TOKEN;
  if (!accessToken) throw new Error("BITGO_ACCESS_TOKEN not set");

  const bitgo = new BitGoAPI({ env: "test" });
  bitgo.register("eth", Eth.createInstance);
  bitgo.register("hteth", Eth.createInstance); // Hoodi testnet
  bitgo.authenticateWithAccessToken({ accessToken });
  return bitgo;
}

// ─── Wallet Management ────────────────────────────────────────────────────────

/**
 * Create a new BitGo v3 onchain multisig wallet for an agent.
 * IMPORTANT: userKeychain.prv is returned ONLY ONCE — store it securely.
 * IMPORTANT: Fund the enterprise gas tank BEFORE calling this.
 */
export async function createAgentWallet(
  label: string,
): Promise<BitGoWalletResult> {
  const bitgo = getBitGo();
  const enterpriseId = process.env.BITGO_ENTERPRISE_ID;
  const passphrase = process.env.BITGO_WALLET_PASSPHRASE;
  if (!enterpriseId || !passphrase) {
    throw new Error(
      "BITGO_ENTERPRISE_ID and BITGO_WALLET_PASSPHRASE must be set",
    );
  }

  const result = await bitgo.coin("hteth").wallets().generateWallet({
    label,
    passphrase,
    enterprise: enterpriseId,
    walletVersion: 3, // MUST be v3 for hackathon accounts
    multisigType: "onchain", // NOT 'tss' — TSS requires support contact
  });

  const walletId = result.wallet.id();
  const coinSpecific = result.wallet.coinSpecific() as
    | Record<string, unknown>
    | undefined;
  const pendingChainInitialization =
    (coinSpecific?.pendingChainInitialization as boolean) ?? false;

  return {
    walletId,
    receiveAddress: result.wallet.receiveAddress?.() ?? "",
    userKeyEncrypted: result.userKeychain?.encryptedPrv ?? "",
    pendingChainInitialization,
  };
}

/**
 * Get a wallet instance by ID.
 */
export async function getWallet(walletId: string) {
  const bitgo = getBitGo();
  return bitgo.coin("hteth").wallets().get({ id: walletId });
}

// ─── Policy Management ────────────────────────────────────────────────────────

/**
 * Read the current wallet-level policy.
 * ⚠️  48-HOUR LOCK: policies become immutable 48h after wallet creation.
 */
export async function getWalletPolicy(walletId: string): Promise<unknown> {
  const bitgo = getBitGo();
  const wallet = await bitgo.coin("hteth").wallets().get({ id: walletId });
  return wallet.toJSON().coin; // coin-specific policy fields
}

/**
 * Set wallet-level policies (whitelist + velocity + allocation).
 *
 * ⚠️  CRITICAL: All amounts are in WEI (base units), NOT USD.
 *     1 ETH = 1_000_000_000_000_000_000 wei
 *
 * ⚠️  CRITICAL: Once set, policies lock after 48 hours and cannot be changed.
 *     Over-allocate limits to give yourself flexibility.
 */
export async function setWalletPolicy(
  walletId: string,
  policy: BitGoPolicy,
): Promise<unknown> {
  const bitgo = getBitGo();
  const wallet = await bitgo.coin("hteth").wallets().get({ id: walletId });

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
        // Amount in WEI as string
        amountString: policy.velocityLimit.amount,
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
        amountString: policy.allocationLimit.amount,
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
 * Send a transaction via BitGo wallet.
 * Amount must be in WEI as a string.
 * Returns txid if approved immediately, or pendingApproval ID if policy-blocked.
 */
export async function sendTransaction(
  walletId: string,
  recipientAddress: string,
  amountWei: string,
): Promise<SendResult> {
  const bitgo = getBitGo();
  const passphrase = process.env.BITGO_WALLET_PASSPHRASE;
  if (!passphrase) throw new Error("BITGO_WALLET_PASSPHRASE not set");

  const wallet = await bitgo.coin("hteth").wallets().get({ id: walletId });

  const result = (await wallet.sendMany({
    recipients: [{ address: recipientAddress, amount: amountWei }],
    walletPassphrase: passphrase,
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

export async function approvePendingApproval(
  approvalId: string,
): Promise<unknown> {
  const bitgo = getBitGo();
  // OTP for test env is EXACTLY 7 zeroes
  return (bitgo as any)
    .pendingApprovals()
    .get({ id: approvalId })
    .then((approval: any) =>
      approval.approve({
        walletPassphrase: process.env.BITGO_WALLET_PASSPHRASE,
        otp: "0000000",
      }),
    );
}

export async function rejectPendingApproval(
  approvalId: string,
): Promise<unknown> {
  const bitgo = getBitGo();
  return (bitgo as any)
    .pendingApprovals()
    .get({ id: approvalId })
    .then((approval: any) => approval.reject());
}

/**
 * Verify a BitGo webhook HMAC signature.
 * Token is found in X-Signature header of the webhook request.
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const crypto = await import("crypto");
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const expected = hmac.digest("hex");
  return expected === signature;
}
