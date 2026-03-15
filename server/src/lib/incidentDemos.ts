import { canAgentSpendWithPolicy } from "@vcr-protocol/sdk";
import type { SpendRequest, VCRConstraints, VCRPolicy } from "@vcr-protocol/sdk";

export interface IncidentReplay {
  id: string;
  title: string;
  date: string;
  loss: string;
  rootCause: string;
  vcrFields: string[];
  summary: string;
  x402Request: SpendRequest;
  protectedPolicy: {
    maxTransaction: string;
    allowedRecipients: string[];
    allowedChains: string[];
    slippageProtection?: VCRConstraints["slippageProtection"];
  };
  triggeredGuards: string[];
  result: ReturnType<typeof canAgentSpendWithPolicy>;
}

const ESTABLISHED_POOL_ONE = "0x1111111111111111111111111111111111111111";
const ESTABLISHED_POOL_TWO = "0x2222222222222222222222222222222222222222";
const ILLIQUID_POOL = "0x3333333333333333333333333333333333333333";
const MEV_TARGET_POOL = "0x4444444444444444444444444444444444444444";

function clonePolicy(policy: VCRPolicy): VCRPolicy {
  return JSON.parse(JSON.stringify(policy)) as VCRPolicy;
}

function detectTriggeredGuards(
  policy: VCRPolicy,
  request: SpendRequest,
  dailySpent: string,
): string[] {
  const guards: string[] = [];

  if (BigInt(request.amount) > BigInt(policy.constraints.maxTransaction.amount)) {
    guards.push("maxTransaction");
  }

  if (!policy.constraints.allowedRecipients.map((value) => value.toLowerCase()).includes(request.recipient.toLowerCase())) {
    guards.push("allowedRecipients");
  }

  if (!policy.constraints.allowedTokens.includes(request.token)) {
    guards.push("allowedTokens");
  }

  if (!policy.constraints.allowedChains.includes(request.chain)) {
    guards.push("allowedChains");
  }

  if (
    policy.constraints.slippageProtection?.enabled &&
    (typeof request.slippageBps !== "number" ||
      request.slippageBps > policy.constraints.slippageProtection.maxSlippageBps)
  ) {
    guards.push("slippageProtection");
  }

  if (BigInt(dailySpent) + BigInt(request.amount) > BigInt(policy.constraints.dailyLimit.amount)) {
    guards.push("dailyLimit");
  }

  return guards;
}

function buildProtectedPolicy(
  basePolicy: VCRPolicy,
  overrides: Partial<VCRConstraints>,
): VCRPolicy {
  const nextPolicy = clonePolicy(basePolicy);
  nextPolicy.constraints = {
    ...nextPolicy.constraints,
    ...overrides,
  };
  return nextPolicy;
}

export function buildIncidentReplays(
  ensName: string,
  policy: VCRPolicy,
  currentDailySpent: string,
): IncidentReplay[] {
  const incidents: Array<{
    id: string;
    title: string;
    date: string;
    loss: string;
    rootCause: string;
    vcrFields: string[];
    summary: string;
    request: SpendRequest;
    overrides: Partial<VCRConstraints>;
  }> = [
    {
      id: "aave-50m-swap",
      title: "Aave $50M swap",
      date: "2026-03-12",
      loss: "$50M",
      rootCause: "One oversized swap reached the mempool with no hard cap and no slippage bound.",
      vcrFields: ["maxTransaction", "slippageProtection"],
      summary: "A $50M swap is larger than any sane autonomous budget. Even before execution, the quoted slippage is catastrophically outside policy.",
      request: {
        amount: "50000000000000",
        token: "USDC",
        recipient: ESTABLISHED_POOL_ONE,
        chain: "base-sepolia",
        slippageBps: 2400,
      },
      overrides: {
        maxTransaction: { amount: "10000000000", token: "USDC", chain: "base-sepolia" },
        slippageProtection: { enabled: true, maxSlippageBps: 100 },
      },
    },
    {
      id: "cardano-usda-whale",
      title: "Cardano ADA to USDA whale swap",
      date: "2025-11-16",
      loss: "$6.2M",
      rootCause: "An illiquid venue was used with extreme price impact and no policy whitelist.",
      vcrFields: ["allowedRecipients", "slippageProtection"],
      summary: "The route points to an untrusted pool and the quoted slippage is roughly 87%, so VCR blocks it before signing.",
      request: {
        amount: "6900000000000",
        token: "USDC",
        recipient: ILLIQUID_POOL,
        chain: "base-sepolia",
        slippageBps: 8700,
      },
      overrides: {
        allowedRecipients: [ESTABLISHED_POOL_ONE, ESTABLISHED_POOL_TWO],
        slippageProtection: { enabled: true, maxSlippageBps: 100 },
      },
    },
    {
      id: "ena-mev-sandwich",
      title: "ENA traders versus Jared-style sandwich bot",
      date: "2025-01-15",
      loss: "$800K+ extracted in a single attack",
      rootCause: "Large orders stayed profitable enough for sandwich bots to target.",
      vcrFields: ["maxTransaction", "allowedChains"],
      summary: "A strict per-transaction cap shrinks the trade below sandwich profitability, and a chain allowlist prevents execution on the wrong venue entirely.",
      request: {
        amount: "12500000000",
        token: "USDC",
        recipient: ESTABLISHED_POOL_ONE,
        chain: "ethereum",
        slippageBps: 180,
      },
      overrides: {
        maxTransaction: { amount: "10000000000", token: "USDC", chain: "base-sepolia" },
        allowedChains: ["base-sepolia"],
      },
    },
    {
      id: "stablecoin-98-loss",
      title: "Stablecoin swap with 98% loss",
      date: "2025-03-12",
      loss: "$215K",
      rootCause: "A seemingly safe stablecoin route had manipulated depth and no slippage floor.",
      vcrFields: ["allowedRecipients", "slippageProtection"],
      summary: "Stablecoin trades should not clear with multi-thousand-basis-point slippage. VCR treats that as a hard policy violation.",
      request: {
        amount: "220764000000",
        token: "USDC",
        recipient: MEV_TARGET_POOL,
        chain: "base-sepolia",
        slippageBps: 9800,
      },
      overrides: {
        allowedRecipients: [ESTABLISHED_POOL_ONE, ESTABLISHED_POOL_TWO],
        slippageProtection: { enabled: true, maxSlippageBps: 50 },
      },
    },
  ];

  return incidents.map((incident) => {
    const protectedPolicy = buildProtectedPolicy(policy, incident.overrides);
    const result = canAgentSpendWithPolicy(protectedPolicy, incident.request, currentDailySpent);
    const triggeredGuards = detectTriggeredGuards(protectedPolicy, incident.request, currentDailySpent);

    return {
      id: incident.id,
      title: incident.title,
      date: incident.date,
      loss: incident.loss,
      rootCause: incident.rootCause,
      vcrFields: incident.vcrFields,
      summary: incident.summary,
      x402Request: incident.request,
      protectedPolicy: {
        maxTransaction: protectedPolicy.constraints.maxTransaction.amount,
        allowedRecipients: protectedPolicy.constraints.allowedRecipients,
        allowedChains: protectedPolicy.constraints.allowedChains,
        slippageProtection: protectedPolicy.constraints.slippageProtection,
      },
      triggeredGuards,
      result,
    };
  });
}
