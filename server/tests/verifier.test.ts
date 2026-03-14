// ─── VCR Protocol — Verifier Unit Tests ───────────────────────────────────────
import { describe, it, expect } from "vitest";
import { canAgentSpendWithPolicy } from "@vcr-protocol/sdk";
import type { VCRPolicy, SpendRequest } from "@vcr-protocol/sdk";

// ─── Test Data ────────────────────────────────────────────────────────────────

function makePolicy(overrides?: Partial<VCRPolicy["constraints"]>): VCRPolicy {
    return {
        version: "1.0",
        agentId: "eip155:11155111:0x8004A818BFB912233c491871b3d84c89A494BD9e:0",
        constraints: {
            maxTransaction: { amount: "1000000", token: "USDC", chain: "base-sepolia" },
            dailyLimit: { amount: "5000000", token: "USDC", chain: "base-sepolia" },
            allowedRecipients: [
                "0xServiceA000000000000000000000000000000001",
                "0xServiceB000000000000000000000000000000002",
            ],
            allowedTokens: ["USDC", "USDT"],
            allowedChains: ["base-sepolia", "base"],
            timeRestrictions: { timezone: "UTC", allowedHours: [0, 24] }, // all hours
            ...overrides,
        },
        metadata: {
            createdAt: "2026-03-13T00:00:00Z",
            createdBy: "0xOwner",
            description: "Test policy",
        },
    };
}

function makeRequest(overrides?: Partial<SpendRequest>): SpendRequest {
    return {
        amount: "500000", // $0.50 USDC
        token: "USDC",
        recipient: "0xServiceA000000000000000000000000000000001",
        chain: "base-sepolia",
        ...overrides,
    };
}

// ─── Core Constraint Tests ────────────────────────────────────────────────────

describe("canAgentSpendWithPolicy", () => {
    it("allows a valid spend request within all constraints", () => {
        const result = canAgentSpendWithPolicy(makePolicy(), makeRequest(), "0");
        expect(result.allowed).toBe(true);
    });

    it("denies spend exceeding maxTransaction", () => {
        const result = canAgentSpendWithPolicy(
            makePolicy(),
            makeRequest({ amount: "2000000" }), // $2 > $1 max
            "0"
        );
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Exceeds max transaction");
    });

    it("denies spend to non-whitelisted recipient", () => {
        const result = canAgentSpendWithPolicy(
            makePolicy(),
            makeRequest({ recipient: "0xUnknown000000000000000000000000000000000" }),
            "0"
        );
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("not in the whitelist");
    });

    it("handles case-insensitive recipient matching", () => {
        const result = canAgentSpendWithPolicy(
            makePolicy(),
            makeRequest({ recipient: "0xSERVICEA000000000000000000000000000000001" }),
            "0"
        );
        expect(result.allowed).toBe(true);
    });

    it("denies spend with disallowed token", () => {
        const result = canAgentSpendWithPolicy(
            makePolicy(),
            makeRequest({ token: "DAI" }),
            "0"
        );
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Token DAI is not allowed");
    });

    it("allows spend with an allowed token (USDT)", () => {
        const result = canAgentSpendWithPolicy(
            makePolicy(),
            makeRequest({ token: "USDT" }),
            "0"
        );
        expect(result.allowed).toBe(true);
    });

    it("denies spend on disallowed chain", () => {
        const result = canAgentSpendWithPolicy(
            makePolicy(),
            makeRequest({ chain: "ethereum" }),
            "0"
        );
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Chain ethereum is not allowed");
    });

    it("allows spend on allowed chain (base)", () => {
        const result = canAgentSpendWithPolicy(
            makePolicy(),
            makeRequest({ chain: "base" }),
            "0"
        );
        expect(result.allowed).toBe(true);
    });

    it("denies spend when daily limit would be exceeded", () => {
        const result = canAgentSpendWithPolicy(
            makePolicy(),
            makeRequest({ amount: "1000000" }), // $1
            "4500000" // Already spent $4.50, would total $5.50 > $5
        );
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Daily limit exceeded");
    });

    it("allows spend right at daily limit boundary", () => {
        const result = canAgentSpendWithPolicy(
            makePolicy(),
            makeRequest({ amount: "500000" }), // $0.50
            "4500000" // Already $4.50, total = $5.00 = exactly limit
        );
        expect(result.allowed).toBe(true);
    });

    it("includes dailySpentAtCheck in result", () => {
        const result = canAgentSpendWithPolicy(
            makePolicy(),
            makeRequest(),
            "1000000"
        );
        expect(result.dailySpentAtCheck).toBe("1000000");
    });

    it("returns the policy in the result", () => {
        const policy = makePolicy();
        const result = canAgentSpendWithPolicy(policy, makeRequest(), "0");
        expect(result.policy).toEqual(policy);
    });
});

// ─── Time Restriction Tests ───────────────────────────────────────────────────

describe("canAgentSpendWithPolicy — time restrictions", () => {
    it("allows spend when no time restrictions are set", () => {
        const policy = makePolicy({ timeRestrictions: undefined });
        const result = canAgentSpendWithPolicy(policy, makeRequest(), "0");
        expect(result.allowed).toBe(true);
    });

    it("allows spend when time restrictions cover all hours (0-24)", () => {
        const result = canAgentSpendWithPolicy(makePolicy(), makeRequest(), "0");
        expect(result.allowed).toBe(true);
    });

    // Time-dependent test: only run validation logic, not time-specific assertion
    it("canAgentSpendWithPolicy checks time window correctly", () => {
        const currentHour = new Date().getUTCHours();
        // Create a policy that excludes the current hour
        const restrictedPolicy = makePolicy({
            timeRestrictions: {
                timezone: "UTC",
                allowedHours: [
                    (currentHour + 2) % 24,
                    (currentHour + 3) % 24 || 24,
                ],
            },
        });

        const result = canAgentSpendWithPolicy(restrictedPolicy, makeRequest(), "0");
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Outside allowed UTC hours");
    });
});

// ─── Policy Expiry Tests ──────────────────────────────────────────────────────

describe("canAgentSpendWithPolicy — expiry", () => {
    it("denies spend when policy has expired", () => {
        const policy = makePolicy();
        policy.metadata.expiresAt = "2020-01-01T00:00:00Z"; // Past date
        const result = canAgentSpendWithPolicy(policy, makeRequest(), "0");
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("Policy has expired");
    });

    it("allows spend when policy has not expired", () => {
        const policy = makePolicy();
        policy.metadata.expiresAt = "2030-01-01T00:00:00Z"; // Future date
        const result = canAgentSpendWithPolicy(policy, makeRequest(), "0");
        expect(result.allowed).toBe(true);
    });

    it("allows spend when no expiry is set", () => {
        const policy = makePolicy();
        delete policy.metadata.expiresAt;
        const result = canAgentSpendWithPolicy(policy, makeRequest(), "0");
        expect(result.allowed).toBe(true);
    });
});

// ─── BigInt Edge Cases ────────────────────────────────────────────────────────

describe("canAgentSpendWithPolicy — BigInt handling", () => {
    it("handles very large amounts correctly", () => {
        const largePolicy = makePolicy({
            maxTransaction: { amount: "1000000000000000000", token: "USDC", chain: "base-sepolia" },
            dailyLimit: { amount: "10000000000000000000", token: "USDC", chain: "base-sepolia" },
        });
        const result = canAgentSpendWithPolicy(
            largePolicy,
            makeRequest({ amount: "999999999999999999" }),
            "0"
        );
        expect(result.allowed).toBe(true);
    });

    it("handles zero amount", () => {
        const result = canAgentSpendWithPolicy(
            makePolicy(),
            makeRequest({ amount: "0" }),
            "0"
        );
        expect(result.allowed).toBe(true);
    });

    it("handles exact maxTransaction boundary", () => {
        const result = canAgentSpendWithPolicy(
            makePolicy(),
            makeRequest({ amount: "1000000" }), // Exactly $1 = maxTransaction
            "0"
        );
        expect(result.allowed).toBe(true);
    });

    it("denies amount just 1 over maxTransaction", () => {
        const result = canAgentSpendWithPolicy(
            makePolicy(),
            makeRequest({ amount: "1000001" }), // $1.000001 > $1 max
            "0"
        );
        expect(result.allowed).toBe(false);
    });
});
