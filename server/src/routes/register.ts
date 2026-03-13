// ─── Register Routes — ERC-8004 Agent Registration ────────────────────────────
import { Router } from "express";
import {
  registerAgent,
  waitForAgentRegistration,
  getAgentOwner,
  getAgentReputation,
  buildAgentMetadataJson,
  pinPolicy,
  setAllENSRecords,
  ERC8004_ADDRESSES,
} from "../sdk/index.js";
import type { AgentMetadata, VCRPolicy } from "../sdk/index.js";
import { PinataSDK } from "pinata";
import { saveAgent, getAgentByChainId, getAgentsByOwner } from "../models/Agent.js";
import { privateKeyToAccount } from "viem/accounts";

const router = Router();

/**
 * POST /api/register
 * Full registration flow:
 *   1. Upload agent metadata JSON to IPFS
 *   2. Register on ERC-8004 IdentityRegistry (Sepolia)
 *   3. Optionally set ENS text records (agent-registration + vcr.policy)
 *
 * Returns txHash and agentId (after waiting for confirmation).
 */
router.post("/", async (req, res) => {
  try {
    const {
      name,
      description,
      services,
      policy,
      ensName,
    } = req.body as {
      name: string;
      description?: string;
      services?: AgentMetadata["services"];
      policy?: VCRPolicy;
      ensName?: string;
    };

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    // ── Step 1: Upload agent metadata to IPFS ──────────────────────────────────
    const pinata = new PinataSDK({
      pinataJwt: process.env.PINATA_JWT!,
      pinataGateway: process.env.PINATA_GATEWAY!,
    });

    // Temporary metadata without agentId (we don't know it yet pre-registration)
    const tempMeta: AgentMetadata = {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name,
      description,
      services,
      active: true,
      supportedTrust: ["reputation", "vcr-policy"],
      x402Support: true,
    };

    const metaResult = await pinata.upload.public.json(tempMeta);
    const agentUri = `ipfs://${metaResult.cid}`;

    // ── Step 2: Register on ERC-8004 ──────────────────────────────────────────
    const { txHash } = await registerAgent(agentUri);

    // ── Step 3: Wait for confirmation and extract agentId ─────────────────────
    const regResult = await waitForAgentRegistration(txHash);

    // ── Step 4: Upload final metadata with correct agentId ───────────────────
    const finalMeta = buildAgentMetadataJson(
      { name, description, services, active: true },
      ERC8004_ADDRESSES.identityRegistry.sepolia,
      regResult.agentId,
      11155111
    );
    await pinata.upload.public.json(finalMeta);

    const response: Record<string, unknown> = {
      txHash,
      agentId: regResult.agentId,
      agentUri,
    };

    // ── Step 5: Optionally set ENS records ────────────────────────────────────
    if (ensName) {
      let policyUri = "";

      if (policy) {
        const policyPin = await pinPolicy(policy);
        policyUri = policyPin.ipfsUri;
        response.policyCid = policyPin.cid;
        response.policyUri = policyUri;
      }

      if (policyUri) {
        const ensResult = await setAllENSRecords(ensName, regResult.agentId, policyUri);
        response.ensTxHash = ensResult.txHash;
        response.ensName = ensName;
      }
    }

    // ── Step 6: Persist agent to MongoDB ──────────────────────────────────────
    const ownerAccount = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
    await saveAgent({
      agentId: regResult.agentId,
      name,
      description,
      ownerAddress: ownerAccount.address,
      ensName: ensName,
      agentUri,
      policyUri: response.policyUri as string | undefined,
      policyCid: response.policyCid as string | undefined,
      registrationTxHash: txHash,
      active: true,
      supportedChains: ["base-sepolia"],
      supportedTokens: ["USDC"],
    } as any);

    return res.status(201).json(response);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/register/:agentId
 * Get agent owner and reputation.
 */
router.get("/:agentId", async (req, res) => {
  try {
    const agentId = parseInt(req.params.agentId);
    if (isNaN(agentId)) return res.status(400).json({ error: "Invalid agentId" });

    // Check local DB first
    const localAgent = await getAgentByChainId(agentId);

    const [owner, reputation] = await Promise.all([
      getAgentOwner(agentId),
      getAgentReputation(agentId),
    ]);

    return res.json({
      agentId,
      owner,
      reputation: {
        totalScore: reputation.totalScore.toString(),
        count: reputation.count.toString(),
        averageScore: reputation.averageScore,
      },
      localRecord: localAgent ?? undefined,
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/register/owner/:address
 * Get all agents registered by an owner address.
 */
router.get("/owner/:address", async (req, res) => {
  try {
    const agents = await getAgentsByOwner(req.params.address);
    return res.json({ owner: req.params.address, agents });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
