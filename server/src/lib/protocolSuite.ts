import { canAgentSpendWithPolicy } from "@vcr-protocol/sdk";
import type { SpendRequest, VCRPolicy } from "@vcr-protocol/sdk";

export interface ProtocolSuiteConfig {
  amount: string;
  token: string;
  recipient: string;
  network: string;
}

export interface ProtocolSuiteScenarioResult {
  id: string;
  label: string;
  description: string;
  request: SpendRequest;
  expectedAllowed: boolean;
  actualAllowed: boolean;
  passed: boolean;
  reason?: string;
  dailySpentAtCheck: string;
  simulated: boolean;
}

export interface ProtocolSuiteResult {
  ensName: string;
  policy: {
    ensName?: string;
    description?: string;
    maxTransaction: string;
    dailyLimit: string;
    allowedTokens: string[];
    allowedChains: string[];
    allowedRecipients: string[];
  };
  currentDailySpent: string;
  simulatedDailyFailure: boolean;
  demoAdjustedTimeWindow: boolean;
  scenarios: ProtocolSuiteScenarioResult[];
}

function minBigInt(values: bigint[]): bigint {
  return values.reduce((smallest, value) => (value < smallest ? value : smallest));
}

function maxBigInt(values: bigint[]): bigint {
  return values.reduce((largest, value) => (value > largest ? value : largest));
}

function choosePreferredAllowedAmount(defaults: ProtocolSuiteConfig, token: string): bigint {
  const normalizedToken = token.toLowerCase();
  if (normalizedToken.includes("eth")) {
    // 0.001 ETH in wei for hteth/eth-style demo constraints.
    return 1_000_000_000_000_000n;
  }

  const parsed = BigInt(defaults.amount);
  return parsed > 0n ? parsed : 100_000n;
}

function buildAllowedMicropaymentRequest(
  policy: VCRPolicy,
  currentDailySpent: string,
  defaults: ProtocolSuiteConfig,
): SpendRequest | null {
  const maxTransaction = BigInt(policy.constraints.maxTransaction.amount);
  const dailyLimit = BigInt(policy.constraints.dailyLimit.amount);
  const spent = BigInt(currentDailySpent);
  const remaining = dailyLimit > spent ? dailyLimit - spent : 0n;

  if (remaining <= 0n) {
    return null;
  }

  const token = policy.constraints.allowedTokens[0] ?? defaults.token;
  const preferredAmount = choosePreferredAllowedAmount(defaults, token);
  const amount = minBigInt([preferredAmount, maxTransaction, remaining]);
  if (amount <= 0n) {
    return null;
  }

  return {
    amount: amount.toString(),
    token,
    recipient: policy.constraints.allowedRecipients[0] ?? defaults.recipient,
    chain: policy.constraints.allowedChains[0] ?? defaults.network,
  };
}

export function buildProtocolSuite(
  ensName: string,
  policy: VCRPolicy,
  currentDailySpent: string,
  defaults: ProtocolSuiteConfig,
): ProtocolSuiteResult {
  const demoAdjustedTimeWindow = Boolean(policy.constraints.timeRestrictions);
  const suitePolicy: VCRPolicy = demoAdjustedTimeWindow
    ? {
        ...policy,
        constraints: {
          ...policy.constraints,
          timeRestrictions: { timezone: "UTC", allowedHours: [0, 24] },
        },
      }
    : policy;

  const allowedRequest = buildAllowedMicropaymentRequest(suitePolicy, currentDailySpent, defaults);
  const maxTransaction = BigInt(suitePolicy.constraints.maxTransaction.amount);
  const dailyLimit = BigInt(suitePolicy.constraints.dailyLimit.amount);
  const defaultToken = suitePolicy.constraints.allowedTokens[0] ?? defaults.token;
  const defaultChain = suitePolicy.constraints.allowedChains[0] ?? defaults.network;
  const defaultRecipient = suitePolicy.constraints.allowedRecipients[0] ?? defaults.recipient;

  const scenarios: Array<{
    id: string;
    label: string;
    description: string;
    expectedAllowed: boolean;
    request: SpendRequest;
    dailySpentAtCheck: string;
    simulated: boolean;
  }> = [];

  if (allowedRequest) {
    const secondaryRecipient =
      suitePolicy.constraints.allowedRecipients[1] ??
      suitePolicy.constraints.allowedRecipients[0] ??
      defaults.recipient;

    scenarios.push({
      id: "allowed-micropayment",
      label: "Allowed micropayment",
      description: "Uses an allowed recipient, token, chain, and a small amount within policy bounds.",
      expectedAllowed: true,
      request: allowedRequest,
      dailySpentAtCheck: currentDailySpent,
      simulated: false,
    });

    const followUpAmount = minBigInt([BigInt(allowedRequest.amount), maxTransaction]);

    if (followUpAmount > 0n) {
      scenarios.push({
        id: "allowed-second-recipient",
        label: "Allowed second recipient",
        description: "A second send to another whitelisted recipient also clears the same live policy checks.",
        expectedAllowed: true,
        request: {
          ...allowedRequest,
          amount: followUpAmount.toString(),
          recipient: secondaryRecipient,
        },
        dailySpentAtCheck: currentDailySpent,
        simulated: false,
      });
    }
  }

  scenarios.push({
    id: "blocked-recipient",
    label: "Blocked recipient",
    description: "Uses an address that is not on the policy whitelist.",
    expectedAllowed: false,
    request: {
      amount: allowedRequest?.amount ?? defaults.amount,
      token: allowedRequest?.token ?? defaultToken,
      chain: allowedRequest?.chain ?? defaultChain,
      recipient: "0x000000000000000000000000000000000000dEaD",
    },
    dailySpentAtCheck: currentDailySpent,
    simulated: false,
  });

  scenarios.push({
    id: "blocked-over-limit",
    label: "Blocked over-limit amount",
    description: "Uses a larger transfer amount that exceeds the policy max transaction threshold.",
    expectedAllowed: false,
    request: {
      amount: maxBigInt([
        maxTransaction + 1n,
        (allowedRequest ? BigInt(allowedRequest.amount) : BigInt(defaults.amount)) * 9n,
      ]).toString(),
      recipient: allowedRequest?.recipient ?? defaultRecipient,
      token: allowedRequest?.token ?? defaultToken,
      chain: allowedRequest?.chain ?? defaultChain,
    },
    dailySpentAtCheck: currentDailySpent,
    simulated: false,
  });

  // Daily-limit scenario: evaluate after two successful sends.
  // We choose an amount that exceeds remaining daily budget while trying to
  // stay <= maxTransaction when possible.
  const firstAmount = allowedRequest ? BigInt(allowedRequest.amount) : 0n;
  const secondAmount = scenarios.find((s) => s.id === "allowed-second-recipient")
    ? BigInt(scenarios.find((s) => s.id === "allowed-second-recipient")!.request.amount)
    : firstAmount;
  const spentAfterTwo = BigInt(currentDailySpent) + firstAmount + secondAmount;
  const remainingAfterTwo = dailyLimit > spentAfterTwo ? dailyLimit - spentAfterTwo : 0n;
  const dailyBlockAmount =
    remainingAfterTwo < maxTransaction
      ? remainingAfterTwo + 1n
      : minBigInt([maxTransaction, firstAmount > 0n ? firstAmount : maxTransaction]);

  const simulatedDailySpentAtCheck =
    remainingAfterTwo < maxTransaction
      ? spentAfterTwo.toString()
      : maxBigInt([0n, dailyLimit - dailyBlockAmount + 1n]).toString();

  scenarios.push({
    id: "blocked-daily-limit",
    label: "Blocked daily limit",
    description:
      "Evaluates after prior successful sends; request is denied because cumulative spend would exceed the daily limit.",
    expectedAllowed: false,
    request: {
      amount: dailyBlockAmount.toString(),
      recipient: allowedRequest?.recipient ?? defaultRecipient,
      token: allowedRequest?.token ?? defaultToken,
      chain: allowedRequest?.chain ?? defaultChain,
    },
    dailySpentAtCheck: simulatedDailySpentAtCheck,
    simulated: simulatedDailySpentAtCheck !== spentAfterTwo.toString(),
  });

  const results: ProtocolSuiteScenarioResult[] = scenarios.map((scenario) => {
    const evaluation = canAgentSpendWithPolicy(
      suitePolicy,
      scenario.request,
      scenario.dailySpentAtCheck,
    );

    return {
      id: scenario.id,
      label: scenario.label,
      description: scenario.description,
      request: scenario.request,
      expectedAllowed: scenario.expectedAllowed,
      actualAllowed: evaluation.allowed,
      passed: evaluation.allowed === scenario.expectedAllowed,
      reason: evaluation.reason,
      dailySpentAtCheck: scenario.dailySpentAtCheck,
      simulated: scenario.simulated,
    };
  });

  return {
    ensName,
    policy: {
      ensName: policy.ensName,
      description: policy.metadata.description,
      maxTransaction: suitePolicy.constraints.maxTransaction.amount,
      dailyLimit: suitePolicy.constraints.dailyLimit.amount,
      allowedTokens: suitePolicy.constraints.allowedTokens,
      allowedChains: suitePolicy.constraints.allowedChains,
      allowedRecipients: suitePolicy.constraints.allowedRecipients,
    },
    currentDailySpent,
    simulatedDailyFailure: false,
    demoAdjustedTimeWindow,
    scenarios: results,
  };
}
