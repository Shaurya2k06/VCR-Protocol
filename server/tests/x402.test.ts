// ─── VCR Protocol — x402 SDK Unit Tests ───────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
    X402_HEADERS,
    X402_FACILITATOR,
    buildEIP3009TypedData,
} from "@vcr-protocol/sdk";

// ─── Header Constants (per §2 correction #10 — V2, no X- prefix) ─────────────

describe("x402 V2 headers", () => {
    it("uses PAYMENT-REQUIRED without X- prefix", () => {
        expect(X402_HEADERS.PAYMENT_REQUIRED).toBe("PAYMENT-REQUIRED");
    });

    it("uses PAYMENT-SIGNATURE without X- prefix", () => {
        expect(X402_HEADERS.PAYMENT_SIGNATURE).toBe("PAYMENT-SIGNATURE");
    });

    it("uses PAYMENT-RESPONSE without X- prefix", () => {
        expect(X402_HEADERS.PAYMENT_RESPONSE).toBe("PAYMENT-RESPONSE");
    });
});

// ─── Facilitator ──────────────────────────────────────────────────────────────

describe("x402 facilitator", () => {
    it("points to official Coinbase facilitator", () => {
        expect(X402_FACILITATOR).toBe("https://x402.org/facilitator");
    });
});

// ─── EIP-3009 Typed Data ──────────────────────────────────────────────────────

describe("buildEIP3009TypedData", () => {
    it("builds correct typed data structure", () => {
        const data = buildEIP3009TypedData({
            from: "0xSender",
            to: "0xRecipient",
            value: "100000",
            chainId: 8453,
            usdcAddress: "0xUSDC",
        });

        expect(data.primaryType).toBe("TransferWithAuthorization");
        expect(data.domain.name).toBe("USD Coin");
        expect(data.domain.version).toBe("2");
        expect(data.domain.chainId).toBe(8453);
        expect(data.message.from).toBe("0xSender");
        expect(data.message.to).toBe("0xRecipient");
        expect(data.message.value).toBe(BigInt("100000"));
    });

    it("has all required TransferWithAuthorization fields", () => {
        const data = buildEIP3009TypedData({
            from: "0xA",
            to: "0xB",
            value: "1",
            chainId: 1,
            usdcAddress: "0xC",
        });

        const typeFields = data.types.TransferWithAuthorization.map((f) => f.name);
        expect(typeFields).toContain("from");
        expect(typeFields).toContain("to");
        expect(typeFields).toContain("value");
        expect(typeFields).toContain("validAfter");
        expect(typeFields).toContain("validBefore");
        expect(typeFields).toContain("nonce");
    });

    it("uses default validAfter of 0", () => {
        const data = buildEIP3009TypedData({
            from: "0xA",
            to: "0xB",
            value: "1",
            chainId: 1,
            usdcAddress: "0xC",
        });

        expect(data.message.validAfter).toBe(BigInt(0));
    });

    it("generates valid nonce as bytes32", () => {
        const data = buildEIP3009TypedData({
            from: "0xA",
            to: "0xB",
            value: "1",
            chainId: 1,
            usdcAddress: "0xC",
        });

        expect(data.message.nonce).toMatch(/^0x[a-f0-9]+$/);
    });

    it("sets validBefore in the future", () => {
        const now = Math.floor(Date.now() / 1000);
        const data = buildEIP3009TypedData({
            from: "0xA",
            to: "0xB",
            value: "1",
            chainId: 1,
            usdcAddress: "0xC",
        });

        expect(Number(data.message.validBefore)).toBeGreaterThan(now);
    });
});
