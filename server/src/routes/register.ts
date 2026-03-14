// ─── Register Routes — ERC-8004 Agent Registration ────────────────────────────
import { Router } from "express";
import {
  createAgent as createSdkAgent,
  registerAgent,
  waitForAgentRegistration,
  getAgentOwner,
  getAgentReputation,
  buildAgentMetadataJson,
  pinPolicy,
  setAllENSRecords,
  ERC8004_ADDRESSES,
} from "@vcr-protocol/sdk";
import type {
  AgentMetadata,
  CreateAgentConfig,
  VCRPolicy,
} from "@vcr-protocol/sdk";
import { PinataSDK } from "pinata";
import { saveAgent, getAgentByChainId, getAgentsByOwner } from "../models/Agent.js";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const router = Router();

const SIMPLE_CREATE_REQUIRED_ENV = [
  "BITGO_ACCESS_TOKEN",
  "BITGO_ENTERPRISE_ID",
  "PINATA_JWT",
  "PINATA_GATEWAY",
  "PIMLICO_API_KEY",
  "PRIVATE_KEY",
  "SEPOLIA_RPC_URL",
] as const;

function getMissingSimpleCreateEnv(): string[] {
  return SIMPLE_CREATE_REQUIRED_ENV.filter((key) => !process.env[key]);
}

function isSimpleCreateAgentPayload(body: unknown): body is CreateAgentConfig {
  if (!body || typeof body !== "object") {
    return false;
  }

  return (
    "baseDomain" in body &&
    "maxPerTxUsdc" in body &&
    "dailyLimitUsdc" in body &&
    "allowedRecipients" in body
  );
}

function normalizeSimpleCreateConfig(body: CreateAgentConfig): CreateAgentConfig {
  const allowedRecipients = Array.isArray(body.allowedRecipients)
    ? body.allowedRecipients
        .map((recipient) => getAddress(String(recipient).trim()))
    : [];

  const allowedTokens = Array.isArray(body.allowedTokens)
    ? body.allowedTokens.map((token) => String(token).trim()).filter(Boolean)
    : undefined;

  const allowedChains = Array.isArray(body.allowedChains)
    ? body.allowedChains.map((chain) => String(chain).trim()).filter(Boolean)
    : undefined;

  const config: CreateAgentConfig = {
    name: String(body.name ?? "").trim().toLowerCase(),
    baseDomain: String(body.baseDomain ?? "").trim().toLowerCase(),
    maxPerTxUsdc: String(body.maxPerTxUsdc ?? "").trim(),
    dailyLimitUsdc: String(body.dailyLimitUsdc ?? "").trim(),
    allowedRecipients,
    description: body.description?.trim() || undefined,
    allowedTokens: allowedTokens?.length ? allowedTokens : undefined,
    allowedChains: allowedChains?.length ? allowedChains : undefined,
    allowedHours: body.allowedHours,
  };

  if (!config.name) {
    throw new Error("name is required");
  }
  if (!/^[a-z0-9-]+$/.test(config.name)) {
    throw new Error("name must use lowercase letters, numbers, or hyphens only");
  }
  if (!config.baseDomain || !config.baseDomain.includes(".")) {
    throw new Error("baseDomain must be a valid ENS parent domain, such as acmecorp.eth");
  }
  if (!config.maxPerTxUsdc || Number(config.maxPerTxUsdc) <= 0) {
    throw new Error("maxPerTxUsdc must be greater than 0");
  }
  if (!config.dailyLimitUsdc || Number(config.dailyLimitUsdc) <= 0) {
    throw new Error("dailyLimitUsdc must be greater than 0");
  }
  if (!config.allowedRecipients.length) {
    throw new Error("at least one allowed recipient is required");
  }
  if (Number(config.dailyLimitUsdc) < Number(config.maxPerTxUsdc)) {
    throw new Error("dailyLimitUsdc must be greater than or equal to maxPerTxUsdc");
  }
  if (config.allowedHours) {
    const [start, end] = config.allowedHours;
    const validHours =
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      start >= 0 &&
      start <= 23 &&
      end >= 0 &&
      end <= 24 &&
      start < end;

    if (!validHours) {
      throw new Error("allowedHours must be a valid UTC range like [9, 17]");
    }
  }

  return config;
}

router.get("/readiness", (_req, res) => {
  const missing = getMissingSimpleCreateEnv();

  return res.json({
    ready: missing.length === 0,
    missing,
    sdkReferences: [
      "sdk/src/createAgent.ts",
      "sdk/src/types.ts",
      "sdk/src/bitgo.ts",
      "sdk/src/fileverse.ts",
      "sdk/src/ens.ts",
    ],
  });
});

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
    if (isSimpleCreateAgentPayload(req.body)) {
      const missingEnv = getMissingSimpleCreateEnv();
      if (missingEnv.length > 0) {
        return res.status(503).json({
          error: "Server is missing environment needed for SDK agent creation",
          missing: missingEnv,
        });
      }

      const config = normalizeSimpleCreateConfig(req.body);
      const record = await createSdkAgent(config, {
        BITGO_ACCESS_TOKEN: process.env.BITGO_ACCESS_TOKEN!,
        BITGO_ENTERPRISE_ID: process.env.BITGO_ENTERPRISE_ID!,
        PINATA_JWT: process.env.PINATA_JWT!,
        PINATA_GATEWAY: process.env.PINATA_GATEWAY!,
        PIMLICO_API_KEY: process.env.PIMLICO_API_KEY!,
        PRIVATE_KEY: process.env.PRIVATE_KEY!,
        SEPOLIA_RPC_URL: process.env.SEPOLIA_RPC_URL!,
      });

      const ownerAccount = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
      await saveAgent({
        agentId: record.agentId,
        name: config.name,
        description: config.description,
        ownerAddress: ownerAccount.address,
        agentWalletAddress: record.walletAddress,
        ensName: record.ensName,
        agentUri: record.erc8004AgentUri ?? record.policyUri,
        policyUri: record.policyUri,
        policyCid: record.policyCid,
        bitgoWalletId: record.walletId,
        registrationTxHash: record.registrationTx,
        active: true,
        supportedChains: config.allowedChains ?? ["base-sepolia"],
        supportedTokens: config.allowedTokens ?? ["USDC"],
      } as any);

      return res.status(201).json({
        mode: "sdk-create-agent",
        record,
        sdkReferences: [
          "sdk/src/createAgent.ts",
          "sdk/src/types.ts",
          "sdk/src/bitgo.ts",
          "sdk/src/fileverse.ts",
          "sdk/src/ens.ts",
        ],
      });
    }

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

export default router;
