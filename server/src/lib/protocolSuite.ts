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
  scenarios: ProtocolSuiteScenarioResult[];
}

function minBigInt(values: bigint[]): bigint {
  return values.reduce((smallest, value) => (value < smallest ? value : smallest));
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

  const preferredAmount = BigInt(defaults.amount);
  const amount = minBigInt([preferredAmount, maxTransaction, remaining]);
  if (amount <= 0n) {
    return null;
  }

  return {
    amount: amount.toString(),
    token: policy.constraints.allowedTokens[0] ?? defaults.token,
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
  const allowedRequest = buildAllowedMicropaymentRequest(policy, currentDailySpent, defaults);
  const maxTransaction = BigInt(policy.constraints.maxTransaction.amount);
  const dailyLimit = BigInt(policy.constraints.dailyLimit.amount);

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
    scenarios.push({
      id: "allowed-micropayment",
      label: "Allowed micropayment",
      description: "Uses an allowed recipient, token, chain, and an amount within the live policy budget.",
      expectedAllowed: true,
      request: allowedRequest,
      dailySpentAtCheck: currentDailySpent,
      simulated: false,
    });
  }

  scenarios.push({
    id: "blocked-recipient",
    label: "Blocked recipient",
    description: "Uses an address that is not on the policy whitelist.",
    expectedAllowed: false,
    request: {
      amount: allowedRequest?.amount ?? defaults.amount,
      token: allowedRequest?.token ?? defaults.token,
      chain: allowedRequest?.chain ?? defaults.network,
      recipient: "0x000000000000000000000000000000000000dEaD",
    },
    dailySpentAtCheck: currentDailySpent,
    simulated: false,
  });

  scenarios.push({
    id: "blocked-token",
    label: "Blocked token",
    description: "Uses a token outside the policy allowlist.",
    expectedAllowed: false,
    request: {
      amount: allowedRequest?.amount ?? defaults.amount,
      recipient: allowedRequest?.recipient ?? policy.constraints.allowedRecipients[0] ?? defaults.recipient,
      chain: allowedRequest?.chain ?? defaults.network,
      token: "DAI",
    },
    dailySpentAtCheck: currentDailySpent,
    simulated: false,
  });

  scenarios.push({
    id: "blocked-chain",
    label: "Blocked chain",
    description: "Uses a chain outside the policy allowlist.",
    expectedAllowed: false,
    request: {
      amount: allowedRequest?.amount ?? defaults.amount,
      recipient: allowedRequest?.recipient ?? policy.constraints.allowedRecipients[0] ?? defaults.recipient,
      token: allowedRequest?.token ?? defaults.token,
      chain: "ethereum",
    },
    dailySpentAtCheck: currentDailySpent,
    simulated: false,
  });

  scenarios.push({
    id: "blocked-max-transaction",
    label: "Blocked max transaction",
    description: "Uses an amount one base unit above the policy max transaction size.",
    expectedAllowed: false,
    request: {
      amount: (maxTransaction + 1n).toString(),
      recipient: allowedRequest?.recipient ?? policy.constraints.allowedRecipients[0] ?? defaults.recipient,
      token: allowedRequest?.token ?? defaults.token,
      chain: allowedRequest?.chain ?? defaults.network,
    },
    dailySpentAtCheck: currentDailySpent,
    simulated: false,
  });

  let simulatedDailyFailure = false;
  if (allowedRequest) {
    const amount = BigInt(allowedRequest.amount);
    const simulatedSpent = dailyLimit >= amount ? dailyLimit - amount + 1n : dailyLimit;

    if (simulatedSpent >= 0n) {
      simulatedDailyFailure = true;
      scenarios.push({
        id: "blocked-daily-limit",
        label: "Blocked daily limit",
        description: "Simulates the same micropayment after the daily budget has nearly been exhausted.",
        expectedAllowed: false,
        request: allowedRequest,
        dailySpentAtCheck: simulatedSpent.toString(),
        simulated: true,
      });
    }
  }

  const results: ProtocolSuiteScenarioResult[] = scenarios.map((scenario) => {
    const evaluation = canAgentSpendWithPolicy(
      policy,
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
      maxTransaction: policy.constraints.maxTransaction.amount,
      dailyLimit: policy.constraints.dailyLimit.amount,
      allowedTokens: policy.constraints.allowedTokens,
      allowedChains: policy.constraints.allowedChains,
      allowedRecipients: policy.constraints.allowedRecipients,
    },
    currentDailySpent,
    simulatedDailyFailure,
    scenarios: results,
  };
}
