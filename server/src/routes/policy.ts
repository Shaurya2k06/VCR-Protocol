// ─── Policy Routes ─────────────────────────────────────────────────────────────
import { Router } from "express";
import {
  createPolicy,
  validatePolicy,
  pinPolicy,
  fetchPolicy,
  setVCRPolicyRecord,
  setAgentRegistrationRecord,
  setAllENSRecords,
  getVCRPolicyUri,
} from "@vcr-protocol/sdk";
import type { PolicyConstraints, PolicyMetadata } from "@vcr-protocol/sdk";

const router = Router();

/**
 * POST /api/policy
 * Create, validate, and pin a VCR policy to IPFS.
 * Optionally also sets the ENS text records.
 */
router.post("/", async (req, res) => {
  try {
    const {
      agentId,
      constraints,
      metadata,
      ensName,
      agentIdNumber,
      setENS = false,
    } = req.body as {
      agentId: string;
      constraints: PolicyConstraints;
      metadata?: Partial<PolicyMetadata>;
      ensName?: string;
      agentIdNumber?: number;
      setENS?: boolean;
    };

    if (!agentId || !constraints) {
      return res.status(400).json({ error: "agentId and constraints are required" });
    }

    // Create and validate the policy
    const policy = createPolicy(agentId, constraints, metadata);

    // Pin to IPFS
    const pinResult = await pinPolicy(policy);

    const response: Record<string, unknown> = {
      policy,
      cid: pinResult.cid,
      ipfsUri: pinResult.ipfsUri,
    };

    // Optionally set ENS records in one transaction
    if (setENS && ensName && agentIdNumber !== undefined) {
      const ensResult = await setAllENSRecords(ensName, agentIdNumber, pinResult.ipfsUri);
      response.ensTxHash = ensResult.txHash;
      response.ensName = ensName;
    }

    return res.status(201).json(response);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/policy/:ensName
 * Resolve an ENS name → fetch its VCR policy from IPFS.
 */
router.get("/:ensName", async (req, res) => {
  try {
    const { ensName } = req.params;
    const policyUri = await getVCRPolicyUri(ensName);

    if (!policyUri) {
      return res.status(404).json({
        error: "No vcr.policy text record found for this ENS name",
        ensName,
      });
    }

    const policy = await fetchPolicy(policyUri);
    return res.json({ ensName, policyUri, policy });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * PUT /api/policy/ens
 * Set ENS text records (agent-registration + vcr.policy) separately.
 */
router.put("/ens", async (req, res) => {
  try {
    const { ensName, agentId, policyUri } = req.body as {
      ensName: string;
      agentId: number;
      policyUri: string;
    };

    if (!ensName || agentId === undefined || !policyUri) {
      return res.status(400).json({ error: "ensName, agentId, and policyUri are required" });
    }

    const result = await setAllENSRecords(ensName, agentId, policyUri);
    return res.json({ txHash: result.txHash, ensName, agentId, policyUri });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
