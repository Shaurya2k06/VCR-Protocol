// ─── Verify Routes — canAgentSpend() ─────────────────────────────────────────
import { Router } from "express";
import { canAgentSpend } from "@vcr-protocol/sdk";
import { getDailySpent, recordSpend, getSpendHistory } from "../models/DailySpend.js";
import { logTransaction, getTransactionsByAgent } from "../models/Transaction.js";
import type { SpendRequest } from "@vcr-protocol/sdk";

const router = Router();

/**
 * POST /api/verify
 * Run the full canAgentSpend() check against a proposed spend request.
 */
router.post("/", async (req, res) => {
  try {
    const { ensName, spendRequest } = req.body as {
      ensName: string;
      spendRequest: SpendRequest;
    };

    if (!ensName || !spendRequest) {
      return res.status(400).json({ error: "ensName and spendRequest are required" });
    }
    if (!spendRequest.amount || !spendRequest.token || !spendRequest.recipient || !spendRequest.chain) {
      return res.status(400).json({
        error: "spendRequest must include: amount, token, recipient, chain",
      });
    }

    const result = await canAgentSpend(ensName, spendRequest, getDailySpent);

    // Persist to audit log
    await logTransaction({
      ensName,
      type: "x402_payment",
      amount: spendRequest.amount,
      token: spendRequest.token,
      recipient: spendRequest.recipient,
      chain: spendRequest.chain,
      vcrAllowed: result.allowed,
      vcrReason: result.reason,
      status: result.allowed ? "pending" : "rejected",
      policyCid: result.policyCid,
    });

    return res.json({ ensName, spendRequest, result });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/verify/record
 * Record a successful spend (called after payment settles).
 */
router.post("/record", async (req, res) => {
  try {
    const { ensName, token, amount } = req.body as {
      ensName: string;
      token: string;
      amount: string;
    };

    if (!ensName || !token || !amount) {
      return res.status(400).json({ error: "ensName, token, and amount are required" });
    }

    const record = await recordSpend(ensName, token, amount);

    // Update log status to completed
    // (In a real app we'd find the pending one, here we just log the completion)
    await logTransaction({
      ensName,
      type: "x402_payment",
      amount,
      token,
      recipient: "unknown", // Usually passed in from client
      chain: "unknown",
      vcrAllowed: true,
      status: "completed",
    });

    return res.json({ recorded: true, ensName, token, amount, daily: record.amountSpent });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/verify/daily/:ensName/:token
 * Get the current daily spend for an agent.
 */
router.get("/daily/:ensName/:token", async (req, res) => {
  try {
    const { ensName, token } = req.params;
    const spent = await getDailySpent(ensName, token);
    return res.json({ ensName, token, dailySpent: spent });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/verify/history/:ensName
 * Get spend history for an agent (last 30 days).
 */
router.get("/history/:ensName", async (req, res) => {
  try {
    const { ensName } = req.params;
    const history = await getSpendHistory(ensName);
    return res.json({ ensName, history });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/verify/logs/:ensName
 * Get individual transaction logs for an agent (last 50).
 */
router.get("/logs/:ensName", async (req, res) => {
  try {
    const { ensName } = req.params;
    const logs = await getTransactionsByAgent(ensName);
    return res.json({ ensName, logs });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
