// ─── x402 Protocol — VCR-Aware Payment Middleware ─────────────────────────────
import type { Request, Response, NextFunction } from "express";
import { canAgentSpend } from "./verifier.js";
import type { SpendRequest, X402PaymentRequirement } from "./types.js";
import type { DailySpentGetter } from "./verifier.js";

// x402 V2 Header constants (no X- prefix)
export const X402_HEADERS = {
  PAYMENT_REQUIRED: "PAYMENT-REQUIRED",
  PAYMENT_SIGNATURE: "PAYMENT-SIGNATURE",
  PAYMENT_RESPONSE: "PAYMENT-RESPONSE",
} as const;

export const X402_FACILITATOR = "https://x402.org/facilitator";

// ─── Server Middleware ────────────────────────────────────────────────────────

export interface VCRPaymentOptions {
  /** Amount in base units, e.g. "100000" = $0.10 USDC (6 decimals) */
  amount: string;
  token: string;
  network: string;
  recipient: string;
  facilitator?: string;
  /** If provided, also verify the agent's VCR policy before accepting payment */
  vcrCheck?: {
    getDailySpent: DailySpentGetter;
  };
}

/**
 * Express middleware that gates a route behind an x402 payment.
 * Optionally also runs the VCR canAgentSpend() check.
 *
 * Flow:
 *   1. No payment → return 402 with PAYMENT-REQUIRED header
 *   2. Payment signature present → verify via facilitator
 *   3. VCR check (if configured) → verify policy
 *   4. Settle payment → pass to route handler
 */
export function vcrPaymentMiddleware(options: VCRPaymentOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const paymentSig = req.headers[X402_HEADERS.PAYMENT_SIGNATURE.toLowerCase()];

    if (!paymentSig) {
      // Return 402 with payment requirements
      const requirement: X402PaymentRequirement = {
        price: options.amount,
        token: options.token,
        network: options.network,
        recipient: options.recipient,
        facilitator: options.facilitator ?? X402_FACILITATOR,
      };

      res.setHeader(X402_HEADERS.PAYMENT_REQUIRED, JSON.stringify(requirement));
      res.status(402).json({
        error: "Payment Required",
        requirement,
      });
      return;
    }

    // ── Verify payment signature with facilitator ──────────────────────────────
    const facilitator = options.facilitator ?? X402_FACILITATOR;
    let verifyResult: { valid: boolean; from?: string; error?: string };
    try {
      const verifyResponse = await fetch(`${facilitator}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature: paymentSig,
          amount: options.amount,
          token: options.token,
          network: options.network,
          recipient: options.recipient,
        }),
      });
      verifyResult = await verifyResponse.json() as typeof verifyResult;
    } catch (err) {
      res.status(500).json({ error: "Facilitator verification failed", details: (err as Error).message });
      return;
    }

    if (!verifyResult.valid) {
      res.status(402).json({ error: "Invalid payment signature", details: verifyResult.error });
      return;
    }

    // ── Optional VCR policy check ──────────────────────────────────────────────
    if (options.vcrCheck) {
      const ensName = req.headers["x-agent-ens"] as string;
      if (!ensName) {
        res.status(400).json({ error: "x-agent-ens header required for VCR policy check" });
        return;
      }

      const spendReq: SpendRequest = {
        amount: options.amount,
        token: options.token,
        recipient: options.recipient,
        chain: options.network,
      };

      const result = await canAgentSpend(ensName, spendReq, options.vcrCheck.getDailySpent);
      if (!result.allowed) {
        res.status(403).json({ error: "VCR policy check failed", reason: result.reason });
        return;
      }
    }

    // ── Settle payment ────────────────────────────────────────────────────────
    try {
      const settleResponse = await fetch(`${facilitator}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature: paymentSig,
          amount: options.amount,
          token: options.token,
          network: options.network,
          recipient: options.recipient,
        }),
      });
      const settleResult = await settleResponse.json() as Record<string, unknown>;
      res.setHeader(X402_HEADERS.PAYMENT_RESPONSE, JSON.stringify(settleResult));
    } catch (err) {
      res.status(500).json({ error: "Payment settlement failed", details: (err as Error).message });
      return;
    }

    next();
  };
}

// ─── Client-Side VCR Payment Helper ──────────────────────────────────────────

export interface VCRClientOptions {
  ensName: string;
  privateKey: string;
  chainId: number;
  usdcAddress: string;
  getDailySpent: DailySpentGetter;
}

/**
 * Parse an x402 402 response to extract payment requirements.
 */
export function parsePaymentRequired(response: Response | globalThis.Response): X402PaymentRequirement | null {
  const header = (response as globalThis.Response).headers.get(X402_HEADERS.PAYMENT_REQUIRED);
  if (!header) return null;
  try {
    return JSON.parse(header) as X402PaymentRequirement;
  } catch {
    return null;
  }
}

/**
 * Build an EIP-3009 TransferWithAuthorization typed data object.
 * Used to sign x402 payments.
 */
export function buildEIP3009TypedData(params: {
  from: string;
  to: string;
  value: string;
  validAfter?: number;
  validBefore?: number;
  nonce?: string;
  chainId: number;
  usdcAddress: string;
}) {
  const {
    from, to, value,
    validAfter = 0,
    validBefore = Math.floor(Date.now() / 1000) + 3600,
    nonce = `0x${crypto.randomUUID().replace(/-/g, "")}`,
    chainId,
    usdcAddress,
  } = params;

  return {
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization" as const,
    domain: {
      name: "USD Coin",
      version: "2",
      chainId,
      verifyingContract: usdcAddress,
    },
    message: {
      from,
      to,
      value: BigInt(value),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce: nonce as `0x${string}`,
    },
  };
}
