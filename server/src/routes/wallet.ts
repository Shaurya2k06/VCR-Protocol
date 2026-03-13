// ─── BitGo Wallet Routes — Full Wallet Management API ─────────────────────────
import { Router } from "express";
import {
    createAgentWallet,
    getWallet,
    getWalletPolicy,
    setWalletPolicy,
    sendTransaction,
    approvePendingApproval,
    rejectPendingApproval,
    verifyWebhookSignature,
} from "../sdk/index.js";
import type { BitGoPolicy } from "../sdk/index.js";
import { updateAgentWallet } from "../models/Agent.js";
import { logTransaction } from "../models/Transaction.js";

const router = Router();

/**
 * POST /api/wallet
 * Create a new BitGo v3 agent wallet.
 * ⚠️ Enterprise gas tank must be funded BEFORE calling this.
 */
router.post("/", async (req, res) => {
    try {
        const { label, agentId } = req.body as {
            label: string;
            agentId?: number;
        };

        if (!label) {
            return res.status(400).json({ error: "label is required" });
        }

        const result = await createAgentWallet(label);

        // If agentId provided, link wallet to agent in DB
        if (agentId !== undefined) {
            await updateAgentWallet(agentId, result.walletId);
        }

        return res.status(201).json({
            walletId: result.walletId,
            receiveAddress: result.receiveAddress,
            pendingChainInitialization: result.pendingChainInitialization,
            agentId,
            warning:
                "userKeyEncrypted is returned ONLY ONCE. Store it securely. Policies lock 48h after wallet creation.",
        });
    } catch (err) {
        return res.status(500).json({ error: (err as Error).message });
    }
});

/**
 * GET /api/wallet/:walletId
 * Get wallet details.
 */
router.get("/:walletId", async (req, res) => {
    try {
        const wallet = await getWallet(req.params.walletId);
        const walletJson = wallet.toJSON() as unknown as Record<string, unknown>;
        return res.json({
            id: wallet.id(),
            label: walletJson.label,
            coin: walletJson.coin,
            balance: walletJson.balance,
            balanceString: walletJson.balanceString,
        });
    } catch (err) {
        return res.status(500).json({ error: (err as Error).message });
    }
});

/**
 * GET /api/wallet/:walletId/policy
 * Get the current wallet-level policy.
 */
router.get("/:walletId/policy", async (req, res) => {
    try {
        const policy = await getWalletPolicy(req.params.walletId);
        return res.json({ walletId: req.params.walletId, policy });
    } catch (err) {
        return res.status(500).json({ error: (err as Error).message });
    }
});

/**
 * PUT /api/wallet/:walletId/policy
 * Set wallet-level policies (whitelist, velocity limit, allocation limit).
 *
 * ⚠️ CRITICAL: Amounts are in WEI, NOT USD. 1 ETH = 10^18 wei.
 * ⚠️ CRITICAL: Policies lock 48h after creation — immutable forever.
 */
router.put("/:walletId/policy", async (req, res) => {
    try {
        const policy = req.body as BitGoPolicy;
        const result = await setWalletPolicy(req.params.walletId, policy);
        return res.json({
            walletId: req.params.walletId,
            result,
            warning:
                "Policies lock 48 hours after wallet creation and become immutable forever.",
        });
    } catch (err) {
        return res.status(500).json({ error: (err as Error).message });
    }
});

/**
 * POST /api/wallet/:walletId/send
 * Send a transaction via BitGo wallet.
 * Amount must be in WEI as a string.
 */
router.post("/:walletId/send", async (req, res) => {
    try {
        const { recipient, amount, ensName } = req.body as {
            recipient: string;
            amount: string;
            ensName?: string;
        };

        if (!recipient || !amount) {
            return res.status(400).json({ error: "recipient and amount are required" });
        }

        const result = await sendTransaction(req.params.walletId, recipient, amount);

        // Log the transaction
        if (ensName) {
            await logTransaction({
                ensName,
                type: "bitgo_send",
                amount,
                token: "ETH",
                recipient,
                chain: "hoodi",
                vcrAllowed: true,
                txHash: result.txid,
                pendingApprovalId: result.pendingApproval,
                status: result.status === "confirmed" ? "completed" : "pending",
            });
        }

        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: (err as Error).message });
    }
});

/**
 * POST /api/wallet/approval/:approvalId/approve
 * Approve a pending transaction.
 */
router.post("/approval/:approvalId/approve", async (req, res) => {
    try {
        const result = await approvePendingApproval(req.params.approvalId);
        return res.json({ approved: true, result });
    } catch (err) {
        return res.status(500).json({ error: (err as Error).message });
    }
});

/**
 * POST /api/wallet/approval/:approvalId/reject
 * Reject a pending transaction.
 */
router.post("/approval/:approvalId/reject", async (req, res) => {
    try {
        const result = await rejectPendingApproval(req.params.approvalId);
        return res.json({ rejected: true, result });
    } catch (err) {
        return res.status(500).json({ error: (err as Error).message });
    }
});

/**
 * POST /api/wallet/webhook
 * BitGo webhook receiver for transfer and pendingApproval events.
 * Verify HMAC signature before processing.
 */
router.post("/webhook", async (req, res) => {
    try {
        const signature = req.headers["x-signature"] as string;
        const webhookSecret = process.env.BITGO_WEBHOOK_SECRET;

        if (webhookSecret && signature) {
            const payload = JSON.stringify(req.body);
            const valid = await verifyWebhookSignature(payload, signature, webhookSecret);
            if (!valid) {
                return res.status(401).json({ error: "Invalid webhook signature" });
            }
        }

        const { type, hash, wallet, pendingApprovalId } = req.body as {
            type: string;
            hash?: string;
            wallet?: string;
            pendingApprovalId?: string;
        };

        console.log(`[BitGo Webhook] type=${type} hash=${hash} wallet=${wallet}`);

        // Process based on event type
        if (type === "transfer") {
            console.log(`[BitGo Webhook] Transfer confirmed: ${hash}`);
        } else if (type === "pendingapproval") {
            console.log(`[BitGo Webhook] Pending approval: ${pendingApprovalId}`);
        }

        return res.json({ received: true, type });
    } catch (err) {
        return res.status(500).json({ error: (err as Error).message });
    }
});

export default router;
