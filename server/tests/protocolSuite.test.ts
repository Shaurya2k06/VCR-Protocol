import { describe, expect, it } from "vitest";
import { buildProtocolSuite } from "../src/lib/protocolSuite.js";
import type { VCRPolicy } from "@vcr-protocol/sdk";

function makePolicy(): VCRPolicy {
  return {
    version: "1.0",
    agentId: "eip155:11155111:0x8004A818BFB912233c491871b3d84c89A494BD9e:0",
    constraints: {
      maxTransaction: { amount: "1000000", token: "USDC", chain: "base-sepolia" },
      dailyLimit: { amount: "5000000", token: "USDC", chain: "base-sepolia" },
      allowedRecipients: ["0x1234567890123456789012345678901234567890"],
      allowedTokens: ["USDC"],
      allowedChains: ["base-sepolia"],
      timeRestrictions: { timezone: "UTC", allowedHours: [0, 24] },
    },
    metadata: {
      createdAt: "2026-03-14T00:00:00.000Z",
      createdBy: "0x1234567890123456789012345678901234567890",
      description: "Protocol suite test policy",
    },
    ensName: "researcher.vcrtcorp.eth",
  };
}

describe("buildProtocolSuite", () => {
  it("creates a mixed pass/fail scenario set from the live policy", () => {
    const suite = buildProtocolSuite(
      "researcher.vcrtcorp.eth",
      makePolicy(),
      "100000",
      {
        amount: "100000",
        token: "USDC",
        recipient: "0x1234567890123456789012345678901234567890",
        network: "base-sepolia",
      },
    );

    expect(suite.scenarios.length).toBeGreaterThanOrEqual(5);
    expect(suite.scenarios.some((scenario) => scenario.expectedAllowed)).toBe(true);
    expect(suite.scenarios.some((scenario) => scenario.expectedAllowed === false)).toBe(true);
    expect(suite.scenarios.find((scenario) => scenario.id === "allowed-micropayment")?.actualAllowed).toBe(true);
    expect(suite.scenarios.find((scenario) => scenario.id === "blocked-recipient")?.actualAllowed).toBe(false);
    expect(suite.scenarios.find((scenario) => scenario.id === "blocked-token")?.actualAllowed).toBe(false);
    expect(suite.scenarios.find((scenario) => scenario.id === "blocked-chain")?.actualAllowed).toBe(false);
    expect(suite.scenarios.find((scenario) => scenario.id === "blocked-max-transaction")?.actualAllowed).toBe(false);
  });

  it("includes a simulated daily limit failure when an allowed payment can be constructed", () => {
    const suite = buildProtocolSuite(
      "researcher.vcrtcorp.eth",
      makePolicy(),
      "0",
      {
        amount: "100000",
        token: "USDC",
        recipient: "0x1234567890123456789012345678901234567890",
        network: "base-sepolia",
      },
    );

    const dailyScenario = suite.scenarios.find((scenario) => scenario.id === "blocked-daily-limit");
    expect(dailyScenario).toBeDefined();
    expect(dailyScenario?.simulated).toBe(true);
    expect(dailyScenario?.actualAllowed).toBe(false);
  });
});
