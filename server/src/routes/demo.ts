// ─── Demo Routes — Real Paywall Access + Spend Logging ───────────────────────
import { Router } from "express";
import {
  vcrPaymentMiddleware,
  X402_FACILITATOR,
  canAgentSpend,
} from "@vcr-protocol/sdk";
import { getDailySpent, recordSpend } from "../models/DailySpend.js";
import {
  logTransaction,
  getTransactionsByAgent,
} from "../models/Transaction.js";
import type { SpendRequest } from "@vcr-protocol/sdk";

const router = Router();

const PAYWALL_RECIPIENT =
  process.env.DEMO_RECIPIENT_ADDRESS ??
  "0x0000000000000000000000000000000000000000";
const PAYWALL_AMOUNT = "100000"; // 0.1 USDC base units (6 decimals)
const PAYWALL_TOKEN = "USDC";
const PAYWALL_NETWORK = "base-sepolia";

function getRequestContext(req: {
  headers: Record<string, unknown>;
  body?: Record<string, unknown>;
}) {
  const ensName =
    (req.headers["x-agent-ens"] as string | undefined) ??
    (req.body?.ensName as string | undefined);

  const amount = (req.body?.amount as string | undefined) ?? PAYWALL_AMOUNT;
  const token = (req.body?.token as string | undefined) ?? PAYWALL_TOKEN;
  const recipient =
    (req.body?.recipient as string | undefined) ?? PAYWALL_RECIPIENT;
  const chain = (req.body?.chain as string | undefined) ?? PAYWALL_NETWORK;

  return {
    ensName,
    amount,
    token,
    recipient,
    chain,
  };
}

/**
 * GET /api/demo/content
 * Real paywall endpoint protected by x402 middleware + live VCR policy check.
 *
 * Flow:
 * 1. Client requests content without PAYMENT-SIGNATURE
 * 2. Server responds 402 with PAYMENT-REQUIRED header
 * 3. Client retries with PAYMENT-SIGNATURE and x-agent-ens
 * 4. Middleware verifies payment + VCR policy
 * 5. Route records spend and returns the protected content
 */
router.get(
  "/content",
  vcrPaymentMiddleware({
    amount: PAYWALL_AMOUNT,
    token: PAYWALL_TOKEN,
    network: PAYWALL_NETWORK,
    recipient: PAYWALL_RECIPIENT,
    facilitator: X402_FACILITATOR,
    vcrCheck: { getDailySpent },
  }),
  async (req, res) => {
    try {
      const ensName = req.headers["x-agent-ens"] as string | undefined;

      if (!ensName) {
        return res.status(400).json({
          error:
            "x-agent-ens header is required after successful payment verification",
        });
      }

      const record = await recordSpend(ensName, PAYWALL_TOKEN, PAYWALL_AMOUNT);

      await logTransaction({
        ensName,
        type: "x402_payment",
        amount: PAYWALL_AMOUNT,
        token: PAYWALL_TOKEN,
        recipient: PAYWALL_RECIPIENT,
        chain: PAYWALL_NETWORK,
        vcrAllowed: true,
        status: "completed",
      });

      return res.json({
        success: true,
        message: "Access granted. Payment verified and spend recorded.",
        payment: {
          amount: PAYWALL_AMOUNT,
          token: PAYWALL_TOKEN,
          recipient: PAYWALL_RECIPIENT,
          chain: PAYWALL_NETWORK,
        },
        daily: {
          ensName,
          token: PAYWALL_TOKEN,
          amountSpent: record.amountSpent,
        },
        content: {
          title: "VCR Premium Content",
          body: "This content was delivered through the live paywall route after real backend verification.",
          deliveredAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  },
);

/**
 * POST /api/demo/check
 * Run a real VCR spend check against current backend state without mutating spend totals.
 * Useful for frontend validation before attempting paywall access.
 */
router.post("/check", async (req, res) => {
  try {
    const { ensName, amount, token, recipient, chain } = getRequestContext(req);

    if (!ensName) {
      return res.status(400).json({ error: "ensName is required" });
    }

    const spendRequest: SpendRequest = {
      amount,
      token,
      recipient,
      chain,
    };

    const result = await canAgentSpend(ensName, spendRequest, getDailySpent);

    await logTransaction({
      ensName,
      type: result.allowed ? "x402_payment" : "policy_violation",
      amount,
      token,
      recipient,
      chain,
      vcrAllowed: result.allowed,
      vcrReason: result.reason,
      status: result.allowed ? "pending" : "rejected",
      policyCid: result.policyCid,
    });

    return res.json({
      success: result.allowed,
      ensName,
      spendRequest,
      result,
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/demo/settle
 * Record a completed payment after the client has successfully passed through the paywall.
 * This is useful if the frontend uses a custom x402 client and wants an explicit settlement log.
 */
router.post("/settle", async (req, res) => {
  try {
    const { ensName, amount, token, recipient, chain } = getRequestContext(req);

    if (!ensName) {
      return res.status(400).json({ error: "ensName is required" });
    }
    if (!amount || !token || !recipient || !chain) {
      return res.status(400).json({
        error: "ensName, amount, token, recipient, and chain are required",
      });
    }

    const record = await recordSpend(ensName, token, amount);

    await logTransaction({
      ensName,
      type: "x402_payment",
      amount,
      token,
      recipient,
      chain,
      vcrAllowed: true,
      status: "completed",
    });

    return res.json({
      success: true,
      recorded: true,
      ensName,
      token,
      amount,
      dailySpent: record.amountSpent,
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/demo/daily/:ensName/:token
 * Current daily spend total for a specific agent/token pair.
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
 * GET /api/demo/logs/:ensName
 * Recent paywall-related transaction logs for an agent.
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

/**
 * GET /api/demo/config
 * Expose active paywall configuration so the frontend can use live backend values.
 */
router.get("/config", (_req, res) => {
  res.json({
    amount: PAYWALL_AMOUNT,
    token: PAYWALL_TOKEN,
    recipient: PAYWALL_RECIPIENT,
    network: PAYWALL_NETWORK,
    facilitator: X402_FACILITATOR,
  });
});

export default router;
