// ─── VCR Protocol — ERC-8004 SDK Unit Tests ──────────────────────────────────
import { describe, it, expect } from "vitest";
import { ERC8004_ADDRESSES, buildAgentMetadataJson } from "@vcr-protocol/sdk";

// ─── Contract Addresses (per §3 and §11 of reference + official GitHub) ───────

describe("ERC-8004 contract addresses", () => {
    it("has correct Mainnet IdentityRegistry address", () => {
        expect(ERC8004_ADDRESSES.identityRegistry.mainnet).toBe(
            "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
        );
    });

    it("has correct Sepolia IdentityRegistry address", () => {
        expect(ERC8004_ADDRESSES.identityRegistry.sepolia).toBe(
            "0x8004A818BFB912233c491871b3d84c89A494BD9e"
        );
    });

    it("has correct Mainnet ReputationRegistry address", () => {
        expect(ERC8004_ADDRESSES.reputationRegistry.mainnet).toBe(
            "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63"
        );
    });

    it("has correct Sepolia ReputationRegistry address", () => {
        expect(ERC8004_ADDRESSES.reputationRegistry.sepolia).toBe(
            "0x8004B663056A597Dffe9eCcC1965A193B7388713"
        );
    });
});

// ─── Agent Metadata JSON Builder ──────────────────────────────────────────────
// Per ERC-8004 spec: https://eips.ethereum.org/EIPS/eip-8004#agent-uri-and-agent-registration-file

describe("buildAgentMetadataJson", () => {
    it("uses the official ERC-8004 type URI", () => {
        const meta = buildAgentMetadataJson(
            { name: "Test Agent", description: "A test", active: true },
            "0x8004A818BFB912233c491871b3d84c89A494BD9e",
            42,
            11155111
        );

        expect(meta.type).toBe("https://eips.ethereum.org/EIPS/eip-8004#registration-v1");
    });

    it("builds registrations with agentRegistry in CAIP-2 format", () => {
        const meta = buildAgentMetadataJson(
            { name: "Agent", active: true },
            "0x8004A818BFB912233c491871b3d84c89A494BD9e",
            0,
            11155111
        );

        expect(meta.registrations).toHaveLength(1);
        expect(meta.registrations![0].agentRegistry).toBe(
            "eip155:11155111:0x8004A818BFB912233c491871b3d84c89A494BD9e"
        );
        expect(meta.registrations![0].agentId).toBe(0);
    });

    it("uses mainnet format correctly", () => {
        const meta = buildAgentMetadataJson(
            { name: "Agent", active: true },
            "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
            167,
            1
        );

        expect(meta.registrations![0].agentRegistry).toBe(
            "eip155:1:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
        );
        expect(meta.registrations![0].agentId).toBe(167);
    });

    it("includes standard trust types", () => {
        const meta = buildAgentMetadataJson(
            { name: "Agent", active: true },
            "0x8004A818BFB912233c491871b3d84c89A494BD9e",
            0
        );

        expect(meta.supportedTrust).toContain("erc8004-reputation");
        expect(meta.supportedTrust).toContain("vcr-policy");
    });

    it("includes services when provided with name field", () => {
        const meta = buildAgentMetadataJson(
            {
                name: "Agent",
                active: true,
                services: [{ name: "web", endpoint: "https://agent.example.com/api" }],
            },
            "0x8004A818BFB912233c491871b3d84c89A494BD9e",
            42
        );

        expect(meta.services).toHaveLength(1);
        expect(meta.services![0].name).toBe("web");
    });

    it("sets agent 0 (first ID, per §2 correction #8)", () => {
        const meta = buildAgentMetadataJson(
            { name: "First Agent", active: true },
            "0x8004A818BFB912233c491871b3d84c89A494BD9e",
            0,
            11155111
        );

        expect(meta.registrations![0].agentId).toBe(0);
    });
});
