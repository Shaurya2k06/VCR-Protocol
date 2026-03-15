import { extractPolicyCid, fetchPolicy } from "./policy.js";
import { getVCRPolicyUri } from "./ens.js";
import type { SpendRequest, SpendResult, VCRPolicy } from "./types.js";

export type DailySpentGetter = (
  ensName: string,
  token: string,
) => Promise<string>;

/**
 * Core VCR verification function.
 *
 * Checks all policy constraints against a proposed spend request:
 *   1. Policy exists (ENS text record + IPFS fetch)
 *   2. Max transaction amount
 *   3. Recipient whitelist
 *   4. Token allowlist
 *   5. Chain allowlist
 *   6. Time-of-day restriction
 *   7. Daily cumulative limit
 *
 * @param ensName        - Agent's ENS name (e.g. "myagent.eth")
 * @param req            - Spend request to validate
 * @param getDailySpent  - Async function returning cumulative daily spend (base units)
 */
export async function canAgentSpend(
  ensName: string,
  req: SpendRequest,
  getDailySpent: DailySpentGetter,
): Promise<SpendResult> {
  // ── 1. Fetch policy URI from ENS ────────────────────────────────────────────
  let policyUri: string | null;
  try {
    policyUri = await getVCRPolicyUri(ensName);
  } catch (err) {
    return {
      allowed: false,
      reason: `ENS lookup failed: ${(err as Error).message}`,
    };
  }

  if (!policyUri) {
    return { allowed: false, reason: "No VCR policy pointer found on ENS" };
  }

  // ── 2. Fetch policy JSON from IPFS ──────────────────────────────────────────
  let policy: VCRPolicy;
  const policyCid = extractPolicyCid(policyUri);
  try {
    policy = await fetchPolicy(policyUri);
  } catch (err) {
    return {
      allowed: false,
      reason: `IPFS fetch failed: ${(err as Error).message}`,
      policyCid,
    };
  }

  // ── 3. Policy expiry check ──────────────────────────────────────────────────
  if (policy.metadata.expiresAt) {
    if (new Date() > new Date(policy.metadata.expiresAt)) {
      return {
        allowed: false,
        reason: "Policy has expired",
        policy,
        policyCid,
      };
    }
  }

  // ── 4. Max transaction amount ───────────────────────────────────────────────
  const maxTx = BigInt(policy.constraints.maxTransaction.amount);
  const reqAmount = BigInt(req.amount);
  if (reqAmount > maxTx) {
    return {
      allowed: false,
      reason: `Exceeds max transaction (${req.amount} > ${maxTx.toString()})`,
      policy,
      policyCid,
    };
  }

  // ── 5. Recipient whitelist ──────────────────────────────────────────────────
  const normalizedRecipient = req.recipient.toLowerCase();
  const allowedRecipients = policy.constraints.allowedRecipients.map((r) =>
    r.toLowerCase(),
  );
  if (!allowedRecipients.includes(normalizedRecipient)) {
    return {
      allowed: false,
      reason: `Recipient ${req.recipient} is not in the whitelist`,
      policy,
      policyCid,
    };
  }

  // ── 6. Token allowlist ──────────────────────────────────────────────────────
  if (!policy.constraints.allowedTokens.includes(req.token)) {
    return {
      allowed: false,
      reason: `Token ${req.token} is not allowed. Allowed: ${policy.constraints.allowedTokens.join(", ")}`,
      policy,
      policyCid,
    };
  }

  // ── 7. Chain allowlist ──────────────────────────────────────────────────────
  if (!policy.constraints.allowedChains.includes(req.chain)) {
    return {
      allowed: false,
      reason: `Chain ${req.chain} is not allowed. Allowed: ${policy.constraints.allowedChains.join(", ")}`,
      policy,
      policyCid,
    };
  }

  // ── 8. Slippage restriction ─────────────────────────────────────────────────
  if (policy.constraints.slippageProtection?.enabled) {
    if (typeof req.slippageBps !== "number" || Number.isNaN(req.slippageBps)) {
      return {
        allowed: false,
        reason: "Slippage estimate is required for this policy",
        policy,
        policyCid,
      };
    }

    if (req.slippageBps > policy.constraints.slippageProtection.maxSlippageBps) {
      return {
        allowed: false,
        reason: `Slippage ${req.slippageBps} bps exceeds max allowed ${policy.constraints.slippageProtection.maxSlippageBps} bps`,
        policy,
        policyCid,
      };
    }
  }

  // ── 9. Time-of-day restriction ──────────────────────────────────────────────
  if (policy.constraints.timeRestrictions) {
    const [start, end] = policy.constraints.timeRestrictions.allowedHours;
    const utcHour = new Date().getUTCHours();
    if (utcHour < start || utcHour >= end) {
      return {
        allowed: false,
        reason: `Outside allowed UTC hours: ${start}:00–${end}:00. Current UTC hour: ${utcHour}`,
        policy,
        policyCid,
      };
    }
  }

  // ── 10. Daily cumulative limit ──────────────────────────────────────────────
  let dailySpent: string;
  try {
    dailySpent = await getDailySpent(ensName, req.token);
  } catch (err) {
    return {
      allowed: false,
      reason: `Daily spend lookup failed: ${(err as Error).message}`,
      policy,
      policyCid,
    };
  }

  const dailyLimit = BigInt(policy.constraints.dailyLimit.amount);
  const projectedSpend = BigInt(dailySpent) + reqAmount;
  if (projectedSpend > dailyLimit) {
    return {
      allowed: false,
      reason: `Daily limit exceeded (would spend ${projectedSpend.toString()}, limit is ${dailyLimit.toString()})`,
      policy,
      policyCid,
      dailySpentAtCheck: dailySpent,
    };
  }

  return {
    allowed: true,
    policy,
    policyCid,
    dailySpentAtCheck: dailySpent,
  };
}

/**
 * Verify all policy constraints using a pre-fetched policy object
 * (skips ENS + IPFS fetch — useful for local testing or cached policies).
 */
export function canAgentSpendWithPolicy(
  policy: VCRPolicy,
  req: SpendRequest,
  dailySpent: string,
): SpendResult {
  const maxTx = BigInt(policy.constraints.maxTransaction.amount);
  const reqAmount = BigInt(req.amount);

  // Policy expiry check
  if (policy.metadata.expiresAt) {
    if (new Date() > new Date(policy.metadata.expiresAt)) {
      return { allowed: false, reason: "Policy has expired", policy };
    }
  }

  if (reqAmount > maxTx) {
    return {
      allowed: false,
      reason: `Exceeds max transaction (${req.amount} > ${maxTx.toString()})`,
      policy,
    };
  }

  const normalizedRecipient = req.recipient.toLowerCase();
  if (
    !policy.constraints.allowedRecipients
      .map((r) => r.toLowerCase())
      .includes(normalizedRecipient)
  ) {
    return {
      allowed: false,
      reason: `Recipient ${req.recipient} is not in the whitelist`,
      policy,
    };
  }

  if (!policy.constraints.allowedTokens.includes(req.token)) {
    return {
      allowed: false,
      reason: `Token ${req.token} is not allowed. Allowed: ${policy.constraints.allowedTokens.join(", ")}`,
      policy,
    };
  }

  if (!policy.constraints.allowedChains.includes(req.chain)) {
    return {
      allowed: false,
      reason: `Chain ${req.chain} is not allowed. Allowed: ${policy.constraints.allowedChains.join(", ")}`,
      policy,
    };
  }

  if (policy.constraints.slippageProtection?.enabled) {
    if (typeof req.slippageBps !== "number" || Number.isNaN(req.slippageBps)) {
      return {
        allowed: false,
        reason: "Slippage estimate is required for this policy",
        policy,
      };
    }

    if (req.slippageBps > policy.constraints.slippageProtection.maxSlippageBps) {
      return {
        allowed: false,
        reason: `Slippage ${req.slippageBps} bps exceeds max allowed ${policy.constraints.slippageProtection.maxSlippageBps} bps`,
        policy,
      };
    }
  }

  if (policy.constraints.timeRestrictions) {
    const [start, end] = policy.constraints.timeRestrictions.allowedHours;
    const utcHour = new Date().getUTCHours();
    if (utcHour < start || utcHour >= end) {
      return {
        allowed: false,
        reason: `Outside allowed UTC hours: ${start}:00–${end}:00. Current UTC hour: ${utcHour}`,
        policy,
      };
    }
  }

  const dailyLimit = BigInt(policy.constraints.dailyLimit.amount);
  if (BigInt(dailySpent) + reqAmount > dailyLimit) {
    const projectedSpend = BigInt(dailySpent) + reqAmount;
    return {
      allowed: false,
      reason: `Daily limit exceeded (would spend ${projectedSpend.toString()}, limit is ${dailyLimit.toString()})`,
      policy,
      dailySpentAtCheck: dailySpent,
    };
  }

  return { allowed: true, policy, dailySpentAtCheck: dailySpent };
}
