// ─── VCR Protocol SDK — canAgentSpend Async Integration Tests ─────────────────
// These tests mock ENS resolution and IPFS fetching so no live network calls
// are made. They exercise the full canAgentSpend() async pipeline end-to-end.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { canAgentSpend } from "../src/verifier.js";
import type {
  VCRPolicy,
  SpendRequest,
  DailySpentGetter,
} from "../src/verifier.js";

// ─── Mock ENS + IPFS layers ───────────────────────────────────────────────────
// We mock at the module boundary so canAgentSpend() never touches the network.

vi.mock("../src/ens.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/ens.js")>();
  return {
    ...actual,
    getVCRPolicyUri: vi.fn(),
  };
});

vi.mock("../src/policy.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/policy.js")>();
  return {
    ...actual,
    fetchPolicy: vi.fn(),
  };
});

import { getVCRPolicyUri } from "../src/ens.js";
import { fetchPolicy } from "../src/policy.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ENS_NAME = "researcher-001.acmecorp.eth";
const POLICY_CID = "bafkreiexamplecid123456789";
const POLICY_URI = `ipfs://${POLICY_CID}`;

const RECIPIENT_A = "0xaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA";
const RECIPIENT_B = "0xbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb";
const UNKNOWN_ADDR = "0x1234567890123456789012345678901234567890";

function makePolicy(overrides: Partial<VCRPolicy> = {}): VCRPolicy {
  return {
    version: "1.0",
    agentId: "eip155:11155111:0x8004A818BFB912233c491871b3d84c89A494BD9e:0",
    constraints: {
      maxTransaction: {
        amount: "1000000",
        token: "USDC",
        chain: "base-sepolia",
      },
      dailyLimit: { amount: "5000000", token: "USDC", chain: "base-sepolia" },
      allowedRecipients: [RECIPIENT_A, RECIPIENT_B],
      allowedTokens: ["USDC"],
      allowedChains: ["base-sepolia"],
    },
    metadata: {
      createdAt: new Date().toISOString(),
      createdBy: "0xOwner",
    },
    ...overrides,
  };
}

function makeRequest(overrides: Partial<SpendRequest> = {}): SpendRequest {
  return {
    amount: "100000",
    token: "USDC",
    recipient: RECIPIENT_A,
    chain: "base-sepolia",
    ...overrides,
  };
}

/** A getDailySpent that always returns zero (no prior spend). */
const zeroDailySpent: DailySpentGetter = async () => "0";

/** Returns a getDailySpent function that always reports a fixed accumulated total. */
function fixedDailySpent(amount: string): DailySpentGetter {
  return async () => amount;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupMocks(policy: VCRPolicy | null, uri: string | null = POLICY_URI) {
  vi.mocked(getVCRPolicyUri).mockResolvedValue(uri);
  if (policy !== null) {
    vi.mocked(fetchPolicy).mockResolvedValue(policy);
  }
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("canAgentSpend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  describe("allowed — happy path", () => {
    it("returns allowed=true for a fully valid request", async () => {
      setupMocks(makePolicy());
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest(),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("includes the policy in the result when allowed", async () => {
      const policy = makePolicy();
      setupMocks(policy);
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest(),
        zeroDailySpent,
      );
      expect(result.policy).toStrictEqual(policy);
    });

    it("includes policyCid in the result when allowed", async () => {
      setupMocks(makePolicy());
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest(),
        zeroDailySpent,
      );
      expect(result.policyCid).toBe(POLICY_CID);
    });

    it("includes dailySpentAtCheck in the result when allowed", async () => {
      setupMocks(makePolicy());
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest(),
        fixedDailySpent("250000"),
      );
      expect(result.dailySpentAtCheck).toBe("250000");
    });

    it("allows a spend of exactly maxTransaction (boundary)", async () => {
      setupMocks(makePolicy());
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ amount: "1000000" }),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(true);
    });

    it("allows when projected spend equals dailyLimit exactly (boundary)", async () => {
      setupMocks(makePolicy());
      // dailyLimit = 5_000_000, already spent 4_500_000, requesting 500_000
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ amount: "500000" }),
        fixedDailySpent("4500000"),
      );
      expect(result.allowed).toBe(true);
    });

    it("resolves the policy URI using getVCRPolicyUri", async () => {
      setupMocks(makePolicy());
      await canAgentSpend(ENS_NAME, makeRequest(), zeroDailySpent);
      expect(getVCRPolicyUri).toHaveBeenCalledWith(ENS_NAME);
      expect(getVCRPolicyUri).toHaveBeenCalledTimes(1);
    });

    it("fetches the policy from IPFS using fetchPolicy", async () => {
      setupMocks(makePolicy());
      await canAgentSpend(ENS_NAME, makeRequest(), zeroDailySpent);
      expect(fetchPolicy).toHaveBeenCalledWith(POLICY_URI);
      expect(fetchPolicy).toHaveBeenCalledTimes(1);
    });

    it("calls getDailySpent with the correct ensName and token", async () => {
      setupMocks(makePolicy());
      const spy = vi.fn(async () => "0");
      await canAgentSpend(ENS_NAME, makeRequest({ token: "USDC" }), spy);
      expect(spy).toHaveBeenCalledWith(ENS_NAME, "USDC");
    });

    it("allows a second allowed recipient (RECIPIENT_B)", async () => {
      setupMocks(makePolicy());
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ recipient: RECIPIENT_B }),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(true);
    });
  });

  // ── ENS / IPFS resolution failures ────────────────────────────────────────

  describe("blocked — ENS / IPFS failures", () => {
    it("returns allowed=false when getVCRPolicyUri throws", async () => {
      vi.mocked(getVCRPolicyUri).mockRejectedValue(new Error("RPC timeout"));
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest(),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/ENS lookup failed/i);
      expect(result.reason).toContain("RPC timeout");
    });

    it("returns allowed=false when vcr.policy text record is null", async () => {
      vi.mocked(getVCRPolicyUri).mockResolvedValue(null);
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest(),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/No vcr\.policy text record/i);
    });

    it("returns allowed=false when vcr.policy text record is an empty string", async () => {
      vi.mocked(getVCRPolicyUri).mockResolvedValue("");
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest(),
        zeroDailySpent,
      );
      // empty string is falsy → treated the same as null
      expect(result.allowed).toBe(false);
    });

    it("returns allowed=false when fetchPolicy throws (IPFS unavailable)", async () => {
      vi.mocked(getVCRPolicyUri).mockResolvedValue(POLICY_URI);
      vi.mocked(fetchPolicy).mockRejectedValue(
        new Error("All gateways failed"),
      );
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest(),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/IPFS fetch failed/i);
      expect(result.reason).toContain("All gateways failed");
    });

    it("includes policyCid in the result even when IPFS fetch fails", async () => {
      vi.mocked(getVCRPolicyUri).mockResolvedValue(POLICY_URI);
      vi.mocked(fetchPolicy).mockRejectedValue(new Error("gateway timeout"));
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest(),
        zeroDailySpent,
      );
      expect(result.policyCid).toBe(POLICY_CID);
    });

    it("returns allowed=false when getDailySpent throws", async () => {
      setupMocks(makePolicy());
      const failingGetter: DailySpentGetter = async () => {
        throw new Error("Redis connection lost");
      };
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest(),
        failingGetter,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/daily spend lookup failed/i);
      expect(result.reason).toContain("Redis connection lost");
    });
  });

  // ── Policy constraint violations ──────────────────────────────────────────

  describe("blocked — max transaction amount", () => {
    it("blocks when amount exceeds maxTransaction by 1 (boundary +1)", async () => {
      setupMocks(makePolicy());
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ amount: "1000001" }),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/max transaction/i);
    });

    it("blocks when amount is much larger than maxTransaction", async () => {
      setupMocks(makePolicy());
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ amount: "99999999999" }),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("1000000");
    });

    it("includes the policy in the result when blocked by max transaction", async () => {
      const policy = makePolicy();
      setupMocks(policy);
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ amount: "2000000" }),
        zeroDailySpent,
      );
      expect(result.policy).toStrictEqual(policy);
    });
  });

  describe("blocked — recipient whitelist", () => {
    it("blocks an address not in allowedRecipients", async () => {
      setupMocks(makePolicy());
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ recipient: UNKNOWN_ADDR }),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/not in the whitelist/i);
    });

    it("recipient check is case-insensitive (uppercase input allowed)", async () => {
      setupMocks(makePolicy());
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ recipient: RECIPIENT_A.toUpperCase() }),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(true);
    });

    it("recipient check is case-insensitive (lowercase input allowed)", async () => {
      setupMocks(makePolicy());
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ recipient: RECIPIENT_A.toLowerCase() }),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(true);
    });

    it("blocks an address that looks similar but differs by one character", async () => {
      setupMocks(makePolicy());
      // Change the last character of RECIPIENT_A
      const almost =
        RECIPIENT_A.slice(0, -1) + (RECIPIENT_A.endsWith("A") ? "B" : "A");
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ recipient: almost }),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(false);
    });

    it("includes the offending address in the reason", async () => {
      setupMocks(makePolicy());
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ recipient: UNKNOWN_ADDR }),
        zeroDailySpent,
      );
      expect(result.reason).toContain(UNKNOWN_ADDR);
    });
  });

  describe("blocked — token allowlist", () => {
    it("blocks a token not in allowedTokens", async () => {
      setupMocks(makePolicy());
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ token: "DAI" }),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("DAI");
    });

    it("blocks ETH when only USDC is whitelisted", async () => {
      setupMocks(makePolicy());
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ token: "ETH" }),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(false);
    });

    it("allows USDT when the policy whitelists both USDC and USDT", async () => {
      setupMocks(
        makePolicy({
          constraints: {
            ...makePolicy().constraints,
            allowedTokens: ["USDC", "USDT"],
          },
        }),
      );
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ token: "USDT" }),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(true);
    });

    it("token matching is case-sensitive", async () => {
      setupMocks(makePolicy());
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ token: "usdc" }),
        zeroDailySpent,
      );
      // "usdc" !== "USDC" — should be blocked
      expect(result.allowed).toBe(false);
    });
  });

  describe("blocked — chain allowlist", () => {
    it("blocks a chain not in allowedChains", async () => {
      setupMocks(makePolicy());
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ chain: "mainnet" }),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("mainnet");
    });

    it("blocks 'base' when only 'base-sepolia' is whitelisted", async () => {
      setupMocks(makePolicy());
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ chain: "base" }),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(false);
    });

    it("allows 'base' when the policy whitelists both base-sepolia and base", async () => {
      setupMocks(
        makePolicy({
          constraints: {
            ...makePolicy().constraints,
            allowedChains: ["base-sepolia", "base"],
          },
        }),
      );
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ chain: "base" }),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(true);
    });

    it("chain matching is case-sensitive", async () => {
      setupMocks(makePolicy());
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ chain: "BASE-SEPOLIA" }),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(false);
    });
  });

  describe("blocked — daily limit", () => {
    it("blocks when projected spend would exceed dailyLimit by 1 (boundary +1)", async () => {
      setupMocks(makePolicy());
      // dailyLimit = 5_000_000; already spent 4_500_000; requesting 500_001 → over by 1
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ amount: "500001" }),
        fixedDailySpent("4500000"),
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/daily limit/i);
    });

    it("blocks when dailySpent alone already equals dailyLimit", async () => {
      setupMocks(makePolicy());
      // dailyLimit = 5_000_000; already spent 5_000_000; any new spend blocked
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ amount: "1" }),
        fixedDailySpent("5000000"),
      );
      expect(result.allowed).toBe(false);
    });

    it("includes dailySpentAtCheck in the result when blocked by daily limit", async () => {
      setupMocks(makePolicy());
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ amount: "999999" }),
        fixedDailySpent("4500000"),
      );
      expect(result.dailySpentAtCheck).toBe("4500000");
    });

    it("reason message includes current spent and limit values", async () => {
      setupMocks(makePolicy());
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ amount: "999999" }),
        fixedDailySpent("4500000"),
      );
      expect(result.reason).toContain("5000000"); // the limit
    });

    it("allows when dailySpent is zero (no prior spend today)", async () => {
      setupMocks(makePolicy());
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ amount: "1000000" }),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe("blocked — policy expiry", () => {
    it("blocks when policy has expired", async () => {
      const expired = makePolicy({
        metadata: {
          createdAt: new Date(Date.now() - 86400_000).toISOString(),
          createdBy: "0xOwner",
          expiresAt: new Date(Date.now() - 1000).toISOString(), // 1s ago
        },
      });
      setupMocks(expired);
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest(),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/expired/i);
    });

    it("allows a policy that expires far in the future", async () => {
      const future = makePolicy({
        metadata: {
          createdAt: new Date().toISOString(),
          createdBy: "0xOwner",
          expiresAt: new Date(Date.now() + 365 * 86400_000).toISOString(), // +1 year
        },
      });
      setupMocks(future);
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest(),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(true);
    });

    it("allows a policy with no expiresAt field", async () => {
      const noExpiry = makePolicy();
      delete noExpiry.metadata.expiresAt;
      setupMocks(noExpiry);
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest(),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe("blocked — time restrictions", () => {
    it("blocks when current UTC hour is before allowedHours start", async () => {
      // Mock Date to return a UTC hour outside the window
      const fixedDate = new Date("2026-03-13T07:30:00Z"); // 07:30 UTC
      vi.spyOn(global, "Date").mockImplementation((...args) => {
        if (args.length === 0) return fixedDate;
        return new (Date as any)(...args);
      });

      const policy = makePolicy({
        constraints: {
          ...makePolicy().constraints,
          timeRestrictions: { timezone: "UTC", allowedHours: [9, 17] },
        },
      });
      setupMocks(policy);
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest(),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/outside allowed.*hours/i);

      vi.restoreAllMocks();
    });

    it("blocks when current UTC hour is at or after allowedHours end", async () => {
      const fixedDate = new Date("2026-03-13T17:00:00Z"); // exactly 17:00 UTC (end is exclusive)
      vi.spyOn(global, "Date").mockImplementation((...args) => {
        if (args.length === 0) return fixedDate;
        return new (Date as any)(...args);
      });

      const policy = makePolicy({
        constraints: {
          ...makePolicy().constraints,
          timeRestrictions: { timezone: "UTC", allowedHours: [9, 17] },
        },
      });
      setupMocks(policy);
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest(),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(false);

      vi.restoreAllMocks();
    });

    it("allows when current UTC hour is within the allowed window", async () => {
      const fixedDate = new Date("2026-03-13T12:00:00Z"); // 12:00 UTC (noon)
      vi.spyOn(global, "Date").mockImplementation((...args) => {
        if (args.length === 0) return fixedDate;
        return new (Date as any)(...args);
      });

      const policy = makePolicy({
        constraints: {
          ...makePolicy().constraints,
          timeRestrictions: { timezone: "UTC", allowedHours: [9, 17] },
        },
      });
      setupMocks(policy);
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest(),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(true);

      vi.restoreAllMocks();
    });

    it("allows when no timeRestrictions are set", async () => {
      const policy = makePolicy();
      delete policy.constraints.timeRestrictions;
      setupMocks(policy);
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest(),
        zeroDailySpent,
      );
      expect(result.allowed).toBe(true);
    });
  });

  // ── Check ordering ────────────────────────────────────────────────────────

  describe("check ordering", () => {
    it("reports max-transaction violation even when daily limit would also fail", async () => {
      // amount=2_000_000 exceeds maxTx(1_000_000) AND dailyLimit(5_000_000 with 4_999_999 spent)
      setupMocks(makePolicy());
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ amount: "2000000" }),
        fixedDailySpent("4999999"),
      );
      // max-transaction check fires before daily-limit check
      expect(result.reason).toMatch(/max transaction/i);
    });

    it("reports recipient violation even when token would also fail", async () => {
      setupMocks(makePolicy());
      const result = await canAgentSpend(
        ENS_NAME,
        makeRequest({ recipient: UNKNOWN_ADDR, token: "DAI" }),
        zeroDailySpent,
      );
      // recipient check fires before token check
      expect(result.reason).toMatch(/not in the whitelist/i);
    });

    it("only calls getDailySpent once per invocation", async () => {
      setupMocks(makePolicy());
      const spy = vi.fn(async () => "0");
      await canAgentSpend(ENS_NAME, makeRequest(), spy);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("does not call getDailySpent when a prior check already failed", async () => {
      setupMocks(makePolicy());
      const spy = vi.fn(async () => "0");
      // recipient check fails before daily-limit check
      await canAgentSpend(
        ENS_NAME,
        makeRequest({ recipient: UNKNOWN_ADDR }),
        spy,
      );
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ── Different ENS names ────────────────────────────────────────────────────

  describe("multiple ENS names", () => {
    it("uses the correct ENS name when looking up the policy", async () => {
      setupMocks(makePolicy());
      const otherEns = "purchasing.acmecorp.eth";
      await canAgentSpend(otherEns, makeRequest(), zeroDailySpent);
      expect(getVCRPolicyUri).toHaveBeenCalledWith(otherEns);
    });

    it("passes the ENS name and token to getDailySpent", async () => {
      setupMocks(makePolicy());
      const spy = vi.fn(async () => "0");
      const ens = "payroll.acmecorp.eth";
      await canAgentSpend(ens, makeRequest({ token: "USDC" }), spy);
      expect(spy).toHaveBeenCalledWith(ens, "USDC");
    });
  });

  // ── canAgentSpendWithPolicy (synchronous variant) ─────────────────────────

  describe("canAgentSpendWithPolicy", async () => {
    const { canAgentSpendWithPolicy } = await import("../src/verifier.js");

    it("returns allowed=true for a valid synchronous check", () => {
      const result = canAgentSpendWithPolicy(makePolicy(), makeRequest(), "0");
      expect(result.allowed).toBe(true);
    });

    it("blocks when amount exceeds maxTransaction", () => {
      const result = canAgentSpendWithPolicy(
        makePolicy(),
        makeRequest({ amount: "9999999" }),
        "0",
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/max transaction/i);
    });

    it("blocks when recipient is not whitelisted", () => {
      const result = canAgentSpendWithPolicy(
        makePolicy(),
        makeRequest({ recipient: UNKNOWN_ADDR }),
        "0",
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/not whitelisted/i);
    });

    it("never calls getVCRPolicyUri or fetchPolicy (no async IO)", () => {
      canAgentSpendWithPolicy(makePolicy(), makeRequest(), "0");
      expect(getVCRPolicyUri).not.toHaveBeenCalled();
      expect(fetchPolicy).not.toHaveBeenCalled();
    });

    it("is synchronous — returns SpendResult directly, not a Promise", () => {
      const result = canAgentSpendWithPolicy(makePolicy(), makeRequest(), "0");
      // If it returned a Promise, result.allowed would be undefined
      expect(typeof result.allowed).toBe("boolean");
    });
  });
});
