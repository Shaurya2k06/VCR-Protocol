import { describe, expect, it } from "vitest";

import { resolveENSConfig, buildPolicyGatewayUrl } from "../src/ens.js";

describe("resolveENSConfig", () => {
  const signer = "0x328a3C7E211FC2caDfdF64851DE46CB9220b4A9A";

  it("builds platform subdomain names with signer-managed defaults", () => {
    const result = resolveENSConfig(
      {
        name: "agent-one",
        baseDomain: "vcrtcorp.eth",
      },
      signer,
    );

    expect(result).toEqual({
      ensName: "agent-one.vcrtcorp.eth",
      mode: "platform-subdomain",
      managerAddress: signer,
      ownerAddress: signer,
      registrationYears: 1,
    });
  });

  it("builds direct .eth names for user-root mode", () => {
    const result = resolveENSConfig(
      {
        name: "shaurya-ai",
        baseDomain: "eth",
        ensMode: "user-root",
        ensManagerAddress: "0x1111111111111111111111111111111111111111",
        ensOwnerAddress: "0x2222222222222222222222222222222222222222",
        ensRegistrationYears: 2,
      },
      signer,
    );

    expect(result).toEqual({
      ensName: "shaurya-ai.eth",
      mode: "user-root",
      managerAddress: "0x1111111111111111111111111111111111111111",
      ownerAddress: "0x2222222222222222222222222222222222222222",
      registrationYears: 2,
    });
  });

  it("defaults ownerAddress to the first allowed recipient when provided", () => {
    const result = resolveENSConfig(
      {
        name: "recipient-owned",
        baseDomain: "eth",
        ensMode: "user-root",
        ensManagerAddress: "0x1111111111111111111111111111111111111111",
        allowedRecipients: ["0x3333333333333333333333333333333333333333"],
      },
      signer,
    );

    expect(result.ownerAddress).toBe("0x3333333333333333333333333333333333333333");
  });

  it("rejects platform mode when given bare eth as a parent domain", () => {
    expect(() =>
      resolveENSConfig(
        {
          name: "broken",
          baseDomain: "eth",
          ensMode: "platform-subdomain",
        },
        signer,
      ),
    ).toThrow(/parent domain/i);
  });
});

describe("buildPolicyGatewayUrl", () => {
  it("normalizes a bare gateway host from env", () => {
    process.env.PINATA_GATEWAY = "rose-obliged-wildcat-829.mypinata.cloud/";
    expect(buildPolicyGatewayUrl("bafybeigdyrzt")).toBe(
      "https://rose-obliged-wildcat-829.mypinata.cloud/ipfs/bafybeigdyrzt",
    );
  });
});
