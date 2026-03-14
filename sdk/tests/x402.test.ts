import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/verifier.js", () => ({
  canAgentSpend: vi.fn(),
}));

import { canAgentSpend } from "../src/verifier.js";
import {
  X402_HEADERS,
  buildEIP3009TypedData,
  createSignedPaymentRequest,
  fetchWithVCRPayment,
  parsePaymentRequired,
  parsePaymentSignatureHeader,
} from "../src/x402.js";

describe("x402 helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses PAYMENT-REQUIRED responses", () => {
    const response = new Response("{}", {
      status: 402,
      headers: {
        [X402_HEADERS.PAYMENT_REQUIRED]: JSON.stringify({
          price: "100000",
          token: "USDC",
          network: "base-sepolia",
          recipient: "0x1111111111111111111111111111111111111111",
          facilitator: "https://x402.org/facilitator",
        }),
      },
    });

    expect(parsePaymentRequired(response)).toEqual({
      price: "100000",
      token: "USDC",
      network: "base-sepolia",
      recipient: "0x1111111111111111111111111111111111111111",
      facilitator: "https://x402.org/facilitator",
    });
  });

  it("creates signed payment requests after VCR preflight", async () => {
    vi.mocked(canAgentSpend).mockResolvedValue({
      allowed: true,
    });

    const signed = await createSignedPaymentRequest(
      {
        price: "100000",
        token: "USDC",
        network: "base-sepolia",
        recipient: "0x1111111111111111111111111111111111111111",
        facilitator: "https://x402.org/facilitator",
      },
      {
        ensName: "agent.vcrtcorp.eth",
        privateKey: "0x59c6995e998f97a5a0044966f0945382d3e1b5f56b4f77f5c5d7a7a7f4c5f3d2",
        chainId: 84532,
        usdcAddress: "0x2222222222222222222222222222222222222222",
        getDailySpent: async () => "0",
      },
    );

    expect(signed.scheme).toBe("exact");
    expect(signed.authorization.ensName).toBe("agent.vcrtcorp.eth");
    expect(signed.authorization.signature).toMatch(/^0x[0-9a-f]+$/);
  });

  it("retries a 402 response with PAYMENT-SIGNATURE header", async () => {
    vi.mocked(canAgentSpend).mockResolvedValue({
      allowed: true,
    });

    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("payment required", {
        status: 402,
        headers: {
          [X402_HEADERS.PAYMENT_REQUIRED]: JSON.stringify({
            price: "100000",
            token: "USDC",
            network: "base-sepolia",
            recipient: "0x1111111111111111111111111111111111111111",
            facilitator: "https://x402.org/facilitator",
          }),
        },
      }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const response = await fetchWithVCRPayment(
      "https://example.com/premium",
      { method: "GET" },
      {
        ensName: "agent.vcrtcorp.eth",
        privateKey: "0x59c6995e998f97a5a0044966f0945382d3e1b5f56b4f77f5c5d7a7a7f4c5f3d2",
        chainId: 84532,
        usdcAddress: "0x2222222222222222222222222222222222222222",
        getDailySpent: async () => "0",
        fetchImpl,
      },
    );

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const retryHeaders = new Headers(fetchImpl.mock.calls[1]?.[1]?.headers);
    expect(retryHeaders.get("x-agent-ens")).toBe("agent.vcrtcorp.eth");
    const signatureHeader = retryHeaders.get(X402_HEADERS.PAYMENT_SIGNATURE);
    expect(signatureHeader).toBeTruthy();

    const parsed = parsePaymentSignatureHeader(signatureHeader!);
    expect(parsed?.authorization.ensName).toBe("agent.vcrtcorp.eth");
  });

  it("builds EIP-3009 typed data with the expected primary type", () => {
    const typedData = buildEIP3009TypedData({
      from: "0x1111111111111111111111111111111111111111",
      to: "0x2222222222222222222222222222222222222222",
      value: "100000",
      chainId: 84532,
      usdcAddress: "0x3333333333333333333333333333333333333333",
      nonce: "0x1234567890123456789012345678901234567890123456789012345678901234",
    });

    expect(typedData.primaryType).toBe("TransferWithAuthorization");
    expect(typedData.message.value).toBe(100000n);
  });
});
