// ─── VCR Protocol — ENS SDK Unit Tests ────────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
    encodeERC7930,
    buildAgentRegistrationKey,
    ENS_ADDRESSES,
    ERC8004_REGISTRY_SEPOLIA,
} from "../src/sdk/ens.js";

// ─── ERC-7930 Encoding ────────────────────────────────────────────────────────
// Validated against official ENSIP-25 worked example:
// https://docs.ens.domains/ensip/25#ethereum-example

describe("encodeERC7930", () => {
    it("matches the official ENSIP-25 mainnet example exactly", () => {
        // From ENSIP-25 spec: ERC-8004 on Ethereum mainnet, chain ID 1
        const result = encodeERC7930(1, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
        expect(result).toBe("0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432");
    });

    it("encodes Sepolia (chain ID 11155111) correctly", () => {
        // chainId 11155111 = 0xAA36A7 = 3 bytes big-endian
        const result = encodeERC7930(11155111, "0x8004A818BFB912233c491871b3d84c89A494BD9e");
        // version(0001) + chainType(0000) + chainRefLen(03) + chainRef(aa36a7) + addrLen(14) + addr
        expect(result).toBe("0x0001000003aa36a7148004a818bfb912233c491871b3d84c89a494bd9e");
    });

    it("handles addresses without 0x prefix", () => {
        const result = encodeERC7930(1, "8004A169FB4a3325136EB29fA0ceB6D2e539a432");
        expect(result).toBe("0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432");
    });

    it("returns consistent results for same input", () => {
        const r1 = encodeERC7930(11155111, "0x8004A818BFB912233c491871b3d84c89A494BD9e");
        const r2 = encodeERC7930(11155111, "0x8004A818BFB912233c491871b3d84c89A494BD9e");
        expect(r1).toBe(r2);
    });

    it("starts with 0x0001 (version 1)", () => {
        const result = encodeERC7930(1, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
        expect(result).toMatch(/^0x0001/);
    });

    it("has correct address length byte (0x14 = 20)", () => {
        const result = encodeERC7930(1, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
        // For chain ID 1: 0001 + 0000 + 01 + 01 + 14 = addr starts at byte index 14 (7 hex pairs from 0x)
        expect(result).toContain("14");
    });
});

// ─── Agent Registration Key ──────────────────────────────────────────────────

describe("buildAgentRegistrationKey", () => {
    it("matches the ENSIP-25 key format: agent-registration[<registry>][<agentId>]", () => {
        const key = buildAgentRegistrationKey(
            "0x8004A818BFB912233c491871b3d84c89A494BD9e",
            11155111,
            42
        );
        expect(key).toMatch(/^agent-registration\[0x[a-f0-9]+\]\[42\]$/);
    });

    it("uses correct format for agent 0 (first agent, per §2 correction #8)", () => {
        const key = buildAgentRegistrationKey(
            ERC8004_REGISTRY_SEPOLIA,
            11155111,
            0
        );
        expect(key).toMatch(/\[0\]$/);
    });

    it("produces different keys for different agentIds", () => {
        const key0 = buildAgentRegistrationKey(ERC8004_REGISTRY_SEPOLIA, 11155111, 0);
        const key1 = buildAgentRegistrationKey(ERC8004_REGISTRY_SEPOLIA, 11155111, 1);
        expect(key0).not.toBe(key1);
    });

    it("produces different keys for different chains", () => {
        const keySepolia = buildAgentRegistrationKey(ERC8004_REGISTRY_SEPOLIA, 11155111, 42);
        const keyMainnet = buildAgentRegistrationKey(
            "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
            1,
            42
        );
        expect(keySepolia).not.toBe(keyMainnet);
    });

    it("for mainnet agent 167, matches ENSIP-25 official example key fragment", () => {
        // From ENSIP-25 spec: agent-registration[0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432][167]
        const key = buildAgentRegistrationKey(
            "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
            1,
            167
        );
        expect(key).toBe(
            "agent-registration[0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432][167]"
        );
    });
});

// ─── Contract Addresses ───────────────────────────────────────────────────────

describe("ENS addresses", () => {
    it("has correct ENS Registry address (same across all networks)", () => {
        expect(ENS_ADDRESSES.registry).toBe("0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e");
    });

    it("has correct Universal Resolver address", () => {
        expect(ENS_ADDRESSES.universalResolver).toBe("0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe");
    });

    it("has correct Mainnet Public Resolver", () => {
        expect(ENS_ADDRESSES.publicResolverMainnet).toBe("0xF29100983E058B709F3D539b0c765937B804AC15");
    });

    it("has correct Sepolia Public Resolver", () => {
        expect(ENS_ADDRESSES.publicResolverSepolia).toBe("0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5");
    });
});

// ─── ERC-8004 Registry Address ────────────────────────────────────────────────

describe("ERC-8004 addresses", () => {
    it("has correct Sepolia IdentityRegistry address", () => {
        expect(ERC8004_REGISTRY_SEPOLIA).toBe("0x8004A818BFB912233c491871b3d84c89A494BD9e");
    });
});
