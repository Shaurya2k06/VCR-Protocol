// ─── VCR Protocol SDK — ENS Link Verification Tests ──────────────────────────
import { describe, it, expect } from "vitest";
import {
  encodeERC7930,
  buildAgentRegistrationKey,
  ERC8004_REGISTRY_SEPOLIA,
} from "../src/ens.js";
import { CONTRACTS, CHAIN_IDS } from "../src/constants.js";

// ─── encodeERC7930 ────────────────────────────────────────────────────────────

describe("encodeERC7930", () => {
  it("encodes Ethereum mainnet (chainId=1) correctly", () => {
    // Validated against the official ENSIP-25 example:
    // https://docs.ens.domains/ensip/25#ethereum-example
    const result = encodeERC7930(
      1,
      "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    );
    expect(result).toBe(
      "0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432",
    );
  });

  it("encodes Sepolia (chainId=11155111) correctly", () => {
    // chainId 11155111 = 0xAA36A7 → big-endian minimal bytes: [0xAA, 0x36, 0xA7]
    // ChainRefLength = 0x03
    const result = encodeERC7930(
      11155111,
      "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    );
    expect(result).toBe(
      "0x0001000003aa36a7148004a818bfb912233c491871b3d84c89a494bd9e",
    );
  });

  it("produces a 0x-prefixed lowercase hex string", () => {
    const result = encodeERC7930(1, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
    expect(result).toMatch(/^0x[0-9a-f]+$/);
  });

  it("always starts with version 0x0001", () => {
    const result = encodeERC7930(1, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
    expect(result.startsWith("0x0001")).toBe(true);
  });

  it("always has chain type 0x0000 (EVM) in bytes 2-3", () => {
    const result = encodeERC7930(1, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
    // After 0x, bytes 0-1 = version (0001), bytes 2-3 = chainType (0000)
    expect(result.slice(6, 10)).toBe("0000");
  });

  it("embeds the address in lowercase without 0x prefix", () => {
    const addr = "0xABCDEF1234567890ABCDef1234567890abcdef12";
    const result = encodeERC7930(1, addr);
    expect(result).toContain("abcdef1234567890abcdef1234567890abcdef12");
  });

  it("handles single-byte chain IDs (chainId=1) — ChainRefLength=1", () => {
    // chainId 1 → [0x01] → length byte = 0x01
    const result = encodeERC7930(1, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
    // After 0x0001 0000: next byte is ChainRefLength = "01"
    expect(result.slice(10, 12)).toBe("01");
  });

  it("handles two-byte chain IDs (chainId=256 = 0x0100) — ChainRefLength=2", () => {
    const result = encodeERC7930(256, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
    // 256 = 0x0100 → big-endian minimal: [0x01, 0x00] → length = 02
    expect(result.slice(10, 12)).toBe("02");
    expect(result.slice(12, 16)).toBe("0100");
  });

  it("handles three-byte chain IDs (chainId=11155111) — ChainRefLength=3", () => {
    const result = encodeERC7930(
      11155111,
      "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    );
    // 11155111 = 0xAA36A7 → 3 bytes → length = 03
    expect(result.slice(10, 12)).toBe("03");
  });

  it("always ends with address length 0x14 (20) followed by 40 hex chars", () => {
    const addr = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
    const result = encodeERC7930(1, addr);
    // Last 42 chars = "14" + 40 addr hex chars
    expect(result.slice(-42)).toBe("148004a169fb4a3325136eb29fa0ceb6d2e539a432");
  });

  it("is deterministic — same inputs always produce the same output", () => {
    const a = encodeERC7930(11155111, "0x8004A818BFB912233c491871b3d84c89A494BD9e");
    const b = encodeERC7930(11155111, "0x8004A818BFB912233c491871b3d84c89A494BD9e");
    expect(a).toBe(b);
  });

  it("produces different output for different chainIds", () => {
    const addr = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
    expect(encodeERC7930(1, addr)).not.toBe(encodeERC7930(11155111, addr));
  });

  it("produces different output for different addresses", () => {
    const r1 = encodeERC7930(1, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
    const r2 = encodeERC7930(1, "0x8004A818BFB912233c491871b3d84c89A494BD9e");
    expect(r1).not.toBe(r2);
  });

  it("normalises address regardless of input case", () => {
    const lower  = encodeERC7930(1, "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432");
    const upper  = encodeERC7930(1, "0x8004A169FB4A3325136EB29FA0CEB6D2E539A432");
    const mixed  = encodeERC7930(1, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
    expect(lower).toBe(upper);
    expect(upper).toBe(mixed);
  });

  it("handles Base Sepolia (chainId=84532 = 0x14A34) correctly", () => {
    const result = encodeERC7930(84532, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
    // 84532 = 0x014A34 — minimal big-endian: [0x01, 0x4A, 0x34] → length=03
    expect(result.slice(10, 12)).toBe("03");
    expect(result.slice(12, 18)).toBe("014a34");
  });

  it("handles Hoodi testnet (chainId=560048 = 0x88BB0) correctly", () => {
    const result = encodeERC7930(560048, "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
    // 560048 = 0x088BB0 — minimal big-endian: [0x08, 0x8B, 0xB0] → length=03
    expect(result.slice(10, 12)).toBe("03");
    expect(result.slice(12, 18)).toBe("088bb0");
  });
});

// ─── buildAgentRegistrationKey ────────────────────────────────────────────────

describe("buildAgentRegistrationKey", () => {
  it("produces the correct key for Sepolia registry, agentId=0", () => {
    const key = buildAgentRegistrationKey(
      ERC8004_REGISTRY_SEPOLIA,
      11155111,
      0,
    );
    const encodedRegistry = encodeERC7930(11155111, ERC8004_REGISTRY_SEPOLIA);
    expect(key).toBe(`agent-registration[${encodedRegistry}][0]`);
  });

  it("produces the correct key for Sepolia registry, agentId=167", () => {
    // agentId 167 is the example used in the ENSIP-25 spec
    const key = buildAgentRegistrationKey(
      ERC8004_REGISTRY_SEPOLIA,
      11155111,
      167,
    );
    expect(key).toContain("[167]");
  });

  it("format is always: agent-registration[<encoded>][<agentId>]", () => {
    const key = buildAgentRegistrationKey(ERC8004_REGISTRY_SEPOLIA, 11155111, 42);
    expect(key).toMatch(/^agent-registration\[0x[0-9a-f]+\]\[42\]$/);
  });

  it("encodes the registry address inside square brackets", () => {
    const key = buildAgentRegistrationKey(
      ERC8004_REGISTRY_SEPOLIA,
      11155111,
      0,
    );
    // registry address must appear (lowercased, no 0x) inside the first bracket
    expect(key.toLowerCase()).toContain(
      ERC8004_REGISTRY_SEPOLIA.toLowerCase().replace("0x", ""),
    );
  });

  it("produces different keys for different agentIds", () => {
    const k0 = buildAgentRegistrationKey(ERC8004_REGISTRY_SEPOLIA, 11155111, 0);
    const k1 = buildAgentRegistrationKey(ERC8004_REGISTRY_SEPOLIA, 11155111, 1);
    expect(k0).not.toBe(k1);
  });

  it("produces different keys for different chainIds", () => {
    const k1 = buildAgentRegistrationKey(ERC8004_REGISTRY_SEPOLIA, 1, 0);
    const k2 = buildAgentRegistrationKey(ERC8004_REGISTRY_SEPOLIA, 11155111, 0);
    expect(k1).not.toBe(k2);
  });

  it("produces different keys for different registry addresses", () => {
    const k1 = buildAgentRegistrationKey(
      "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
      11155111,
      0,
    );
    const k2 = buildAgentRegistrationKey(
      ERC8004_REGISTRY_SEPOLIA,
      11155111,
      0,
    );
    expect(k1).not.toBe(k2);
  });

  it("agentId 0 is valid (ERC-8004 agentIds start from 0, not 1)", () => {
    const key = buildAgentRegistrationKey(ERC8004_REGISTRY_SEPOLIA, 11155111, 0);
    expect(key).toMatch(/\[0\]$/);
  });

  it("does not URL-encode or escape any characters", () => {
    const key = buildAgentRegistrationKey(ERC8004_REGISTRY_SEPOLIA, 11155111, 5);
    expect(key).not.toContain("%");
    expect(key).not.toContain("\\");
  });

  it("is deterministic", () => {
    const k1 = buildAgentRegistrationKey(ERC8004_REGISTRY_SEPOLIA, 11155111, 42);
    const k2 = buildAgentRegistrationKey(ERC8004_REGISTRY_SEPOLIA, 11155111, 42);
    expect(k1).toBe(k2);
  });
});

// ─── CONTRACTS constant ───────────────────────────────────────────────────────

describe("CONTRACTS", () => {
  it("ERC8004 Sepolia address matches ERC8004_REGISTRY_SEPOLIA export", () => {
    expect(CONTRACTS.ERC8004.IdentityRegistry.sepolia.toLowerCase()).toBe(
      ERC8004_REGISTRY_SEPOLIA.toLowerCase(),
    );
  });

  it("ENS Registry address is the same on all networks (well-known constant)", () => {
    // ENS Registry is deployed at the same address on all EVM networks
    expect(CONTRACTS.ENS.Registry).toBe(
      "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
    );
  });

  it("Sepolia PublicResolver differs from mainnet PublicResolver", () => {
    expect(CONTRACTS.ENS.PublicResolver.sepolia).not.toBe(
      CONTRACTS.ENS.PublicResolver.mainnet,
    );
  });

  it("Sepolia PublicResolver is correct", () => {
    expect(CONTRACTS.ENS.PublicResolver.sepolia).toBe(
      "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5",
    );
  });

  it("mainnet PublicResolver is correct", () => {
    expect(CONTRACTS.ENS.PublicResolver.mainnet).toBe(
      "0xF29100983E058B709F3D539b0c765937B804AC15",
    );
  });

  it("ERC8004 mainnet and sepolia addresses are different", () => {
    expect(CONTRACTS.ERC8004.IdentityRegistry.mainnet).not.toBe(
      CONTRACTS.ERC8004.IdentityRegistry.sepolia,
    );
  });
});

// ─── CHAIN_IDS constant ───────────────────────────────────────────────────────

describe("CHAIN_IDS", () => {
  it("mainnet is 1", () => {
    expect(CHAIN_IDS.mainnet).toBe(1);
  });

  it("sepolia is 11155111", () => {
    expect(CHAIN_IDS.sepolia).toBe(11155111);
  });

  it("hoodi is 560048 (NOT Holesky — Holesky is shut down)", () => {
    expect(CHAIN_IDS.hoodi).toBe(560048);
    // Holesky was chain ID 17000 — must NOT be present
    expect(Object.values(CHAIN_IDS)).not.toContain(17000);
  });

  it("base is 8453", () => {
    expect(CHAIN_IDS.base).toBe(8453);
  });

  it("baseSepolia is 84532", () => {
    expect(CHAIN_IDS.baseSepolia).toBe(84532);
  });

  it("all chain IDs are unique", () => {
    const values = Object.values(CHAIN_IDS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it("all chain IDs are positive integers", () => {
    for (const id of Object.values(CHAIN_IDS)) {
      expect(id).toBeGreaterThan(0);
      expect(Number.isInteger(id)).toBe(true);
    }
  });
});

// ─── ENSIP-25 key format compliance ───────────────────────────────────────────

describe("ENSIP-25 key format compliance", () => {
  it("matches the official ENSIP-25 example for mainnet agentId=167", () => {
    // From https://docs.ens.domains/ensip/25#ethereum-example
    const mainnetRegistry = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
    const encoded = encodeERC7930(1, mainnetRegistry);

    expect(encoded).toBe(
      "0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432",
    );

    const key = buildAgentRegistrationKey(mainnetRegistry, 1, 167);
    expect(key).toBe(
      "agent-registration[0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432][167]",
    );
  });

  it("key contains no whitespace", () => {
    const key = buildAgentRegistrationKey(ERC8004_REGISTRY_SEPOLIA, 11155111, 0);
    expect(key).not.toMatch(/\s/);
  });

  it("agentId in key is a plain decimal integer string, not hex", () => {
    // agentId must be a plain decimal string per ENSIP-25
    const key = buildAgentRegistrationKey(ERC8004_REGISTRY_SEPOLIA, 11155111, 255);
    // Should end with [255], NOT [0xff] or [0xFF]
    expect(key.endsWith("[255]")).toBe(true);
  });
});
