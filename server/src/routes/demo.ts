// ─── Demo Routes — x402 Paywall & End-to-End Simulation ──────────────────────
import { Router } from "express";
import { vcrPaymentMiddleware, X402_HEADERS, canAgentSpend } from "../sdk/index.js";
import { getDailySpent, recordSpend } from "../models/DailySpend.js";
import type { SpendRequest } from "../sdk/index.js";

const router = Router();

// USDC on Base Sepolia (6 decimals)
const DEMO_RECIPIENT = process.env.DEMO_RECIPIENT_ADDRESS ?? "0x0000000000000000000000000000000000000000";
const DEMO_AMOUNT = "100000"; // $0.10 USDC
const DEMO_TOKEN = "USDC";
const DEMO_NETWORK = "base-sepolia";

/**
 * GET /api/demo/content
 * A VCR-gated premium content endpoint.
 * Uses x402 payment middleware with VCR policy check.
 */
router.get(
  "/content",
  vcrPaymentMiddleware({
    amount: DEMO_AMOUNT,
    token: DEMO_TOKEN,
    network: DEMO_NETWORK,
    recipient: DEMO_RECIPIENT,
    vcrCheck: { getDailySpent },
  }),
  (req, res) => {
    res.json({
      message: "🎉 Access granted — VCR policy verified & payment settled!",
      content: {
        title: "Alpha Research Report #42",
        body: "This premium content was unlocked by a policy-constrained autonomous agent.",
        timestamp: new Date().toISOString(),
      },
    });
  }
);

/**
 * POST /api/demo/simulate
 * Simulate the full VCR + x402 flow without making real blockchain calls.
 * Useful for UI demos and testing.
 */
router.post("/simulate", async (req, res) => {
  try {
    const {
      ensName,
      amount = DEMO_AMOUNT,
      token = DEMO_TOKEN,
      recipient = DEMO_RECIPIENT,
      chain = DEMO_NETWORK,
    } = req.body as {
      ensName: string;
      amount?: string;
      token?: string;
      recipient?: string;
      chain?: string;
    };

    if (!ensName) {
      return res.status(400).json({ error: "ensName is required" });
    }

    const spendRequest: SpendRequest = { amount, token, recipient, chain };

    // Build the simulation steps log
    const steps: Array<{ step: number; name: string; status: "ok" | "fail"; detail?: string }> = [];

    // Step 1: Agent sends request to paywall
    steps.push({ step: 1, name: "Agent → Paywall (GET /content)", status: "ok", detail: `Requesting ${DEMO_NETWORK} resource` });

    // Step 2: Server returns 402
    steps.push({ step: 2, name: "Paywall → 402 with PAYMENT-REQUIRED", status: "ok", detail: `${amount} ${token} to ${recipient}` });

    // Step 3: VCR check
    const vcrResult = await canAgentSpend(ensName, spendRequest, getDailySpent);
    steps.push({
      step: 3,
      name: "canAgentSpend() — VCR Policy Check",
      status: vcrResult.allowed ? "ok" : "fail",
      detail: vcrResult.allowed ? "All constraints passed" : vcrResult.reason,
    });

    if (!vcrResult.allowed) {
      return res.json({
        success: false,
        blockedAt: 3,
        reason: vcrResult.reason,
        steps,
        policy: vcrResult.policy,
      });
    }

    // Step 4: EIP-3009 signature (simulated)
    steps.push({
      step: 4,
      name: "Agent signs EIP-3009 TransferWithAuthorization",
      status: "ok",
      detail: "PAYMENT-SIGNATURE header attached",
    });

    // Step 5: Facilitator verify
    steps.push({
      step: 5,
      name: "Facilitator /verify",
      status: "ok",
      detail: `${X402_FACILITATOR}/verify — signature valid, balance sufficient`,
    });

    // Step 6: Facilitator settle
    steps.push({
      step: 6,
      name: "Facilitator /settle",
      status: "ok",
      detail: "On-chain USDC transferWithAuthorization executed",
    });

    // Step 7: Record the spend
    await recordSpend(ensName, token, amount);
    const newDailyTotal = await getDailySpent(ensName, token);

    steps.push({
      step: 7,
      name: "Daily spend recorded",
      status: "ok",
      detail: `Cumulative today: ${newDailyTotal} ${token} base units`,
    });

    // Step 8: Server returns 200
    steps.push({
      step: 8,
      name: "Paywall → 200 with PAYMENT-RESPONSE + content",
      status: "ok",
      detail: "Premium content delivered",
    });

    return res.json({
      success: true,
      steps,
      policy: vcrResult.policy,
      dailySpentAfter: newDailyTotal,
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/demo/daily/:ensName/:token
 * Alias — get daily spend for a demo agent.
 */
router.get("/daily/:ensName/:token", async (req, res) => {
  const { ensName, token } = req.params;
  const spent = await getDailySpent(ensName, token);
  return res.json({ ensName, token, dailySpent: spent });
});

const X402_FACILITATOR = "https://x402.org/facilitator";

export default router;
