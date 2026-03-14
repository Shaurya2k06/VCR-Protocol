// ─── VCR Policy — Creation & IPFS Management ─────────────────────────────────
import { PinataSDK } from "pinata";
import stringify from "json-stringify-deterministic";
import { keccak256, toHex } from "viem";
import type { VCRPolicy, PolicyConstraints, PolicyMetadata, PinResult } from "./types.js";

// ─── Validation ───────────────────────────────────────────────────────────────

export function validatePolicy(policy: VCRPolicy): void {
  if (policy.version !== "1.0") throw new Error("Unsupported policy version");
  const c = policy.constraints;
  if (!c.maxTransaction?.amount) throw new Error("maxTransaction.amount required");
  if (!c.dailyLimit?.amount) throw new Error("dailyLimit.amount required");
  if (BigInt(c.maxTransaction.amount) > BigInt(c.dailyLimit.amount)) {
    throw new Error("maxTransaction cannot exceed dailyLimit");
  }
  if (!Array.isArray(c.allowedRecipients) || c.allowedRecipients.length === 0) {
    throw new Error("allowedRecipients must be a non-empty array");
  }
  if (!Array.isArray(c.allowedTokens) || c.allowedTokens.length === 0) {
    throw new Error("allowedTokens must be a non-empty array");
  }
  if (!Array.isArray(c.allowedChains) || c.allowedChains.length === 0) {
    throw new Error("allowedChains must be a non-empty array");
  }
  if (c.timeRestrictions) {
    const [start, end] = c.timeRestrictions.allowedHours;
    if (start < 0 || start > 23) {
      throw new Error("allowedHours start must be in range [0, 23]");
    }
    if (end < 1 || end > 24) {
      throw new Error("allowedHours end must be in range [1, 24]");
    }
    if (start >= end) throw new Error("allowedHours start must be before end");
  }
}

// ─── Policy Factory ───────────────────────────────────────────────────────────

export function createPolicy(
  agentId: string,
  constraints: PolicyConstraints,
  meta?: Partial<PolicyMetadata>
): VCRPolicy {
  const policy: VCRPolicy = {
    version: "1.0",
    agentId,
    constraints,
    metadata: {
      createdAt: new Date().toISOString(),
      createdBy: meta?.createdBy ?? "",
      description: meta?.description,
      expiresAt: meta?.expiresAt,
    },
  };
  validatePolicy(policy);
  return policy;
}

// ─── IPFS Pinning via Pinata ──────────────────────────────────────────────────

function getPinata(): PinataSDK {
  const jwt = process.env.PINATA_JWT;
  const gateway = process.env.PINATA_GATEWAY;
  if (!jwt || !gateway) {
    throw new Error("PINATA_JWT and PINATA_GATEWAY must be set in environment");
  }
  return new PinataSDK({ pinataJwt: jwt, pinataGateway: gateway });
}

export function extractPolicyCid(cidOrUri: string): string {
  if (cidOrUri.startsWith("ipfs://")) return cidOrUri.slice(7);

  const gatewayMatch = cidOrUri.match(/\/ipfs\/([^/?#]+)/i);
  if (gatewayMatch?.[1]) return gatewayMatch[1];

  return cidOrUri;
}

function parseAndValidateJsonPolicy(rawJson: string): VCRPolicy {
  const policy = JSON.parse(rawJson) as VCRPolicy;
  validatePolicy(policy);
  return policy;
}

export function parsePolicyDocument(policyDocument: string): VCRPolicy {
  const body = policyDocument.trim();
  let lastError: Error | null = null;

  try {
    return parseAndValidateJsonPolicy(body);
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
  }

  const markdownJsonBlock = body.match(/```json\s*([\s\S]*?)\s*```/i)?.[1];
  if (markdownJsonBlock) {
    try {
      return parseAndValidateJsonPolicy(markdownJsonBlock);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(
    `Policy document is not valid JSON or markdown with a fenced JSON block. ${lastError?.message ?? "unknown parse error"}`,
  );
}

/**
 * Pin a VCR Policy JSON to IPFS via Pinata.
 * Uses json-stringify-deterministic to ensure CID reproducibility.
 */
export async function pinPolicy(policy: VCRPolicy): Promise<PinResult> {
  validatePolicy(policy);
  const pinata = getPinata();

  // Deterministic serialisation — same input always yields same CID
  const deterministicPolicy = JSON.parse(stringify(policy));

  const result = await pinata.upload.public.json(deterministicPolicy);
  return {
    cid: result.cid,
    ipfsUri: `ipfs://${result.cid}`,
  };
}

/**
 * Fetch and parse a VCR Policy from IPFS.
 * Accepts either an ipfs:// URI or a raw CID.
 */
export async function fetchPolicy(cidOrUri: string): Promise<VCRPolicy> {
  const cid = extractPolicyCid(cidOrUri);

  const gateway = process.env.PINATA_GATEWAY;
  if (!gateway) throw new Error("PINATA_GATEWAY must be set");

  const url = `https://${gateway}/ipfs/${cid}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch policy from IPFS: ${response.status} ${response.statusText}`);
  }

  const payload = await response.text();
  return parsePolicyDocument(payload);
}

/**
 * Compute the deterministic JSON string of a policy (useful for CID preview).
 */
export function serializePolicy(policy: VCRPolicy): string {
  return stringify(policy);
}

/**
 * Compute a keccak256 hash of the deterministically-serialized policy.
 * Useful for integrity verification and the policy_hash metadata field.
 */
export function computePolicyHash(policy: VCRPolicy): string {
  const serialized = stringify(policy);
  return keccak256(toHex(serialized));
}
