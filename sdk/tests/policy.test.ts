// ─── VCR Protocol SDK — Policy Tests ─────────────────────────────────────────
import { describe, it, expect, beforeEach } from "vitest";
import {
  createPolicy,
  validatePolicy,
  serializePolicy,
  computePolicyHash,
} from "../src/policy.js";
import { canAgentSpendWithPolicy } from "../src/verifier.js";
import {
  getDailySpent,
  recordSpend,
  resetDailySpend,
  clearAllSpendData,
} from "../src/spendTracker.js";
import type { VCRPolicy, VCRConstraints } from "../src/types.js";

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

function makePolicy(overrides: Partial<VCRConstraints> = {}): VCRPolicy {
  return createPolicy(AGENT_ID, baseConstraints(overrides), {
    createdBy: "0xOwner",
    description: "Test policy",
  });
}

// ─── createPolicy / validatePolicy ───────────────────────────────────────────

describe("createPolicy", () => {
  it("creates a valid policy with required fields", () => {
    const p = makePolicy();
    expect(p.version).toBe("1.0");
    expect(p.agentId).toBe(AGENT_ID);
    expect(p.constraints.maxTransaction.amount).toBe("1000000");
    expect(p.metadata.createdBy).toBe("0xOwner");
    expect(p.metadata.createdAt).toBeTruthy();
  });

  it("sets createdAt to an ISO 8601 timestamp", () => {
    const p = makePolicy();
    const d = new Date(p.metadata.createdAt);
    expect(d).toBeInstanceOf(Date);
    expect(isNaN(d.getTime())).toBe(false);
  });

  it("throws when maxTransaction exceeds dailyLimit", () => {
    expect(() =>
      createPolicy(
        AGENT_ID,
        baseConstraints({
          maxTransaction: {
            amount: "9999999",
            token: "USDC",
            chain: "base-sepolia",
          },
          dailyLimit: {
            amount: "1000000",
            token: "USDC",
            chain: "base-sepolia",
          },
        }),
      ),
    ).toThrow(/maxTransaction cannot exceed dailyLimit/);
  });

  it("throws when allowedRecipients is empty", () => {
    expect(() =>
      createPolicy(AGENT_ID, baseConstraints({ allowedRecipients: [] })),
    ).toThrow(/allowedRecipients/);
  });

  it("throws when allowedTokens is empty", () => {
    expect(() =>
      createPolicy(AGENT_ID, baseConstraints({ allowedTokens: [] })),
    ).toThrow(/allowedTokens/);
  });

  it("throws when allowedChains is empty", () => {
    expect(() =>
      createPolicy(AGENT_ID, baseConstraints({ allowedChains: [] })),
    ).toThrow(/allowedChains/);
  });

  it("accepts optional timeRestrictions", () => {
    const p = makePolicy({
      timeRestrictions: { timezone: "UTC", allowedHours: [9, 17] },
    });
    expect(p.constraints.timeRestrictions?.allowedHours).toEqual([9, 17]);
  });
});

describe("validatePolicy", () => {
  it("passes a fully valid policy", () => {
    expect(() => validatePolicy(makePolicy())).not.toThrow();
  });

  it("rejects version !== '1.0'", () => {
    const p = makePolicy();
    (p as any).version = "2.0";
    expect(() => validatePolicy(p)).toThrow(/version/i);
  });

  it("rejects missing maxTransaction.amount", () => {
    const p = makePolicy();
    delete (p.constraints.maxTransaction as any).amount;
    expect(() => validatePolicy(p)).toThrow(/maxTransaction/);
  });

  it("rejects timeRestrictions start >= end", () => {
    expect(() =>
      createPolicy(
        AGENT_ID,
        baseConstraints({
          timeRestrictions: { timezone: "UTC", allowedHours: [17, 9] },
        }),
      ),
    ).toThrow(/start must be before end/);
  });

  it("rejects timeRestrictions start < 0", () => {
    expect(() =>
      createPolicy(
        AGENT_ID,
        baseConstraints({
          timeRestrictions: { timezone: "UTC", allowedHours: [-1, 9] },
        }),
      ),
    ).toThrow(/start must be in range/);
  });

  it("rejects timeRestrictions end > 24", () => {
    expect(() =>
      createPolicy(
        AGENT_ID,
        baseConstraints({
          timeRestrictions: { timezone: "UTC", allowedHours: [9, 25] },
        }),
      ),
    ).toThrow(/end must be in range/);
  });
});

// ─── serializePolicy / computePolicyHash ─────────────────────────────────────

describe("serializePolicy", () => {
  it("produces a valid JSON string", () => {
    const p = makePolicy();
    const s = serializePolicy(p);
    expect(() => JSON.parse(s)).not.toThrow();
  });

  it("is deterministic — same input always yields same string", () => {
    const p = makePolicy();
    expect(serializePolicy(p)).toBe(serializePolicy(p));
  });

  it("produces consistent output regardless of object key insertion order", () => {
    const p1 = makePolicy();
    // Construct same constraints with keys in different insertion order
    const constraints2: VCRConstraints = {
      allowedChains: [...p1.constraints.allowedChains],
      allowedTokens: [...p1.constraints.allowedTokens],
      allowedRecipients: [...p1.constraints.allowedRecipients],
      dailyLimit: { ...p1.constraints.dailyLimit },
      maxTransaction: { ...p1.constraints.maxTransaction },
    };
    const p2 = createPolicy(AGENT_ID, constraints2, {
      createdBy: p1.metadata.createdBy,
      description: p1.metadata.description,
    });
    // Force same timestamp for comparison
    (p2 as any).metadata.createdAt = p1.metadata.createdAt;
    expect(serializePolicy(p1)).toBe(serializePolicy(p2));
  });
});

describe("computePolicyHash", () => {
  it("returns a 0x-prefixed 32-byte hex hash", () => {
    const hash = computePolicyHash(makePolicy());
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  it("is deterministic for identical policies", () => {
    const p = makePolicy();
    expect(computePolicyHash(p)).toBe(computePolicyHash(p));
  });

  it("differs for policies with different constraints", () => {
    const p1 = makePolicy();
    const p2 = makePolicy({
      maxTransaction: {
        amount: "2000000",
        token: "USDC",
        chain: "base-sepolia",
      },
    });
    expect(computePolicyHash(p1)).not.toBe(computePolicyHash(p2));
  });

  it("differs if a recipient is added", () => {
    const p1 = makePolicy();
    const p2 = makePolicy({
      allowedRecipients: [RECIPIENT_A, RECIPIENT_B, UNKNOWN],
    });
    expect(computePolicyHash(p1)).not.toBe(computePolicyHash(p2));
  });
});

// ─── canAgentSpendWithPolicy ──────────────────────────────────────────────────

describe("canAgentSpendWithPolicy", () => {
  it("allows a valid spend within all limits", () => {
    const policy = makePolicy();
    const result = canAgentSpendWithPolicy(
      policy,
      {
        amount: "500000",
        token: "USDC",
        recipient: RECIPIENT_A,
        chain: "base-sepolia",
      },
      "0",
    );
    expect(result.allowed).toBe(true);
    expect(result.policy).toBe(policy);
  });

  it("blocks when amount exceeds maxTransaction", () => {
    const policy = makePolicy();
    const result = canAgentSpendWithPolicy(
      policy,
      {
        amount: "2000000",
        token: "USDC",
        recipient: RECIPIENT_A,
        chain: "base-sepolia",
      },
      "0",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/max transaction/i);
  });

  it("blocks when amount equals maxTransaction + 1 (boundary)", () => {
    const policy = makePolicy();
    const result = canAgentSpendWithPolicy(
      policy,
      {
        amount: "1000001",
        token: "USDC",
        recipient: RECIPIENT_A,
        chain: "base-sepolia",
      },
      "0",
    );
    expect(result.allowed).toBe(false);
  });

  it("allows when amount equals maxTransaction exactly (boundary)", () => {
    const policy = makePolicy();
    const result = canAgentSpendWithPolicy(
      policy,
      {
        amount: "1000000",
        token: "USDC",
        recipient: RECIPIENT_A,
        chain: "base-sepolia",
      },
      "0",
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks when recipient is not whitelisted", () => {
    const policy = makePolicy();
    const result = canAgentSpendWithPolicy(
      policy,
      {
        amount: "100000",
        token: "USDC",
        recipient: UNKNOWN,
        chain: "base-sepolia",
      },
      "0",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not in the whitelist/i);
  });

  it("is case-insensitive for recipient addresses", () => {
    const policy = makePolicy();
    const result = canAgentSpendWithPolicy(
      policy,
      {
        amount: "100000",
        token: "USDC",
        recipient: RECIPIENT_A.toUpperCase(),
        chain: "base-sepolia",
      },
      "0",
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks when token is not allowed", () => {
    const policy = makePolicy();
    const result = canAgentSpendWithPolicy(
      policy,
      {
        amount: "100000",
        token: "DAI",
        recipient: RECIPIENT_A,
        chain: "base-sepolia",
      },
      "0",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/DAI/);
  });

  it("blocks when chain is not allowed", () => {
    const policy = makePolicy();
    const result = canAgentSpendWithPolicy(
      policy,
      {
        amount: "100000",
        token: "USDC",
        recipient: RECIPIENT_A,
        chain: "mainnet",
      },
      "0",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/mainnet/);
  });

  it("blocks when projected spend exceeds dailyLimit", () => {
    const policy = makePolicy();
    // Already spent $4.80 — trying to spend $0.30 more would exceed $5.00 limit
    const result = canAgentSpendWithPolicy(
      policy,
      {
        amount: "300000",
        token: "USDC",
        recipient: RECIPIENT_A,
        chain: "base-sepolia",
      },
      "4800000",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/daily limit/i);
    expect(result.dailySpentAtCheck).toBe("4800000");
  });

  it("allows when projected spend equals dailyLimit exactly (boundary)", () => {
    const policy = makePolicy();
    // Already spent $4.50, spending $0.50 hits the $5 limit exactly
    const result = canAgentSpendWithPolicy(
      policy,
      {
        amount: "500000",
        token: "USDC",
        recipient: RECIPIENT_A,
        chain: "base-sepolia",
      },
      "4500000",
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks when projected spend exceeds dailyLimit by 1 wei (boundary)", () => {
    const policy = makePolicy();
    const result = canAgentSpendWithPolicy(
      policy,
      {
        amount: "500001",
        token: "USDC",
        recipient: RECIPIENT_A,
        chain: "base-sepolia",
      },
      "4500000",
    );
    expect(result.allowed).toBe(false);
  });

  it("blocks an expired policy", () => {
    const policy = makePolicy();
    policy.metadata.expiresAt = new Date(Date.now() - 1000).toISOString(); // 1s ago
    const result = canAgentSpendWithPolicy(
      policy,
      {
        amount: "100000",
        token: "USDC",
        recipient: RECIPIENT_A,
        chain: "base-sepolia",
      },
      "0",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/expired/i);
  });

  it("allows a policy that expires in the future", () => {
    const policy = makePolicy();
    policy.metadata.expiresAt = new Date(Date.now() + 86400_000).toISOString(); // +1 day
    const result = canAgentSpendWithPolicy(
      policy,
      {
        amount: "100000",
        token: "USDC",
        recipient: RECIPIENT_A,
        chain: "base-sepolia",
      },
      "0",
    );
    expect(result.allowed).toBe(true);
  });

  it("allows multiple whitelisted tokens when policy permits them", () => {
    const policy = makePolicy({ allowedTokens: ["USDC", "USDT"] });
    const usdc = canAgentSpendWithPolicy(
      policy,
      {
        amount: "100000",
        token: "USDC",
        recipient: RECIPIENT_A,
        chain: "base-sepolia",
      },
      "0",
    );
    const usdt = canAgentSpendWithPolicy(
      policy,
      {
        amount: "100000",
        token: "USDT",
        recipient: RECIPIENT_A,
        chain: "base-sepolia",
      },
      "0",
    );
    expect(usdc.allowed).toBe(true);
    expect(usdt.allowed).toBe(true);
  });

  it("allows multiple whitelisted chains when policy permits them", () => {
    const policy = makePolicy({ allowedChains: ["base-sepolia", "base"] });
    const r1 = canAgentSpendWithPolicy(
      policy,
      {
        amount: "100000",
        token: "USDC",
        recipient: RECIPIENT_A,
        chain: "base-sepolia",
      },
      "0",
    );
    const r2 = canAgentSpendWithPolicy(
      policy,
      {
        amount: "100000",
        token: "USDC",
        recipient: RECIPIENT_A,
        chain: "base",
      },
      "0",
    );
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });

  it("returns the policy object in the result when allowed", () => {
    const policy = makePolicy();
    const result = canAgentSpendWithPolicy(
      policy,
      {
        amount: "100000",
        token: "USDC",
        recipient: RECIPIENT_A,
        chain: "base-sepolia",
      },
      "0",
    );
    expect(result.policy).toStrictEqual(policy);
  });

  it("returns the policy object in the result when blocked", () => {
    const policy = makePolicy();
    const result = canAgentSpendWithPolicy(
      policy,
      {
        amount: "9999999",
        token: "USDC",
        recipient: RECIPIENT_A,
        chain: "base-sepolia",
      },
      "0",
    );
    expect(result.policy).toStrictEqual(policy);
  });
});

// ─── Spend Tracker ────────────────────────────────────────────────────────────

describe("spendTracker", () => {
  const ENS = "tracker-test.acme.eth";
  const TOKEN = "USDC";

  beforeEach(() => {
    clearAllSpendData();
  });

  it("returns '0' before any spend is recorded", async () => {
    const spent = await getDailySpent(ENS, TOKEN);
    expect(spent).toBe("0");
  });

  it("accumulates spend across multiple recordSpend calls", async () => {
    await recordSpend(ENS, TOKEN, "100000");
    await recordSpend(ENS, TOKEN, "200000");
    const spent = await getDailySpent(ENS, TOKEN);
    expect(spent).toBe("300000");
  });

  it("tracks spend independently per token", async () => {
    await recordSpend(ENS, "USDC", "100000");
    await recordSpend(ENS, "USDT", "500000");
    expect(await getDailySpent(ENS, "USDC")).toBe("100000");
    expect(await getDailySpent(ENS, "USDT")).toBe("500000");
  });

  it("tracks spend independently per ENS name", async () => {
    const ENS2 = "other-agent.acme.eth";
    await recordSpend(ENS, TOKEN, "100000");
    await recordSpend(ENS2, TOKEN, "999000");
    expect(await getDailySpent(ENS, TOKEN)).toBe("100000");
    expect(await getDailySpent(ENS2, TOKEN)).toBe("999000");
  });

  it("resetDailySpend clears a specific agent+token", async () => {
    await recordSpend(ENS, TOKEN, "500000");
    resetDailySpend(ENS, TOKEN);
    expect(await getDailySpent(ENS, TOKEN)).toBe("0");
  });

  it("clearAllSpendData resets everything", async () => {
    await recordSpend(ENS, TOKEN, "100000");
    await recordSpend(ENS, "USDT", "200000");
    clearAllSpendData();
    expect(await getDailySpent(ENS, TOKEN)).toBe("0");
    expect(await getDailySpent(ENS, "USDT")).toBe("0");
  });

  it("handles large BigInt amounts without overflow", async () => {
    // 1 million USDC = 1_000_000_000_000 (12 digits in USDC base units)
    const large = "1000000000000";
    await recordSpend(ENS, TOKEN, large);
    expect(await getDailySpent(ENS, TOKEN)).toBe(large);
  });
});

// ─── VCR Extension Fields ─────────────────────────────────────────────────────

describe("VCRPolicy extension fields", () => {
  it("accepts optional VCR extension fields without failing validation", () => {
    const p = makePolicy();
    p.ensName = "researcher-001.acmecorp.eth";
    p.walletAddress = "0xForwarder";
    p.custodian = "bitgo";
    p.network = "hteth";
    p.policy_hash = "0xdeadbeef";
    p.ipfs_cid = "bafkreiexample";
    expect(() => validatePolicy(p)).not.toThrow();
  });

  it("includes extension fields in serialized output", () => {
    const p = makePolicy();
    p.ensName = "researcher-001.acmecorp.eth";
    p.ipfs_cid = "bafkreiexample";
    const serialized = serializePolicy(p);
    expect(serialized).toContain("researcher-001.acmecorp.eth");
    expect(serialized).toContain("bafkreiexample");
  });

  it("extension fields change the policy hash", () => {
    const p1 = makePolicy();
    const p2 = makePolicy();
    p2.ensName = "researcher-001.acmecorp.eth";
    expect(computePolicyHash(p1)).not.toBe(computePolicyHash(p2));
  });
});
