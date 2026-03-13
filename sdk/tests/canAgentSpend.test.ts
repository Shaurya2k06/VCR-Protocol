// ─── VCR Protocol SDK — Verifier Tests (zero mocks) ──────────────────────────
// All tests use canAgentSpendWithPolicy() — the pure synchronous function that
// contains the complete constraint-enforcement logic.
//
// canAgentSpend() is just a thin async wrapper that resolves ENS → IPFS first,
// then delegates to this same logic. Testing canAgentSpendWithPolicy() gives
// full coverage of every policy rule without touching the network.

import { describe, it, expect, beforeEach } from "vitest";
import { canAgentSpendWithPolicy } from "../src/verifier.js";
import {
  getDailySpent,
  recordSpend,
  clearAllSpendData,
} from "../src/spendTracker.js";
import type { VCRPolicy, VCRConstraints, SpendRequest } from "../src/types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const RECIPIENT_A = "0xaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA";
const RECIPIENT_B = "0xbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb";
const UNKNOWN = "0x1234567890123456789012345678901234567890";

const AGENT_ID = "eip155:11155111:0x8004A818BFB912233c491871b3d84c89A494BD9e:0";

function baseConstraints(
  overrides: Partial<VCRConstraints> = {},
): VCRConstraints {
  return {
    maxTransaction: { amount: "1000000", token: "USDC", chain: "base-sepolia" }, // $1.00
    dailyLimit: { amount: "5000000", token: "USDC", chain: "base-sepolia" }, // $5.00
    allowedRecipients: [RECIPIENT_A, RECIPIENT_B],
    allowedTokens: ["USDC"],
    allowedChains: ["base-sepolia"],
    ...overrides,
  };
}

function makePolicy(overrides: Partial<VCRPolicy> = {}): VCRPolicy {
  return {
    version: "1.0",
    agentId: AGENT_ID,
    constraints: baseConstraints(),
    metadata: {
      createdAt: new Date().toISOString(),
      createdBy: "0xOwner",
    },
    ...overrides,
  };
}

function makeRequest(overrides: Partial<SpendRequest> = {}): SpendRequest {
  return {
    amount: "100000", // $0.10
    token: "USDC",
    recipient: RECIPIENT_A,
    chain: "base-sepolia",
    ...overrides,
  };
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe("canAgentSpendWithPolicy — allowed", () => {
  it("allows a fully valid spend", () => {
    const result = canAgentSpendWithPolicy(makePolicy(), makeRequest(), "0");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("returns the policy in the result when allowed", () => {
    const policy = makePolicy();
    const result = canAgentSpendWithPolicy(policy, makeRequest(), "0");
    expect(result.policy).toStrictEqual(policy);
  });

  it("returns dailySpentAtCheck in the result when allowed", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest(),
      "250000",
    );
    expect(result.dailySpentAtCheck).toBe("250000");
  });

  it("allows amount equal to maxTransaction exactly (inclusive boundary)", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ amount: "1000000" }),
      "0",
    );
    expect(result.allowed).toBe(true);
  });

  it("allows projected spend equal to dailyLimit exactly (inclusive boundary)", () => {
    // already spent $4.50, requesting $0.50 → total = $5.00 = limit
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ amount: "500000" }),
      "4500000",
    );
    expect(result.allowed).toBe(true);
  });

  it("allows RECIPIENT_B (second whitelisted address)", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ recipient: RECIPIENT_B }),
      "0",
    );
    expect(result.allowed).toBe(true);
  });

  it("allows when no expiresAt field is present", () => {
    const policy = makePolicy();
    delete policy.metadata.expiresAt;
    const result = canAgentSpendWithPolicy(policy, makeRequest(), "0");
    expect(result.allowed).toBe(true);
  });

  it("allows a policy that expires far in the future", () => {
    const policy = makePolicy({
      metadata: {
        createdAt: new Date().toISOString(),
        createdBy: "0xOwner",
        expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
      },
    });
    const result = canAgentSpendWithPolicy(policy, makeRequest(), "0");
    expect(result.allowed).toBe(true);
  });

  it("allows when no timeRestrictions are set", () => {
    const policy = makePolicy({
      constraints: baseConstraints({ timeRestrictions: undefined }),
    });
    const result = canAgentSpendWithPolicy(policy, makeRequest(), "0");
    expect(result.allowed).toBe(true);
  });

  it("allows USDT when policy whitelists both USDC and USDT", () => {
    const policy = makePolicy({
      constraints: baseConstraints({ allowedTokens: ["USDC", "USDT"] }),
    });
    expect(
      canAgentSpendWithPolicy(policy, makeRequest({ token: "USDC" }), "0")
        .allowed,
    ).toBe(true);
    expect(
      canAgentSpendWithPolicy(policy, makeRequest({ token: "USDT" }), "0")
        .allowed,
    ).toBe(true);
  });

  it("allows base when policy whitelists both base-sepolia and base", () => {
    const policy = makePolicy({
      constraints: baseConstraints({ allowedChains: ["base-sepolia", "base"] }),
    });
    expect(
      canAgentSpendWithPolicy(
        policy,
        makeRequest({ chain: "base-sepolia" }),
        "0",
      ).allowed,
    ).toBe(true);
    expect(
      canAgentSpendWithPolicy(policy, makeRequest({ chain: "base" }), "0")
        .allowed,
    ).toBe(true);
  });
});

// ─── Max transaction amount ───────────────────────────────────────────────────

describe("canAgentSpendWithPolicy — max transaction", () => {
  it("blocks when amount exceeds maxTransaction by 1 (exclusive boundary)", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ amount: "1000001" }),
      "0",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/max transaction/i);
  });

  it("blocks when amount is far over maxTransaction", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ amount: "99999999" }),
      "0",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/max transaction/i);
  });

  it("includes the policy in the result when blocked by max transaction", () => {
    const policy = makePolicy();
    const result = canAgentSpendWithPolicy(
      policy,
      makeRequest({ amount: "2000000" }),
      "0",
    );
    expect(result.policy).toStrictEqual(policy);
  });

  it("blocks even when dailyLimit would still have room", () => {
    // maxTx = 1_000_000; asking for 1_500_000; daily spent = 0 (plenty of room)
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ amount: "1500000" }),
      "0",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/max transaction/i);
  });
});

// ─── Recipient whitelist ──────────────────────────────────────────────────────

describe("canAgentSpendWithPolicy — recipient whitelist", () => {
  it("blocks an address not in allowedRecipients", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ recipient: UNKNOWN }),
      "0",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not in the whitelist/i);
  });

  it("includes the blocked address in the reason", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ recipient: UNKNOWN }),
      "0",
    );
    expect(result.reason).toContain(UNKNOWN);
  });

  it("check is case-insensitive — uppercase RECIPIENT_A is allowed", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ recipient: RECIPIENT_A.toUpperCase() }),
      "0",
    );
    expect(result.allowed).toBe(true);
  });

  it("check is case-insensitive — lowercase RECIPIENT_A is allowed", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ recipient: RECIPIENT_A.toLowerCase() }),
      "0",
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks an address that differs from a whitelisted one by a single character", () => {
    // Flip the last char of RECIPIENT_A
    const almost =
      RECIPIENT_A.slice(0, -1) + (RECIPIENT_A.endsWith("A") ? "B" : "A");
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ recipient: almost }),
      "0",
    );
    expect(result.allowed).toBe(false);
  });

  it("blocks the zero address when it is not whitelisted", () => {
    const zero = "0x0000000000000000000000000000000000000000";
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ recipient: zero }),
      "0",
    );
    expect(result.allowed).toBe(false);
  });

  it("allows the zero address when it is explicitly whitelisted", () => {
    const zero = "0x0000000000000000000000000000000000000000";
    const policy = makePolicy({
      constraints: baseConstraints({ allowedRecipients: [zero] }),
    });
    const result = canAgentSpendWithPolicy(
      policy,
      makeRequest({ recipient: zero }),
      "0",
    );
    expect(result.allowed).toBe(true);
  });
});

// ─── Token allowlist ──────────────────────────────────────────────────────────

describe("canAgentSpendWithPolicy — token allowlist", () => {
  it("blocks a token not in allowedTokens", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ token: "DAI" }),
      "0",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("DAI");
  });

  it("blocks ETH when only USDC is whitelisted", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ token: "ETH" }),
      "0",
    );
    expect(result.allowed).toBe(false);
  });

  it("token matching is case-sensitive — 'usdc' != 'USDC'", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ token: "usdc" }),
      "0",
    );
    expect(result.allowed).toBe(false);
  });

  it("reason includes the disallowed token name", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ token: "WBTC" }),
      "0",
    );
    expect(result.reason).toContain("WBTC");
  });
});

// ─── Chain allowlist ──────────────────────────────────────────────────────────

describe("canAgentSpendWithPolicy — chain allowlist", () => {
  it("blocks a chain not in allowedChains", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ chain: "mainnet" }),
      "0",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("mainnet");
  });

  it("blocks 'base' when only 'base-sepolia' is whitelisted", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ chain: "base" }),
      "0",
    );
    expect(result.allowed).toBe(false);
  });

  it("chain matching is case-sensitive — 'BASE-SEPOLIA' != 'base-sepolia'", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ chain: "BASE-SEPOLIA" }),
      "0",
    );
    expect(result.allowed).toBe(false);
  });
});

// ─── Daily cumulative limit ───────────────────────────────────────────────────

describe("canAgentSpendWithPolicy — daily limit", () => {
  it("blocks when projected spend exceeds dailyLimit by 1 (exclusive boundary)", () => {
    // dailyLimit=5_000_000; spent=4_500_000; requesting 500_001 → over by 1
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ amount: "500001" }),
      "4500000",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/daily limit/i);
  });

  it("blocks when dailySpent alone already equals dailyLimit (any new spend blocked)", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ amount: "1" }),
      "5000000",
    );
    expect(result.allowed).toBe(false);
  });

  it("blocks when dailySpent exceeds dailyLimit (already over)", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ amount: "1" }),
      "9999999",
    );
    expect(result.allowed).toBe(false);
  });

  it("includes dailySpentAtCheck in the result when blocked by daily limit", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ amount: "999999" }),
      "4500000",
    );
    expect(result.dailySpentAtCheck).toBe("4500000");
  });

  it("reason message contains the limit value", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ amount: "999999" }),
      "4500000",
    );
    expect(result.reason).toContain("5000000");
  });

  it("handles very large BigInt amounts without overflow", () => {
    // 1 billion USDC daily limit, 999 million spent, requesting 2 million → over
    const bigPolicy = makePolicy({
      constraints: baseConstraints({
        maxTransaction: {
          amount: "2000000000000",
          token: "USDC",
          chain: "base-sepolia",
        },
        dailyLimit: {
          amount: "1000000000000000",
          token: "USDC",
          chain: "base-sepolia",
        },
      }),
    });
    const result = canAgentSpendWithPolicy(
      bigPolicy,
      makeRequest({ amount: "2000000000000" }),
      "999000000000000",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/daily limit/i);
  });
});

// ─── Policy expiry ────────────────────────────────────────────────────────────

describe("canAgentSpendWithPolicy — policy expiry", () => {
  it("blocks when policy expired 1 second ago", () => {
    const policy = makePolicy({
      metadata: {
        createdAt: new Date(Date.now() - 86_400_000).toISOString(),
        createdBy: "0xOwner",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      },
    });
    const result = canAgentSpendWithPolicy(policy, makeRequest(), "0");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/expired/i);
  });

  it("blocks when policy expired 1 year ago", () => {
    const policy = makePolicy({
      metadata: {
        createdAt: new Date(Date.now() - 2 * 365 * 86_400_000).toISOString(),
        createdBy: "0xOwner",
        expiresAt: new Date(Date.now() - 365 * 86_400_000).toISOString(),
      },
    });
    const result = canAgentSpendWithPolicy(policy, makeRequest(), "0");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/expired/i);
  });

  it("includes the policy in the result when blocked by expiry", () => {
    const policy = makePolicy({
      metadata: {
        createdAt: new Date().toISOString(),
        createdBy: "0xOwner",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      },
    });
    const result = canAgentSpendWithPolicy(policy, makeRequest(), "0");
    expect(result.policy).toStrictEqual(policy);
  });
});

// ─── Time restrictions ────────────────────────────────────────────────────────

describe("canAgentSpendWithPolicy — time restrictions", () => {
  it("blocks when UTC hour is before allowedHours start", () => {
    // Force a time outside the window by picking an hour window that excludes
    // all 24 hours except one we control — use 0-width window trick:
    // allowedHours [0, 24] covers everything; [1, 1] covers nothing.
    // Instead, pick the current UTC hour and set the window to exclude it.
    const currentHour = new Date().getUTCHours();
    // Allowed window: [currentHour+1, currentHour+2] (both modulo 24, capped)
    // This guarantees the current hour is NOT in the window.
    const start = Math.min(currentHour + 1, 23);
    const end = Math.min(currentHour + 2, 24);
    if (start >= end) return; // edge case: skip if we can't form a valid non-current window

    const policy = makePolicy({
      constraints: baseConstraints({
        timeRestrictions: { timezone: "UTC", allowedHours: [start, end] },
      }),
    });
    const result = canAgentSpendWithPolicy(policy, makeRequest(), "0");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/outside allowed.*hours/i);
  });

  it("allows when the allowed window covers the full day [0, 24]", () => {
    // [0, 24] covers all 24 hours — always passes regardless of current time
    const policy = makePolicy({
      constraints: baseConstraints({
        timeRestrictions: { timezone: "UTC", allowedHours: [0, 24] },
      }),
    });
    const result = canAgentSpendWithPolicy(policy, makeRequest(), "0");
    expect(result.allowed).toBe(true);
  });

  it("blocks when the allowed window is [currentHour+1, 24] (current hour excluded)", () => {
    const currentHour = new Date().getUTCHours();
    if (currentHour >= 23) return; // can't construct a valid future window; skip

    const policy = makePolicy({
      constraints: baseConstraints({
        timeRestrictions: {
          timezone: "UTC",
          allowedHours: [currentHour + 1, 24],
        },
      }),
    });
    const result = canAgentSpendWithPolicy(policy, makeRequest(), "0");
    expect(result.allowed).toBe(false);
  });

  it("allows when the allowed window includes the current UTC hour", () => {
    const currentHour = new Date().getUTCHours();
    // Window: [0, 24] always includes current hour
    const policy = makePolicy({
      constraints: baseConstraints({
        timeRestrictions: { timezone: "UTC", allowedHours: [0, 24] },
      }),
    });
    const result = canAgentSpendWithPolicy(policy, makeRequest(), "0");
    expect(result.allowed).toBe(true);
  });
});

// ─── Check ordering (earlier checks short-circuit later ones) ─────────────────

describe("canAgentSpendWithPolicy — check ordering", () => {
  it("reports max-transaction before daily-limit when both would fail", () => {
    // amount=2_000_000 > maxTx(1_000_000) AND daily spent=4_999_999 + 2M > dailyLimit
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ amount: "2000000" }),
      "4999999",
    );
    expect(result.reason).toMatch(/max transaction/i);
  });

  it("reports recipient violation before token violation when both would fail", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ recipient: UNKNOWN, token: "DAI" }),
      "0",
    );
    expect(result.reason).toMatch(/not in the whitelist/i);
  });

  it("reports token violation before chain violation when both would fail", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ token: "DAI", chain: "mainnet" }),
      "0",
    );
    expect(result.reason).toContain("DAI");
  });

  it("reports expiry before all other checks", () => {
    const expiredPolicy = makePolicy({
      metadata: {
        createdAt: new Date().toISOString(),
        createdBy: "0xOwner",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      },
    });
    // Everything else would also fail
    const result = canAgentSpendWithPolicy(
      expiredPolicy,
      makeRequest({
        amount: "9999999",
        recipient: UNKNOWN,
        token: "DAI",
        chain: "mainnet",
      }),
      "9999999",
    );
    expect(result.reason).toMatch(/expired/i);
  });
});

// ─── Result shape ─────────────────────────────────────────────────────────────

describe("canAgentSpendWithPolicy — result shape", () => {
  it("returns a synchronous SpendResult (not a Promise)", () => {
    const result = canAgentSpendWithPolicy(makePolicy(), makeRequest(), "0");
    expect(typeof result.allowed).toBe("boolean");
    expect(result).not.toBeInstanceOf(Promise);
  });

  it("allowed result has no reason field", () => {
    const result = canAgentSpendWithPolicy(makePolicy(), makeRequest(), "0");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("blocked result always has a reason string", () => {
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ recipient: UNKNOWN }),
      "0",
    );
    expect(result.allowed).toBe(false);
    expect(typeof result.reason).toBe("string");
    expect(result.reason!.length).toBeGreaterThan(0);
  });

  it("allowed result contains the policy object", () => {
    const policy = makePolicy();
    const result = canAgentSpendWithPolicy(policy, makeRequest(), "0");
    expect(result.policy).toBe(policy);
  });

  it("blocked result contains the policy object", () => {
    const policy = makePolicy();
    const result = canAgentSpendWithPolicy(
      policy,
      makeRequest({ recipient: UNKNOWN }),
      "0",
    );
    expect(result.policy).toBe(policy);
  });
});

// ─── VCR extension fields — no effect on constraint enforcement ───────────────

describe("canAgentSpendWithPolicy — VCR extension fields", () => {
  it("allows a valid spend regardless of which extension fields are present", () => {
    const policy = makePolicy({
      ensName: "researcher-001.acmecorp.eth",
      walletAddress: "0xForwarder",
      custodian: "bitgo",
      network: "hteth",
      policy_hash: "0xdeadbeef",
      ipfs_cid: "bafkreiexample",
    });
    const result = canAgentSpendWithPolicy(policy, makeRequest(), "0");
    expect(result.allowed).toBe(true);
  });

  it("allows a valid spend when all extension fields are absent", () => {
    const policy = makePolicy();
    // Explicitly confirm no extension fields
    expect(policy.ensName).toBeUndefined();
    expect(policy.walletAddress).toBeUndefined();
    const result = canAgentSpendWithPolicy(policy, makeRequest(), "0");
    expect(result.allowed).toBe(true);
  });
});

// ─── Integration with spendTracker ───────────────────────────────────────────
// Shows how canAgentSpendWithPolicy and the spend tracker work together
// as they would in a real application — no mocking required.

describe("spendTracker integration — real accumulation", () => {
  const ENS = "test-agent.acme.eth";
  const TOKEN = "USDC";

  beforeEach(() => {
    clearAllSpendData();
  });

  it("allows a spend when tracker reports zero prior spend", async () => {
    const dailySpent = await getDailySpent(ENS, TOKEN);
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ amount: "500000" }),
      dailySpent,
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks a spend after the tracker records enough prior spend to hit the limit", async () => {
    // Record $4.80 of prior spend
    await recordSpend(ENS, TOKEN, "4800000", RECIPIENT_A);

    const dailySpent = await getDailySpent(ENS, TOKEN);
    expect(dailySpent).toBe("4800000");

    // Try to spend $0.30 — would push total to $5.10, over the $5.00 limit
    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ amount: "300000" }),
      dailySpent,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/daily limit/i);
  });

  it("allows a spend right up to the limit and blocks the next one", async () => {
    const policy = makePolicy();

    // Spend $4.50 — still $0.50 remaining
    await recordSpend(ENS, TOKEN, "4500000", RECIPIENT_A);
    const spent1 = await getDailySpent(ENS, TOKEN);
    const r1 = canAgentSpendWithPolicy(
      policy,
      makeRequest({ amount: "500000" }),
      spent1,
    );
    expect(r1.allowed).toBe(true); // $4.50 + $0.50 = $5.00 exactly ✓

    // Now actually record that $0.50 spend
    await recordSpend(ENS, TOKEN, "500000", RECIPIENT_A);
    const spent2 = await getDailySpent(ENS, TOKEN);
    expect(spent2).toBe("5000000"); // exactly at limit

    // Any new spend must be blocked
    const r2 = canAgentSpendWithPolicy(
      policy,
      makeRequest({ amount: "1" }),
      spent2,
    );
    expect(r2.allowed).toBe(false);
  });

  it("accumulates spend across multiple recordSpend calls correctly", async () => {
    await recordSpend(ENS, TOKEN, "100000");
    await recordSpend(ENS, TOKEN, "200000");
    await recordSpend(ENS, TOKEN, "300000");

    const dailySpent = await getDailySpent(ENS, TOKEN);
    expect(dailySpent).toBe("600000"); // $0.60 total

    const result = canAgentSpendWithPolicy(
      makePolicy(),
      makeRequest({ amount: "400000" }), // $0.40 more = $1.00 total — under $5 limit
      dailySpent,
    );
    expect(result.allowed).toBe(true);
  });

  it("tracks different tokens independently", async () => {
    const policy = makePolicy({
      constraints: baseConstraints({ allowedTokens: ["USDC", "USDT"] }),
    });

    // Spend all USDC daily limit
    await recordSpend(ENS, "USDC", "5000000");
    // USDT has zero spend
    await recordSpend(ENS, "USDT", "0");

    const usdcSpent = await getDailySpent(ENS, "USDC");
    const usdtSpent = await getDailySpent(ENS, "USDT");

    // USDC: blocked (at limit)
    const r1 = canAgentSpendWithPolicy(
      policy,
      makeRequest({ token: "USDC", amount: "1" }),
      usdcSpent,
    );
    expect(r1.allowed).toBe(false);

    // USDT: allowed (fresh limit)
    const r2 = canAgentSpendWithPolicy(
      policy,
      makeRequest({ token: "USDT", amount: "100000" }),
      usdtSpent,
    );
    expect(r2.allowed).toBe(true);
  });
});
