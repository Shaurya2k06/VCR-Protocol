// ─── Verify Routes — canAgentSpend() ─────────────────────────────────────────
import { Router } from "express";
import { canAgentSpend } from "../sdk/index.js";
import { getDailySpent, recordSpend, getSpendHistory } from "../models/DailySpend.js";
import type { SpendRequest } from "../sdk/index.js";

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

export default router;
