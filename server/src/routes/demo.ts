// ─── Demo Routes — Real Paywall Access + Spend Logging ───────────────────────
import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import {
  vcrPaymentMiddleware,
  X402_FACILITATOR,
  canAgentSpend,
  getVCRPolicyUri,
  fetchPolicy,
  sendTransaction,
} from "@vcr-protocol/sdk";
import { getDailySpent, recordSpend, resetDailySpend } from "../models/DailySpend.js";
import {
  logTransaction,
  getTransactionsByAgent,
} from "../models/Transaction.js";
import type { SpendRequest } from "@vcr-protocol/sdk";
import { buildProtocolSuite } from "../lib/protocolSuite.js";
import { buildIncidentReplays } from "../lib/incidentDemos.js";
import { getAllAgents, getAgentByEnsName } from "../models/Agent.js";

const router = Router();

const PAYWALL_RECIPIENT =
  process.env.DEMO_RECIPIENT_ADDRESS ??
  "0x0000000000000000000000000000000000000000";
const PAYWALL_AMOUNT = "100000"; // 0.1 USDC base units (6 decimals)
const PAYWALL_TOKEN = "USDC";
const PAYWALL_NETWORK = "base-sepolia";
const FEATURED_AGENT_ENS = "hoodi-small-002.vcrtcorp.eth";
const DEMO_EXEC_AMOUNT_WEI =
  process.env.DEMO_EXEC_AMOUNT_WEI ?? "1000000000000000"; // 0.001 ETH-equivalent on Hoodi

function buildHoodiTxUrl(txid: string): string {
  return `https://hoodi.etherscan.io/tx/${txid}`;
}

async function getFeaturedAgent() {
  const dbAgents = await getAllAgents(20).catch(() => []);
  const candidates = Array.isArray(dbAgents) ? dbAgents : [];
  const preferred =
    candidates.find((agent) => agent.ensName?.toLowerCase() === FEATURED_AGENT_ENS) ??
    candidates.find(
      (agent) =>
        agent.ensName &&
        agent.supportedChains?.includes(PAYWALL_NETWORK) &&
        agent.supportedTokens?.includes(PAYWALL_TOKEN),
    );

  if (preferred?.ensName) {
    return {
      ensName: preferred.ensName,
      source: "mongodb",
      supportedChains: preferred.supportedChains,
      supportedTokens: preferred.supportedTokens,
    };
  }

  const localAgentDirectories = [
    path.join(process.cwd(), "agents"),
    path.join(process.cwd(), "..", "sdk", "agents"),
  ];

  for (const directory of localAgentDirectories) {
    const localFiles = await fs.readdir(directory).catch(() => []);

    for (const file of localFiles) {
      if (!file.endsWith(".json")) continue;
      const raw = await fs.readFile(path.join(directory, file), "utf8");
      const parsed = JSON.parse(raw) as {
        ensName?: string;
        walletAddress?: string;
      };
      if (!parsed.ensName) continue;

      if (parsed.ensName.toLowerCase() === FEATURED_AGENT_ENS) {
        return {
          ensName: parsed.ensName,
          source: path.relative(process.cwd(), path.join(directory, file)),
          supportedChains: [PAYWALL_NETWORK],
          supportedTokens: [PAYWALL_TOKEN],
        };
      }
    }
  }

  return null;
}

async function resolveBitGoWalletCredentialsForEns(ensName: string): Promise<{
  walletId: string;
  walletPassphrase?: string;
} | null> {
  const dbAgent = await getAgentByEnsName(ensName).catch(() => null);
  const dbWalletId = dbAgent?.bitgoWalletId;
  const envPassphrase = process.env.BITGO_WALLET_PASSPHRASE;

  const localAgentDirectories = [
    path.join(process.cwd(), "agents"),
    path.join(process.cwd(), "..", "sdk", "agents"),
  ];

  for (const directory of localAgentDirectories) {
    const localFiles = await fs.readdir(directory).catch(() => []);

    for (const file of localFiles) {
      if (!file.endsWith(".json")) continue;
      const raw = await fs.readFile(path.join(directory, file), "utf8");
      const parsed = JSON.parse(raw) as {
        ensName?: string;
        walletId?: string;
        bitgoWalletId?: string;
        walletPassphrase?: string;
      };

      if (parsed.ensName?.toLowerCase() !== ensName.toLowerCase()) {
        continue;
      }

      const walletId = parsed.bitgoWalletId ?? parsed.walletId;
      if (!walletId) continue;

      // If DB already provided a walletId, only use a local file passphrase
      // when it refers to the same wallet.
      if (dbWalletId && walletId !== dbWalletId) {
        continue;
      }

      return {
        walletId: dbWalletId ?? walletId,
        walletPassphrase: parsed.walletPassphrase ?? envPassphrase,
      };
    }
  }

  if (dbWalletId) {
    return {
      walletId: dbWalletId,
      walletPassphrase: envPassphrase,
    };
  }

  return null;
}

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

router.post("/daily/:ensName/:token/reset", async (req, res) => {
  try {
    const { ensName, token } = req.params;
    const reset = await resetDailySpend(ensName, token);

    return res.json({
      success: true,
      ensName,
      token,
      dailySpent: reset.amountSpent,
      date: reset.date,
    });
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
 * POST /api/demo/suite/:ensName
 * Run an automated x402 + VCR scenario suite against the live ENS-resolved policy.
 * By default this is a dry run. Set commitSuccess=true to persist all allowed scenarios.
 */
router.post("/suite/:ensName", async (req, res) => {
  try {
    const ensName = req.params.ensName;
    const commitSuccess = Boolean(req.body?.commitSuccess);
    const executeOnChain = Boolean(req.body?.executeOnChain);
    const policyUri = await getVCRPolicyUri(ensName);

    if (!policyUri) {
      return res.status(404).json({
        error: "No VCR policy pointer found for this ENS name",
        ensName,
      });
    }

    const policy = await fetchPolicy(policyUri);
    const currentDailySpent = await getDailySpent(
      ensName,
      policy.constraints.allowedTokens[0] ?? PAYWALL_TOKEN,
    );

    const suite = buildProtocolSuite(
      ensName,
      policy,
      currentDailySpent,
      {
        amount: PAYWALL_AMOUNT,
        token: PAYWALL_TOKEN,
        recipient: PAYWALL_RECIPIENT,
        network: PAYWALL_NETWORK,
      },
    );

    let committedResult: {
      amount: string;
      token: string;
      recipient: string;
      chain: string;
      dailySpent: string;
    } | null = null;
    const committedResults: Array<{
      scenarioId: string;
      amount: string;
      token: string;
      recipient: string;
      chain: string;
      dailySpent: string;
    }> = [];

    let executionResult:
      | {
          scenarioId?: string;
          attempted: boolean;
          walletId?: string;
          recipient?: string;
          amountWei?: string;
          status?: "confirmed" | "pending_approval";
          txid?: string;
          txUrl?: string;
          pendingApproval?: string;
          error?: string;
        }
      | null = null;
    const executionResults: Array<{
      scenarioId: string;
      attempted: boolean;
      walletId?: string;
      recipient?: string;
      amountWei?: string;
      status?: "confirmed" | "pending_approval";
      txid?: string;
      txUrl?: string;
      pendingApproval?: string;
      error?: string;
    }> = [];
    const scenarioExecutionResults: Array<{
      scenarioId: string;
      expectedAllowed: boolean;
      actualAllowed: boolean;
      execution: "rejected_by_vcr" | "not_executed" | "executed" | "execution_failed";
      reason?: string;
      txid?: string;
      txUrl?: string;
      pendingApproval?: string;
      amount?: string;
      token?: string;
      chain?: string;
      recipient?: string;
    }> = [];

    const allowedScenarios = suite.scenarios.filter((scenario) => scenario.actualAllowed);

    if (commitSuccess && allowedScenarios.length > 0) {
      for (const allowedScenario of allowedScenarios) {
        const record = await recordSpend(
          ensName,
          allowedScenario.request.token,
          allowedScenario.request.amount,
        );

        await logTransaction({
          ensName,
          type: "x402_payment",
          amount: allowedScenario.request.amount,
          token: allowedScenario.request.token,
          recipient: allowedScenario.request.recipient,
          chain: allowedScenario.request.chain,
          vcrAllowed: true,
          status: "completed",
          policyCid: policy.ipfs_cid,
        });

        committedResults.push({
          scenarioId: allowedScenario.id,
          amount: allowedScenario.request.amount,
          token: allowedScenario.request.token,
          recipient: allowedScenario.request.recipient,
          chain: allowedScenario.request.chain,
          dailySpent: record.amountSpent,
        });
      }

      committedResult = committedResults[0] ?? null;
    }

    let walletCredentials: Awaited<ReturnType<typeof resolveBitGoWalletCredentialsForEns>> = null;
    if (executeOnChain && allowedScenarios.length > 0) {
      walletCredentials = await resolveBitGoWalletCredentialsForEns(ensName);

      if (!walletCredentials) {
        executionResult = {
          attempted: false,
          error: "No BitGo wallet credentials found for this ENS in DB or local agent records",
        };
      }
    }

    for (const scenario of suite.scenarios) {
      if (!scenario.actualAllowed) {
        scenarioExecutionResults.push({
          scenarioId: scenario.id,
          expectedAllowed: scenario.expectedAllowed,
          actualAllowed: scenario.actualAllowed,
          execution: "rejected_by_vcr",
          reason: scenario.reason,
          amount: scenario.request.amount,
          token: scenario.request.token,
          chain: scenario.request.chain,
          recipient: scenario.request.recipient,
        });
        continue;
      }

      if (!executeOnChain) {
        scenarioExecutionResults.push({
          scenarioId: scenario.id,
          expectedAllowed: scenario.expectedAllowed,
          actualAllowed: scenario.actualAllowed,
          execution: "not_executed",
          reason: "executeOnChain disabled for this run",
          amount: scenario.request.amount,
          token: scenario.request.token,
          chain: scenario.request.chain,
          recipient: scenario.request.recipient,
        });
        continue;
      }

      if (!walletCredentials) {
        scenarioExecutionResults.push({
          scenarioId: scenario.id,
          expectedAllowed: scenario.expectedAllowed,
          actualAllowed: scenario.actualAllowed,
          execution: "execution_failed",
          reason: "No BitGo wallet credentials found for this ENS in DB or local agent records",
          amount: scenario.request.amount,
          token: scenario.request.token,
          chain: scenario.request.chain,
          recipient: scenario.request.recipient,
        });
        continue;
      }

      try {
        const send = await sendTransaction(
          walletCredentials.walletId,
          scenario.request.recipient,
          DEMO_EXEC_AMOUNT_WEI,
          walletCredentials.walletPassphrase,
        );

        await logTransaction({
          ensName,
          type: "bitgo_send",
          amount: DEMO_EXEC_AMOUNT_WEI,
          token: "ETH",
          recipient: scenario.request.recipient,
          chain: "hoodi",
          vcrAllowed: true,
          txHash: send.txid,
          pendingApprovalId: send.pendingApproval,
          status: send.status === "confirmed" ? "completed" : "pending",
        });

        const txUrl = send.txid ? buildHoodiTxUrl(send.txid) : undefined;

        executionResults.push({
          scenarioId: scenario.id,
          attempted: true,
          walletId: walletCredentials.walletId,
          recipient: scenario.request.recipient,
          amountWei: DEMO_EXEC_AMOUNT_WEI,
          status: send.status,
          txid: send.txid,
          txUrl,
          pendingApproval: send.pendingApproval,
        });

        scenarioExecutionResults.push({
          scenarioId: scenario.id,
          expectedAllowed: scenario.expectedAllowed,
          actualAllowed: scenario.actualAllowed,
          execution: "executed",
          txid: send.txid,
          txUrl,
          pendingApproval: send.pendingApproval,
          amount: scenario.request.amount,
          token: scenario.request.token,
          chain: scenario.request.chain,
          recipient: scenario.request.recipient,
        });
      } catch (error) {
        const message = (error as Error).message;

        executionResults.push({
          scenarioId: scenario.id,
          attempted: true,
          walletId: walletCredentials.walletId,
          recipient: scenario.request.recipient,
          amountWei: DEMO_EXEC_AMOUNT_WEI,
          error: message,
        });

        scenarioExecutionResults.push({
          scenarioId: scenario.id,
          expectedAllowed: scenario.expectedAllowed,
          actualAllowed: scenario.actualAllowed,
          execution: "execution_failed",
          reason: message,
          amount: scenario.request.amount,
          token: scenario.request.token,
          chain: scenario.request.chain,
          recipient: scenario.request.recipient,
        });
      }
    }

    if (!executionResult && executionResults.length > 0) {
      executionResult = executionResults[0];
    }

    const committedScenarioIds = new Set(committedResults.map((result) => result.scenarioId));

    for (const scenario of suite.scenarios) {
      if (committedScenarioIds.has(scenario.id)) {
        continue;
      }

      await logTransaction({
        ensName,
        type: scenario.actualAllowed ? "x402_payment" : "policy_violation",
        amount: scenario.request.amount,
        token: scenario.request.token,
        recipient: scenario.request.recipient,
        chain: scenario.request.chain,
        vcrAllowed: scenario.actualAllowed,
        vcrReason: scenario.reason,
        status: scenario.actualAllowed
          ? committedScenarioIds.has(scenario.id)
            ? "completed"
            : "pending"
          : "rejected",
        policyCid: policy.ipfs_cid,
      });
    }

    return res.json({
      success: true,
      ensName,
      policyUri,
      suite,
      commitSuccess,
      executeOnChain,
      committedResults,
      committedResult,
      executionResults,
      executionResult,
      scenarioExecutionResults,
      paywall: {
        amount: PAYWALL_AMOUNT,
        token: PAYWALL_TOKEN,
        recipient: PAYWALL_RECIPIENT,
        network: PAYWALL_NETWORK,
        facilitator: X402_FACILITATOR,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/incidents/:ensName", async (req, res) => {
  try {
    const ensName = req.params.ensName;
    const policyUri = await getVCRPolicyUri(ensName);

    if (!policyUri) {
      return res.status(404).json({
        error: "No VCR policy pointer found for this ENS name",
        ensName,
      });
    }

    const policy = await fetchPolicy(policyUri);
    const currentDailySpent = await getDailySpent(
      ensName,
      policy.constraints.allowedTokens[0] ?? PAYWALL_TOKEN,
    );

    return res.json({
      success: true,
      ensName,
      policyUri,
      currentDailySpent,
      paywall: {
        amount: PAYWALL_AMOUNT,
        token: PAYWALL_TOKEN,
        recipient: PAYWALL_RECIPIENT,
        network: PAYWALL_NETWORK,
        facilitator: X402_FACILITATOR,
      },
      incidents: buildIncidentReplays(ensName, policy, currentDailySpent),
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/featured-agent", async (_req, res) => {
  try {
    const featured = await getFeaturedAgent();
    if (!featured) {
      return res.status(404).json({ error: "No featured demo agent found" });
    }

    return res.json({
      success: true,
      featured,
      paywall: {
        amount: PAYWALL_AMOUNT,
        token: PAYWALL_TOKEN,
        recipient: PAYWALL_RECIPIENT,
        network: PAYWALL_NETWORK,
        facilitator: X402_FACILITATOR,
      },
    });
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
