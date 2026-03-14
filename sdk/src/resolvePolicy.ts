// ─── VCR Protocol SDK — Policy Resolution (ENS → IPFS) ───────────────────────
// Resolves an ENS name's policy pointer to a VCRPolicy document.
// Results are cached for 5 minutes to avoid hammering ENS/IPFS on every call.

import type { VCRPolicy } from "./types.js";
import { getVCRPolicyUri } from "./ens.js";
import { extractPolicyCid, parsePolicyDocument } from "./policy.js";

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry {
  policy: VCRPolicy;
  fetchedAt: number;
}

const policyCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── IPFS fetch with multi-gateway fallback ───────────────────────────────────

/**
 * Fetch a VCRPolicy JSON document from IPFS.
 * Tries the configured Pinata gateway first, then falls back to public gateways.
 * Each gateway gets a 5-second timeout.
 */
async function fetchFromIPFS(cid: string): Promise<VCRPolicy> {
  const gateways: string[] = [];

  // Prefer the configured Pinata gateway for speed / reliability
  const pinataGateway = process.env.PINATA_GATEWAY;
  if (pinataGateway) {
    gateways.push(`https://${pinataGateway}/ipfs/${cid}`);
  }

  // Public fallbacks
  gateways.push(
    `https://ipfs.io/ipfs/${cid}`,
    `https://dweb.link/ipfs/${cid}`,
    `https://cloudflare-ipfs.com/ipfs/${cid}`,
  );

  let lastError: Error | null = null;

  for (const url of gateways) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const payload = await res.text();
        return parsePolicyDocument(payload);
      }
      lastError = new Error(`HTTP ${res.status} from ${url}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Try next gateway
    }
  }

  throw new Error(
    `Failed to fetch policy CID ${cid} from all IPFS gateways. Last error: ${lastError?.message ?? "unknown"}`,
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve a VCRPolicy for an ENS name.
 *
 * Flow:
 *   1. Check in-memory cache (5-minute TTL)
 *   2. Read the policy pointer from ENS (`contenthash`, with legacy fallback)
 *   3. Fetch policy JSON from IPFS using the CID in the text record
 *   4. Cache and return the policy
 *
 * Returns `null` if no policy pointer is set on the ENS name.
 *
 * @param ensName      - e.g. "researcher-001.acmecorp.eth"
 * @param publicClient - Optional viem public client; defaults to SEPOLIA_RPC_URL env var
 */
export async function resolveAgentPolicy(
  ensName: string,
  _publicClient?: unknown,
): Promise<VCRPolicy | null> {
  // ── 1. Check cache ─────────────────────────────────────────────────────────
  const cached = policyCache.get(ensName);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.policy;
  }

  // ── 2. Read ENS policy pointer ─────────────────────────────────────────────
  const policyUri = await getVCRPolicyUri(ensName);

  if (!policyUri) {
    return null;
  }

  // ── 3. Fetch from IPFS ─────────────────────────────────────────────────────
  // policyUri format: "ipfs://bafkrei..."
  const cid = extractPolicyCid(policyUri);
  const policy = await fetchFromIPFS(cid);

  // ── 4. Cache and return ────────────────────────────────────────────────────
  policyCache.set(ensName, { policy, fetchedAt: Date.now() });
  return policy;
}

/**
 * Remove a cached policy entry, forcing the next call to re-fetch from ENS/IPFS.
 * Call this after updating a policy document.
 */
export function invalidatePolicyCache(ensName: string): void {
  policyCache.delete(ensName);
}

/**
 * Clear all cached policy entries.
 * Useful in tests or when cycling through many agents.
 */
export function clearPolicyCache(): void {
  policyCache.clear();
}

/**
 * Return cache metadata for an ENS name (useful for debugging).
 */
export function getPolicyCacheEntry(
  ensName: string,
): { fetchedAt: number; ageMs: number; expiresInMs: number } | null {
  const entry = policyCache.get(ensName);
  if (!entry) return null;
  const ageMs = Date.now() - entry.fetchedAt;
  return {
    fetchedAt: entry.fetchedAt,
    ageMs,
    expiresInMs: Math.max(0, CACHE_TTL_MS - ageMs),
  };
}
