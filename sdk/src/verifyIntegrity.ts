// ─── VCR Protocol SDK — Policy Integrity Verification ────────────────────────
// Proves the live BitGo wallet policy hasn't drifted from the commitment
// published in the VCR policy document on IPFS.
//
// CRITICAL: Uses json-stringify-deterministic for all hashing.
//           JSON.stringify key order is NOT stable across JS runtimes — any
//           use of it here will produce incorrect hashes and silent failures.

import { keccak256, toHex } from "viem";
import stringify from "json-stringify-deterministic";
import { resolveAgentPolicy } from "./resolvePolicy.js";
import type { IntegrityResult } from "./types.js";

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Verify that the live BitGo wallet policy matches the commitment stored
 * in the on-chain VCR policy document.
 *
 * A mismatch means someone changed the BitGo policy after the VCR document
 * was published — which may indicate drift, tampering, or an unauthorized
 * policy update.
 *
 * Flow:
 *   1. Resolve VCR policy from ENS → IPFS to obtain `policy_hash`
 *   2. Fetch the live policy object from the BitGo wallet via `.getPolicies()`
 *   3. Compute keccak256 of the deterministically-serialized live policy
 *   4. Compare the two hashes
 *
 * @param ensName      - Agent's ENS name, e.g. "researcher-001.acmecorp.eth"
 * @param bitgoWallet  - BitGo Wallet instance (from `getWallet(walletId)`)
 * @param publicClient - Optional viem public client for ENS resolution;
 *                       defaults to SEPOLIA_RPC_URL environment variable
 */
export async function verifyPolicyIntegrity(
  ensName: string,
  bitgoWallet: { getPolicies: () => Promise<unknown> },
  publicClient?: {
    getEnsText: (params: { name: string; key: string }) => Promise<string | null>;
  },
): Promise<IntegrityResult> {
  // ── Step 1: Resolve VCR policy from ENS/IPFS ──────────────────────────────
  const policy = await resolveAgentPolicy(ensName, publicClient);

  if (!policy) {
    throw new Error(
      `No VCR policy found for "${ensName}". ` +
      `Ensure the vcr.policy ENS text record is set and the IPFS document is accessible.`,
    );
  }

  if (!policy.policy_hash) {
    throw new Error(
      `VCR policy for "${ensName}" does not contain a policy_hash field. ` +
      `Re-create the agent to generate an integrity-verifiable policy.`,
    );
  }

  const onChainHash = policy.policy_hash;

  // ── Step 2: Fetch the live BitGo policy and compute its hash ──────────────
  // CRITICAL: Must use deterministic stringify — JSON.stringify key order
  // varies between JS runtimes/engines, which produces different hashes for
  // the same logical object.
  let livePolicies: unknown;
  try {
    livePolicies = await bitgoWallet.getPolicies();
  } catch (err) {
    throw new Error(
      `Failed to fetch live BitGo policies: ${(err as Error).message}`,
    );
  }

  const liveJson   = stringify(livePolicies);
  const liveHash   = keccak256(toHex(liveJson));
  const match      = onChainHash.toLowerCase() === liveHash.toLowerCase();

  return {
    match,
    onChainHash,
    liveHash,
    // driftedFields is undefined when match=true.
    // When match=false we cannot reconstruct the original policy from its hash,
    // so we cannot enumerate specific drifted fields. Callers should treat any
    // mismatch as a full policy change and re-audit the wallet.
    driftedFields: match ? undefined : [],
  };
}

/**
 * Compute the keccak256 integrity hash for an arbitrary BitGo policy object.
 * Use this when constructing a VCRPolicy document to set the `policy_hash` field.
 *
 * @param livePolicies - The raw object returned by `wallet.getPolicies()`
 */
export function computeBitGoPolicyHash(livePolicies: unknown): string {
  // CRITICAL: deterministic stringify — same input always yields same hash
  const json = stringify(livePolicies);
  return keccak256(toHex(json));
}
