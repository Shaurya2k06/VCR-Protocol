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
import {
  appendAgentCreationJobLog,
  completeAgentCreationJob,
  createAgentCreationJob,
  failAgentCreationJob,
  getAgentCreationJob,
  startAgentCreationJob,
} from "../lib/agentCreationJobs.js";
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

const MANAGED_DOMAINS = ["vcrtcorp.eth"] as const;

type DomainMode = "managed" | "self-owned";

interface SimpleCreateAgentRequest extends CreateAgentConfig {
  creatorAddress?: string;
  domainMode?: DomainMode;
}

interface NormalizedSimpleCreateRequest extends CreateAgentConfig {
  creatorAddress: `0x${string}`;
  domainMode: DomainMode;
}

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

function isManagedDomain(baseDomain: string): boolean {
  return MANAGED_DOMAINS.includes(baseDomain as (typeof MANAGED_DOMAINS)[number]);
}

function getSelfOwnedUnsupportedMessage(baseDomain: string): string {
  return [
    `Self-owned ENS domains are not fully automated in this release.`,
    `Use your connected wallet to register or manage ${baseDomain} in ENS App,`,
    `then either switch to ${MANAGED_DOMAINS[0]} for one-click creation or wait for delegated signing support.`,
  ].join(" ");
}

function normalizeSimpleCreateConfig(body: SimpleCreateAgentRequest): NormalizedSimpleCreateRequest {
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

  const creatorAddressRaw = String(body.creatorAddress ?? "").trim();
  if (!creatorAddressRaw) {
    throw new Error("creatorAddress is required. Connect a wallet before creating an agent.");
  }

  const creatorAddress = getAddress(creatorAddressRaw);
  const baseDomain = String(body.baseDomain ?? "").trim().toLowerCase();
  const inferredDomainMode: DomainMode = isManagedDomain(baseDomain) ? "managed" : "self-owned";
  const requestedDomainMode = body.domainMode;

  if (requestedDomainMode && requestedDomainMode !== inferredDomainMode) {
    throw new Error(
      requestedDomainMode === "managed"
        ? `Managed mode is only available for ${MANAGED_DOMAINS.join(", ")}`
        : "Custom domains must use self-owned mode",
    );
  }

  const config: NormalizedSimpleCreateRequest = {
    name: String(body.name ?? "").trim().toLowerCase(),
    baseDomain,
    maxPerTxUsdc: String(body.maxPerTxUsdc ?? "").trim(),
    dailyLimitUsdc: String(body.dailyLimitUsdc ?? "").trim(),
    allowedRecipients,
    description: body.description?.trim() || undefined,
    allowedTokens: allowedTokens?.length ? allowedTokens : undefined,
    allowedChains: allowedChains?.length ? allowedChains : undefined,
    allowedHours: body.allowedHours,
    creatorAddress,
    domainMode: requestedDomainMode ?? inferredDomainMode,
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

<<<<<<< HEAD
type RulesDocumentSource = "fileverse" | "ipfs" | "inline";

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getRulesDocumentSource(url?: string, raw?: string): RulesDocumentSource | undefined {
  if (url) {
    if (url.includes("docs.fileverse.io") || url.includes("agents.fileverse.io")) {
      return "fileverse";
    }
    return "ipfs";
  }

  if (raw) {
    return "inline";
  }

  return undefined;
}

function buildSimpleRulesSnapshot(config: CreateAgentConfig): string {
  return JSON.stringify(
    {
=======
function getRegistrationRuntimeEnv() {
  return {
    BITGO_ACCESS_TOKEN: process.env.BITGO_ACCESS_TOKEN!,
    BITGO_ENTERPRISE_ID: process.env.BITGO_ENTERPRISE_ID!,
    PINATA_JWT: process.env.PINATA_JWT!,
    PINATA_GATEWAY: process.env.PINATA_GATEWAY!,
    PIMLICO_API_KEY: process.env.PIMLICO_API_KEY!,
    PRIVATE_KEY: process.env.PRIVATE_KEY!,
    SEPOLIA_RPC_URL: process.env.SEPOLIA_RPC_URL!,
  };
}

function getSigningAccount() {
  return privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
}

function buildSuccessPayload(config: NormalizedSimpleCreateRequest, record: any) {
  const signingAccount = getSigningAccount();

  return {
    record: {
      ...record,
      creatorAddress: config.creatorAddress,
      ownerAddress: signingAccount.address,
      signingAddress: signingAccount.address,
      registrationMode: config.domainMode,
    },
    ownership: {
      creatorAddress: config.creatorAddress,
      signingAddress: signingAccount.address,
      domainMode: config.domainMode,
      feeResponsibility:
        config.domainMode === "managed"
          ? "Managed domain: the backend signer pays the Sepolia ENS subdomain write gas."
          : "Self-owned domain: your connected wallet pays ENS registration and write gas.",
    },
    links: {
      ensApp: `https://app.ens.domains/name/${record.ensName}`,
      registrationTx: `https://sepolia.etherscan.io/tx/${record.registrationTx}`,
      ensTx: `https://sepolia.etherscan.io/tx/${record.ensTx}`,
      ipfs: record.policyGatewayUrl ?? record.policyUri,
      policyUri: record.policyUri,
    },
    permissions: {
>>>>>>> 17b622a1415783978ca7541e4f3989b15b751134
      maxPerTxUsdc: config.maxPerTxUsdc,
      dailyLimitUsdc: config.dailyLimitUsdc,
      allowedRecipients: config.allowedRecipients,
      allowedTokens: config.allowedTokens ?? ["USDC"],
      allowedChains: config.allowedChains ?? ["base-sepolia"],
      allowedHours: config.allowedHours,
<<<<<<< HEAD
      description: config.description,
    },
    null,
    2
  );
}

function stringifyPolicy(policy: VCRPolicy | undefined): string | undefined {
  if (!policy) {
    return undefined;
  }

  return JSON.stringify(policy, null, 2);
}

function resolveRulesDocumentFields(params: {
  explicitUrl?: string;
  explicitRaw?: string;
  fallbackUrl?: string;
  fallbackRaw?: string;
}): {
  rulesDocumentUrl?: string;
  rulesDocumentRaw?: string;
  rulesDocumentSource?: RulesDocumentSource;
} {
  const rulesDocumentUrl =
    toOptionalString(params.explicitUrl) ?? toOptionalString(params.fallbackUrl);
  const rulesDocumentRaw =
    toOptionalString(params.explicitRaw) ?? toOptionalString(params.fallbackRaw);

  return {
    rulesDocumentUrl,
    rulesDocumentRaw,
    rulesDocumentSource: getRulesDocumentSource(rulesDocumentUrl, rulesDocumentRaw),
  };
}

=======
    },
  };
}

async function persistCreatedAgent(
  config: NormalizedSimpleCreateRequest,
  record: any,
): Promise<void> {
  const ownerAccount = getSigningAccount();
  await saveAgent({
    agentId: record.agentId,
    name: config.name,
    description: config.description,
    ownerAddress: ownerAccount.address,
    creatorAddress: config.creatorAddress,
    registrationMode: config.domainMode,
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
}

async function runAgentCreationJob(
  jobId: string,
  config: NormalizedSimpleCreateRequest,
): Promise<void> {
  startAgentCreationJob(jobId);
  appendAgentCreationJobLog(jobId, '[createAgent] Job accepted by API');
  appendAgentCreationJobLog(jobId, `  Creator wallet: ${config.creatorAddress}`);
  appendAgentCreationJobLog(jobId, `  Domain mode: ${config.domainMode}`);

  try {
    const record = await createSdkAgent(
      config,
      getRegistrationRuntimeEnv(),
      {
        logger: (message) => appendAgentCreationJobLog(jobId, message),
      },
    );

    await persistCreatedAgent(config, record);
    appendAgentCreationJobLog(jobId, "  Agent record saved in the server database");

    completeAgentCreationJob(jobId, buildSuccessPayload(config, record));
  } catch (error) {
    const message = (error as Error).message;
    appendAgentCreationJobLog(jobId, `  Agent creation failed: ${message}`);
    failAgentCreationJob(jobId, message);
  }
}

>>>>>>> 17b622a1415783978ca7541e4f3989b15b751134
router.get("/readiness", (_req, res) => {
  const missing = getMissingSimpleCreateEnv();
  const signingAddress = process.env.PRIVATE_KEY
    ? getSigningAccount().address
    : undefined;

  return res.json({
    ready: missing.length === 0,
    missing,
    suggestedDomains: [...MANAGED_DOMAINS],
    managedDomains: [...MANAGED_DOMAINS],
    tokenOptions: ["USDC", "USDT"],
    chainOptions: ["base-sepolia", "base"],
    domainModes: [
      {
        id: "managed",
        label: "Managed by VCR",
        description: "One-click launch under vcrtcorp.eth. Backend signer writes ENS records on Sepolia.",
      },
      {
        id: "self-owned",
        label: "Self-owned ENS",
        description: "Connect your wallet and pay ENS gas yourself. Registration handoff only in this release.",
      },
    ],
    ensAppUrl: "https://app.ens.domains",
    supportsSelfOwnedDomainAutomation: false,
    signingAddress,
    sdkReferences: [
      "sdk/src/createAgent.ts",
      "sdk/src/types.ts",
      "sdk/src/bitgo.ts",
      "sdk/src/fileverse.ts",
      "sdk/src/ens.ts",
    ],
  });
});

router.post("/jobs", async (req, res) => {
  try {
    const missingEnv = getMissingSimpleCreateEnv();
    if (missingEnv.length > 0) {
      return res.status(503).json({
        error: "Server is missing environment needed for SDK agent creation",
        missing: missingEnv,
      });
    }

    const config = normalizeSimpleCreateConfig(req.body as SimpleCreateAgentRequest);
    if (config.domainMode === "self-owned") {
      return res.status(409).json({
        error: getSelfOwnedUnsupportedMessage(config.baseDomain),
        domainMode: config.domainMode,
        ensAppUrl: "https://app.ens.domains",
      });
    }
    const job = createAgentCreationJob();
    void runAgentCreationJob(job.id, config);

    return res.status(202).json({
      jobId: job.id,
      status: job.status,
    });
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

router.get("/jobs/:jobId", (req, res) => {
  const job = getAgentCreationJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  return res.json(job);
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
      const body = req.body as CreateAgentConfig & {
        rulesDocumentUrl?: string;
        rulesDocumentRaw?: string;
      };
      const missingEnv = getMissingSimpleCreateEnv();
      if (missingEnv.length > 0) {
        return res.status(503).json({
          error: "Server is missing environment needed for SDK agent creation",
          missing: missingEnv,
        });
      }

<<<<<<< HEAD
      const config = normalizeSimpleCreateConfig(body);
      const record = await createSdkAgent(config, {
        BITGO_ACCESS_TOKEN: process.env.BITGO_ACCESS_TOKEN!,
        BITGO_ENTERPRISE_ID: process.env.BITGO_ENTERPRISE_ID!,
        PINATA_JWT: process.env.PINATA_JWT!,
        PINATA_GATEWAY: process.env.PINATA_GATEWAY!,
        PIMLICO_API_KEY: process.env.PIMLICO_API_KEY!,
        PRIVATE_KEY: process.env.PRIVATE_KEY!,
        SEPOLIA_RPC_URL: process.env.SEPOLIA_RPC_URL!,
      });

      const recordWithOptionalDocFields = record as typeof record & {
        policyGatewayUrl?: string;
      };

      const rulesDocument = resolveRulesDocumentFields({
        explicitUrl: body.rulesDocumentUrl,
        explicitRaw: body.rulesDocumentRaw,
        fallbackUrl: recordWithOptionalDocFields.policyGatewayUrl ?? record.policyUri,
        fallbackRaw: buildSimpleRulesSnapshot(config),
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
        rulesDocumentUrl: rulesDocument.rulesDocumentUrl,
        rulesDocumentRaw: rulesDocument.rulesDocumentRaw,
        rulesDocumentSource: rulesDocument.rulesDocumentSource,
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
        rulesDocument,
        sdkReferences: [
          "sdk/src/createAgent.ts",
          "sdk/src/types.ts",
          "sdk/src/bitgo.ts",
          "sdk/src/fileverse.ts",
          "sdk/src/ens.ts",
        ],
=======
      const config = normalizeSimpleCreateConfig(req.body as SimpleCreateAgentRequest);
      if (config.domainMode === "self-owned") {
        return res.status(409).json({
          error: getSelfOwnedUnsupportedMessage(config.baseDomain),
          domainMode: config.domainMode,
          ensAppUrl: "https://app.ens.domains",
        });
      }
      const record = await createSdkAgent(config, getRegistrationRuntimeEnv());
      await persistCreatedAgent(config, record);

      return res.status(201).json({
        mode: "sdk-create-agent",
        ...buildSuccessPayload(config, record),
>>>>>>> 17b622a1415783978ca7541e4f3989b15b751134
      });
    }

    const {
      name,
      description,
      services,
      policy,
      ensName,
      rulesDocumentUrl,
      rulesDocumentRaw,
    } = req.body as {
      name: string;
      description?: string;
      services?: AgentMetadata["services"];
      policy?: VCRPolicy;
      ensName?: string;
      rulesDocumentUrl?: string;
      rulesDocumentRaw?: string;
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

    const rulesDocument = resolveRulesDocumentFields({
      explicitUrl: rulesDocumentUrl,
      explicitRaw: rulesDocumentRaw,
      fallbackUrl: response.policyUri as string | undefined,
      fallbackRaw: stringifyPolicy(policy),
    });
    response.rulesDocument = rulesDocument;

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
      rulesDocumentUrl: rulesDocument.rulesDocumentUrl,
      rulesDocumentRaw: rulesDocument.rulesDocumentRaw,
      rulesDocumentSource: rulesDocument.rulesDocumentSource,
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
