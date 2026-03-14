import { describe, expect, it } from "vitest";
import {
  ERC8004_ADDRESSES,
  buildAgentMetadataJson,
  findAgentRegistrationEns,
} from "../src/erc8004.js";

describe("buildAgentMetadataJson", () => {
  it("includes the correct self-referential registration entry", () => {
    const metadata = buildAgentMetadataJson(
      {
        name: "test-agent",
        description: "test",
        services: [{ name: "ens", endpoint: "test-agent.vcrtcorp.eth" }],
        active: true,
      },
      ERC8004_ADDRESSES.identityRegistry.sepolia,
      1785,
      11155111,
    );

    expect(metadata.type).toBe("https://eips.ethereum.org/EIPS/eip-8004#registration-v1");
    expect(metadata.registrations).toEqual([
      {
        agentRegistry: `eip155:11155111:${ERC8004_ADDRESSES.identityRegistry.sepolia}`,
        agentId: 1785,
      },
    ]);
  });

  it("preserves supportedTrust when provided", () => {
    const metadata = buildAgentMetadataJson(
      {
        name: "test-agent",
        active: true,
        supportedTrust: ["erc8004-reputation", "vcr-policy"],
      },
      ERC8004_ADDRESSES.identityRegistry.sepolia,
      1,
    );

    expect(metadata.supportedTrust).toEqual(["erc8004-reputation", "vcr-policy"]);
  });
});

describe("findAgentRegistrationEns", () => {
  it("finds the explicit ENS service endpoint", () => {
    const ensName = findAgentRegistrationEns({
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name: "agent",
      active: true,
      services: [{ name: "ens", endpoint: "agent.vcrtcorp.eth" }],
    });

    expect(ensName).toBe("agent.vcrtcorp.eth");
  });

  it("falls back to .eth service endpoints", () => {
    const ensName = findAgentRegistrationEns({
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name: "agent",
      active: true,
      services: [{ name: "profile", endpoint: "agent.vcrtcorp.eth" }],
    });

    expect(ensName).toBe("agent.vcrtcorp.eth");
  });
});
