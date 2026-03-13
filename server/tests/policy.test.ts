// ─── VCR Protocol — Policy SDK Unit Tests ─────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import {
    createPolicy,
    validatePolicy,
    serializePolicy,
    computePolicyHash,
} from "@vcr-protocol/sdk";
import type { VCRPolicy, PolicyConstraints } from "@vcr-protocol/sdk";

// ─── Test Data ────────────────────────────────────────────────────────────────

const VALID_CONSTRAINTS: PolicyConstraints = {
    maxTransaction: { amount: "1000000", token: "USDC", chain: "base-sepolia" },
    dailyLimit: { amount: "5000000", token: "USDC", chain: "base-sepolia" },
    allowedRecipients: ["0xServiceA000000000000000000000000000000001"],
    allowedTokens: ["USDC"],
    allowedChains: ["base-sepolia"],
    timeRestrictions: { timezone: "UTC", allowedHours: [0, 24] },
};

const VALID_AGENT_ID = "eip155:11155111:0x8004A818BFB912233c491871b3d84c89A494BD9e:0";

// ─── createPolicy ─────────────────────────────────────────────────────────────

describe("createPolicy", () => {
    it("creates a valid policy with all required fields", () => {
        const policy = createPolicy(VALID_AGENT_ID, VALID_CONSTRAINTS, {
            createdBy: "0xOwner",
            description: "Test policy",
        });

        expect(policy.version).toBe("1.0");
        expect(policy.agentId).toBe(VALID_AGENT_ID);
        expect(policy.constraints).toEqual(VALID_CONSTRAINTS);
        expect(policy.metadata.createdBy).toBe("0xOwner");
        expect(policy.metadata.description).toBe("Test policy");
        expect(policy.metadata.createdAt).toBeTruthy();
    });

    it("creates a policy with default metadata when not provided", () => {
        const policy = createPolicy(VALID_AGENT_ID, VALID_CONSTRAINTS);
        expect(policy.metadata.createdBy).toBe("");
    });
});

// ─── validatePolicy ───────────────────────────────────────────────────────────

describe("validatePolicy", () => {
    it("accepts a valid policy", () => {
        const policy = createPolicy(VALID_AGENT_ID, VALID_CONSTRAINTS);
        expect(() => validatePolicy(policy)).not.toThrow();
    });

    it("rejects unsupported version", () => {
        const policy = createPolicy(VALID_AGENT_ID, VALID_CONSTRAINTS);
        (policy as any).version = "2.0";
        expect(() => validatePolicy(policy)).toThrow("Unsupported policy version");
    });

    it("rejects missing maxTransaction amount", () => {
        const constraints = { ...VALID_CONSTRAINTS, maxTransaction: { amount: "", token: "USDC", chain: "base" } };
        expect(() => createPolicy(VALID_AGENT_ID, constraints)).toThrow("maxTransaction.amount required");
    });

    it("rejects maxTransaction exceeding dailyLimit", () => {
        const constraints = {
            ...VALID_CONSTRAINTS,
            maxTransaction: { amount: "10000000", token: "USDC", chain: "base" },
            dailyLimit: { amount: "5000000", token: "USDC", chain: "base" },
        };
        expect(() => createPolicy(VALID_AGENT_ID, constraints)).toThrow("maxTransaction cannot exceed dailyLimit");
    });

    it("rejects empty allowedRecipients", () => {
        const constraints = { ...VALID_CONSTRAINTS, allowedRecipients: [] as string[] };
        expect(() => createPolicy(VALID_AGENT_ID, constraints)).toThrow("allowedRecipients must be a non-empty array");
    });

    it("rejects empty allowedTokens", () => {
        const constraints = { ...VALID_CONSTRAINTS, allowedTokens: [] as string[] };
        expect(() => createPolicy(VALID_AGENT_ID, constraints)).toThrow("allowedTokens must be a non-empty array");
    });

    it("rejects empty allowedChains", () => {
        const constraints = { ...VALID_CONSTRAINTS, allowedChains: [] as string[] };
        expect(() => createPolicy(VALID_AGENT_ID, constraints)).toThrow("allowedChains must be a non-empty array");
    });

    it("rejects invalid time restrictions (start >= end)", () => {
        const constraints = {
            ...VALID_CONSTRAINTS,
            timeRestrictions: { timezone: "UTC" as const, allowedHours: [17, 9] as [number, number] },
        };
        expect(() => createPolicy(VALID_AGENT_ID, constraints)).toThrow("allowedHours start must be before end");
    });

    it("rejects start hour out of range", () => {
        const constraints = {
            ...VALID_CONSTRAINTS,
            timeRestrictions: { timezone: "UTC" as const, allowedHours: [-1, 10] as [number, number] },
        };
        expect(() => createPolicy(VALID_AGENT_ID, constraints)).toThrow("allowedHours start must be in range [0, 23]");
    });

    it("rejects end hour out of range", () => {
        const constraints = {
            ...VALID_CONSTRAINTS,
            timeRestrictions: { timezone: "UTC" as const, allowedHours: [0, 25] as [number, number] },
        };
        expect(() => createPolicy(VALID_AGENT_ID, constraints)).toThrow("allowedHours end must be in range [1, 24]");
    });
});

// ─── serializePolicy ──────────────────────────────────────────────────────────

describe("serializePolicy", () => {
    it("produces deterministic output for the same input", () => {
        const policy = createPolicy(VALID_AGENT_ID, VALID_CONSTRAINTS, {
            createdBy: "0xOwner",
        });
        // Override the timestamp for determinism
        (policy.metadata as any).createdAt = "2026-03-13T00:00:00.000Z";

        const serialized1 = serializePolicy(policy);
        const serialized2 = serializePolicy(policy);
        expect(serialized1).toBe(serialized2);
    });

    it("produces deterministic output regardless of key insertion order", () => {
        const policy1: any = { version: "1.0", agentId: "test", constraints: VALID_CONSTRAINTS, metadata: { createdAt: "2026-01-01", createdBy: "0x" } };
        const policy2: any = { metadata: { createdBy: "0x", createdAt: "2026-01-01" }, constraints: VALID_CONSTRAINTS, agentId: "test", version: "1.0" };

        const s1 = serializePolicy(policy1);
        const s2 = serializePolicy(policy2);
        expect(s1).toBe(s2);
    });
});

// ─── computePolicyHash ────────────────────────────────────────────────────────

describe("computePolicyHash", () => {
    it("returns a keccak256 hash string", () => {
        const policy = createPolicy(VALID_AGENT_ID, VALID_CONSTRAINTS);
        const hash = computePolicyHash(policy);
        expect(hash).toMatch(/^0x[a-f0-9]{64}$/); // keccak256 = 32 bytes = 64 hex chars
    });

    it("returns same hash for identical policies", () => {
        const policy = createPolicy(VALID_AGENT_ID, VALID_CONSTRAINTS);
        (policy.metadata as any).createdAt = "2026-01-01";
        const h1 = computePolicyHash(policy);
        const h2 = computePolicyHash(policy);
        expect(h1).toBe(h2);
    });

    it("returns different hash for different policies", () => {
        const p1 = createPolicy(VALID_AGENT_ID, VALID_CONSTRAINTS);
        const p2 = createPolicy(VALID_AGENT_ID, {
            ...VALID_CONSTRAINTS,
            maxTransaction: { amount: "2000000", token: "USDC", chain: "base-sepolia" },
        });
        expect(computePolicyHash(p1)).not.toBe(computePolicyHash(p2));
    });
});
