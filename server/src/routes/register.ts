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
  setEnsTextRecords,
  ERC8004_ADDRESSES,
  prepareSelfOwnedEnsTransactions,
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
import {
  getAgentByChainId,
  getAgentsByOwner,
  getAllAgents,
  saveAgent,
  updateAgentProfile,
} from "../models/Agent.js";
import { getAddress, recoverMessageAddress } from "viem";
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
  rulesDocumentUrl?: string;
  rulesDocumentRaw?: string;
}

interface NormalizedSimpleCreateRequest extends CreateAgentConfig {
  creatorAddress: `0x${string}`;
  domainMode: DomainMode;
}

interface RulesDocumentOverrides {
  rulesDocumentUrl?: string;
  rulesDocumentRaw?: string;
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

function extractIpfsCid(value: unknown): string | undefined {
  const normalized = toOptionalString(value);
  if (!normalized) {
    return undefined;
  }

  if (normalized.startsWith("ipfs://")) {
    return normalized.slice("ipfs://".length);
  }

  try {
    const parsed = new URL(normalized);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const ipfsIndex = segments.findIndex((segment) => segment === "ipfs");
    if (ipfsIndex >= 0 && segments[ipfsIndex + 1]) {
      return segments[ipfsIndex + 1];
    }
  } catch {
    // Continue with non-URL fallback.
  }

  if (!normalized.includes("/") && !normalized.includes(":")) {
    return normalized;
  }

  return undefined;
}

function getPinataGatewayBaseUrl(): string {
  const configured = toOptionalString(process.env.PINATA_GATEWAY);
  if (!configured) {
    return "https://gateway.pinata.cloud";
  }

  const withProtocol = /^https?:\/\//i.test(configured)
    ? configured
    : `https://${configured}`;

  return withProtocol.replace(/\/+$/, "");
}

function buildPinataGatewayUrl(value: unknown): string | undefined {
  const cid = extractIpfsCid(value);
  if (!cid) {
    return undefined;
  }

  return `${getPinataGatewayBaseUrl()}/ipfs/${cid}`;
}

function buildSimpleRulesSnapshot(config: CreateAgentConfig): string {
  return JSON.stringify({
    maxPerTxUsdc: config.maxPerTxUsdc,
    dailyLimitUsdc: config.dailyLimitUsdc,
    allowedRecipients: config.allowedRecipients,
    allowedTokens: config.allowedTokens ?? ["USDC"],
    allowedChains: config.allowedChains ?? ["base-sepolia"],
    allowedHours: config.allowedHours,
    description: config.description,
  }, null, 2);
}

function buildProfileUpdateMessage(agentId: number, ensName: string, issuedAt: string): string {
  return [
    "VCR ENS profile update",
    `Agent ID: ${agentId}`,
    `ENS: ${ensName}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

function buildSelfOwnedEnsSetupMessage(agentId: number, ensName: string, issuedAt: string): string {
  return [
    "VCR self-owned ENS setup",
    `Agent ID: ${agentId}`,
    `ENS: ${ensName}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

function guessExtensionFromMimeType(mimeType: string): string {
  const mimeToExtension: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
  };

  return mimeToExtension[mimeType] ?? "bin";
}

function parseImageDataUrl(
  value: string,
  fallbackName: string,
): { mimeType: string; file: File } {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match?.[1] || !match[2]) {
    throw new Error("Image uploads must be provided as base64 data URLs");
  }

  const mimeType = match[1];
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0) {
    throw new Error("Uploaded image was empty");
  }
  if (bytes.length > 5 * 1024 * 1024) {
    throw new Error("Each ENS profile image must be 5 MB or smaller");
  }

  const extension = guessExtensionFromMimeType(mimeType);
  const file = new File([bytes], `${fallbackName}.${extension}`, { type: mimeType });
  return { mimeType, file };
}

async function uploadProfileAsset(dataUrl: string, fallbackName: string) {
  const pinata = new PinataSDK({
    pinataJwt: process.env.PINATA_JWT!,
    pinataGateway: process.env.PINATA_GATEWAY!,
  });
  const { file } = parseImageDataUrl(dataUrl, fallbackName);
  const result = await pinata.upload.public.file(file);
  const gatewayUrl = buildPinataGatewayUrl(result.cid);
  if (!gatewayUrl) {
    throw new Error("Failed to build a Pinata gateway URL for the uploaded image");
  }

  return {
    cid: result.cid,
    ipfsUri: `ipfs://${result.cid}`,
    gatewayUrl,
  };
}

function isAuthorizedAgentActor(agent: {
  ownerAddress?: string;
  creatorAddress?: string;
}, actorAddress: string): boolean {
  const normalized = actorAddress.toLowerCase();
  return (
    agent.ownerAddress?.toLowerCase() === normalized ||
    agent.creatorAddress?.toLowerCase() === normalized
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
      ensTx: record.ensTx ? `https://sepolia.etherscan.io/tx/${record.ensTx}` : undefined,
      ipfs: record.policyGatewayUrl ?? record.policyUri,
      policyUri: record.policyUri,
    },
    permissions: {
      maxPerTxUsdc: config.maxPerTxUsdc,
      dailyLimitUsdc: config.dailyLimitUsdc,
      allowedRecipients: config.allowedRecipients,
      allowedTokens: config.allowedTokens ?? ["USDC"],
      allowedChains: config.allowedChains ?? ["base-sepolia"],
      allowedHours: config.allowedHours,
      description: config.description,
    },
  };
}

async function persistCreatedAgent(
  config: NormalizedSimpleCreateRequest,
  record: any,
  overrides?: RulesDocumentOverrides,
): Promise<void> {
  const ownerAccount = getSigningAccount();
  const pinataGatewayUrl =
    buildPinataGatewayUrl(record.policyUri) ??
    buildPinataGatewayUrl(record.policyGatewayUrl);
  const rulesDocument = resolveRulesDocumentFields({
    explicitUrl: overrides?.rulesDocumentUrl,
    explicitRaw: overrides?.rulesDocumentRaw,
    fallbackUrl: pinataGatewayUrl ?? record.policyGatewayUrl ?? record.policyUri,
    fallbackRaw: buildSimpleRulesSnapshot(config),
  });

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
}

async function runAgentCreationJob(
  jobId: string,
  config: NormalizedSimpleCreateRequest,
  rulesDocumentOverrides?: RulesDocumentOverrides,
): Promise<void> {
  startAgentCreationJob(jobId);
  appendAgentCreationJobLog(jobId, '[createAgent] Job accepted by API');
  appendAgentCreationJobLog(jobId, `  Creator wallet: ${config.creatorAddress}`);
  appendAgentCreationJobLog(jobId, `  Domain mode: ${config.domainMode}`);

  try {
    const createSdkAgentWithOptionalLogger = createSdkAgent as unknown as (
      config: CreateAgentConfig,
      env: ReturnType<typeof getRegistrationRuntimeEnv>,
      options?: {
        logger?: (message: string) => void;
        skipEnsBinding?: boolean;
      },
    ) => Promise<any>;

    const record = await createSdkAgentWithOptionalLogger(
      config,
      getRegistrationRuntimeEnv(),
      {
        logger: (message) => appendAgentCreationJobLog(jobId, message),
        skipEnsBinding: config.domainMode === "self-owned",
      },
    );

    await persistCreatedAgent(config, record, rulesDocumentOverrides);
    appendAgentCreationJobLog(jobId, "  Agent record saved in the server database");

    completeAgentCreationJob(jobId, buildSuccessPayload(config, record));
  } catch (error) {
    const message = (error as Error).message;
    appendAgentCreationJobLog(jobId, `  Agent creation failed: ${message}`);
    failAgentCreationJob(jobId, message);
  }
}
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
        description: "Connect your wallet, let the backend create the agent, then finish ENS writes from the same wallet in the browser.",
      },
    ],
    ensAppUrl: "https://app.ens.domains",
    supportsSelfOwnedDomainAutomation: true,
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

    const requestBody = req.body as SimpleCreateAgentRequest;
    const config = normalizeSimpleCreateConfig(requestBody);

    const rulesDocumentOverrides: RulesDocumentOverrides = {
      rulesDocumentUrl: toOptionalString(requestBody.rulesDocumentUrl),
      rulesDocumentRaw: toOptionalString(requestBody.rulesDocumentRaw),
    };

    const job = createAgentCreationJob();
    void runAgentCreationJob(job.id, config, rulesDocumentOverrides);

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

router.get("/", async (_req, res) => {
  try {
    const agents = await getAllAgents();
    return res.json({ agents });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/list", async (_req, res) => {
  try {
    const agents = await getAllAgents();
    return res.json({ agents });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
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

      const requestBody = req.body as SimpleCreateAgentRequest;
      const config = normalizeSimpleCreateConfig(requestBody);
      const createSdkAgentWithOptionalLogger = createSdkAgent as unknown as (
        config: CreateAgentConfig,
        env: ReturnType<typeof getRegistrationRuntimeEnv>,
        options?: {
          logger?: (message: string) => void;
          skipEnsBinding?: boolean;
        },
      ) => Promise<any>;
      const record = await createSdkAgentWithOptionalLogger(config, getRegistrationRuntimeEnv(), {
        skipEnsBinding: config.domainMode === "self-owned",
      });
      await persistCreatedAgent(config, record, {
        rulesDocumentUrl: toOptionalString(requestBody.rulesDocumentUrl),
        rulesDocumentRaw: toOptionalString(requestBody.rulesDocumentRaw),
      });

      return res.status(201).json({
        mode: "sdk-create-agent",
        ...buildSuccessPayload(config, record),
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

    if (policy && !response.policyUri) {
      const policyPin = await pinPolicy(policy);
      response.policyCid = policyPin.cid;
      response.policyUri = policyPin.ipfsUri;
    }

    const pinataRulesUrl =
      buildPinataGatewayUrl(response.policyUri as string | undefined) ??
      (response.policyUri as string | undefined);

    const rulesDocument = resolveRulesDocumentFields({
      explicitUrl: rulesDocumentUrl,
      explicitRaw: rulesDocumentRaw,
      fallbackUrl: pinataRulesUrl,
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

router.post("/:agentId/self-owned/prepare", async (req, res) => {
  try {
    const agentId = parseInt(req.params.agentId, 10);
    if (Number.isNaN(agentId)) {
      return res.status(400).json({ error: "Invalid agentId" });
    }

    const agent = await getAgentByChainId(agentId);
    if (!agent || !agent.ensName || !agent.policyUri) {
      return res.status(404).json({ error: "Agent not found or missing ENS/policy metadata" });
    }
    if (agent.registrationMode !== "self-owned") {
      return res.status(400).json({ error: "This agent does not use self-owned ENS mode" });
    }

    const {
      actorAddress,
      signature,
      issuedAt,
      avatarDataUrl,
      headerDataUrl,
    } = req.body as {
      actorAddress?: string;
      signature?: `0x${string}`;
      issuedAt?: string;
      avatarDataUrl?: string;
      headerDataUrl?: string;
    };

    if (!actorAddress || !signature || !issuedAt) {
      return res.status(400).json({ error: "actorAddress, signature, and issuedAt are required" });
    }

    const normalizedActor = getAddress(actorAddress);
    const issuedAtDate = new Date(issuedAt);
    if (Number.isNaN(issuedAtDate.getTime())) {
      return res.status(400).json({ error: "issuedAt must be a valid ISO timestamp" });
    }
    if (Math.abs(Date.now() - issuedAtDate.getTime()) > 10 * 60 * 1000) {
      return res.status(400).json({ error: "Self-owned ENS setup signature has expired. Please try again." });
    }

    const recoveredAddress = await recoverMessageAddress({
      message: buildSelfOwnedEnsSetupMessage(agentId, agent.ensName, issuedAt),
      signature,
    });

    if (recoveredAddress.toLowerCase() !== normalizedActor.toLowerCase()) {
      return res.status(403).json({ error: "Signature did not match the connected wallet" });
    }

    if (!isAuthorizedAgentActor(agent, normalizedActor)) {
      return res.status(403).json({ error: "Connected wallet is not allowed to configure this agent" });
    }

    const uploaded: Record<string, string> = {};
    const uploadedIpfs: Record<string, string> = {};

    if (avatarDataUrl) {
      const avatar = await uploadProfileAsset(avatarDataUrl, `${agent.ensName}-avatar`);
      uploaded.avatar = avatar.gatewayUrl;
      uploadedIpfs.avatar = avatar.ipfsUri;
    }

    if (headerDataUrl) {
      const header = await uploadProfileAsset(headerDataUrl, `${agent.ensName}-header`);
      uploaded.header = header.gatewayUrl;
      uploadedIpfs.header = header.ipfsUri;
    }

    const prepared = await prepareSelfOwnedEnsTransactions({
      ensName: agent.ensName,
      ownerAddress: normalizedActor,
      agentId,
      policyUriOrCid: agent.policyUri,
      textRecords: uploaded,
    });

    return res.json({
      success: true,
      agentId,
      ensName: agent.ensName,
      actorAddress: normalizedActor,
      policyUri: agent.policyUri,
      profile: {
        avatar: uploaded.avatar,
        header: uploaded.header,
        avatarIpfsUri: uploadedIpfs.avatar,
        headerIpfsUri: uploadedIpfs.header,
      },
      ensSetup: prepared,
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/:agentId/self-owned/complete", async (req, res) => {
  try {
    const agentId = parseInt(req.params.agentId, 10);
    if (Number.isNaN(agentId)) {
      return res.status(400).json({ error: "Invalid agentId" });
    }

    const agent = await getAgentByChainId(agentId);
    if (!agent || !agent.ensName) {
      return res.status(404).json({ error: "Agent not found or ENS name missing" });
    }

    const {
      actorAddress,
      signature,
      issuedAt,
      ensTxHash,
      avatarUri,
      headerUri,
    } = req.body as {
      actorAddress?: string;
      signature?: `0x${string}`;
      issuedAt?: string;
      ensTxHash?: string;
      avatarUri?: string;
      headerUri?: string;
    };

    if (!actorAddress || !signature || !issuedAt || !ensTxHash) {
      return res.status(400).json({ error: "actorAddress, signature, issuedAt, and ensTxHash are required" });
    }

    const normalizedActor = getAddress(actorAddress);
    const issuedAtDate = new Date(issuedAt);
    if (Number.isNaN(issuedAtDate.getTime())) {
      return res.status(400).json({ error: "issuedAt must be a valid ISO timestamp" });
    }
    if (Math.abs(Date.now() - issuedAtDate.getTime()) > 30 * 60 * 1000) {
      return res.status(400).json({ error: "Self-owned ENS completion signature has expired. Please retry the setup." });
    }

    const recoveredAddress = await recoverMessageAddress({
      message: buildSelfOwnedEnsSetupMessage(agentId, agent.ensName, issuedAt),
      signature,
    });

    if (recoveredAddress.toLowerCase() !== normalizedActor.toLowerCase()) {
      return res.status(403).json({ error: "Signature did not match the connected wallet" });
    }

    if (!isAuthorizedAgentActor(agent, normalizedActor)) {
      return res.status(403).json({ error: "Connected wallet is not allowed to configure this agent" });
    }

    const updated = await updateAgentProfile(agentId, {
      avatarUri,
      headerUri,
    });

    return res.json({
      success: true,
      agentId,
      ensName: agent.ensName,
      ensTxHash,
      ensTxUrl: `https://sepolia.etherscan.io/tx/${ensTxHash}`,
      profile: {
        avatar: avatarUri,
        header: headerUri,
      },
      agent: updated ?? agent,
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

router.put("/:agentId/profile", async (req, res) => {
  try {
    const agentId = parseInt(req.params.agentId, 10);
    if (Number.isNaN(agentId)) {
      return res.status(400).json({ error: "Invalid agentId" });
    }

    const agent = await getAgentByChainId(agentId);
    if (!agent || !agent.ensName) {
      return res.status(404).json({ error: "Agent not found or ENS name missing" });
    }

    const {
      avatarDataUrl,
      headerDataUrl,
      actorAddress,
      signature,
      issuedAt,
    } = req.body as {
      avatarDataUrl?: string;
      headerDataUrl?: string;
      actorAddress?: string;
      signature?: `0x${string}`;
      issuedAt?: string;
    };

    if (!avatarDataUrl && !headerDataUrl) {
      return res.status(400).json({ error: "Provide avatarDataUrl and/or headerDataUrl" });
    }
    if (!actorAddress || !signature || !issuedAt) {
      return res.status(400).json({ error: "actorAddress, signature, and issuedAt are required" });
    }

    const normalizedActor = getAddress(actorAddress);
    const issuedAtDate = new Date(issuedAt);
    if (Number.isNaN(issuedAtDate.getTime())) {
      return res.status(400).json({ error: "issuedAt must be a valid ISO timestamp" });
    }
    if (Math.abs(Date.now() - issuedAtDate.getTime()) > 10 * 60 * 1000) {
      return res.status(400).json({ error: "Profile update signature has expired. Please try again." });
    }

    const recoveredAddress = await recoverMessageAddress({
      message: buildProfileUpdateMessage(agentId, agent.ensName, issuedAt),
      signature,
    });

    if (recoveredAddress.toLowerCase() !== normalizedActor.toLowerCase()) {
      return res.status(403).json({ error: "Signature did not match the connected wallet" });
    }

    if (!isAuthorizedAgentActor(agent, normalizedActor)) {
      return res.status(403).json({ error: "Connected wallet is not allowed to update this agent profile" });
    }

    const uploaded: Record<string, string> = {};
    const profileAssets: Record<string, string> = {};
    const uploadedIpfs: Record<string, string> = {};

    if (avatarDataUrl) {
      const avatar = await uploadProfileAsset(avatarDataUrl, `${agent.ensName}-avatar`);
      uploaded.avatar = avatar.gatewayUrl;
      profileAssets.avatarUri = avatar.gatewayUrl;
      uploadedIpfs.avatar = avatar.ipfsUri;
    }

    if (headerDataUrl) {
      const header = await uploadProfileAsset(headerDataUrl, `${agent.ensName}-header`);
      uploaded.header = header.gatewayUrl;
      profileAssets.headerUri = header.gatewayUrl;
      uploadedIpfs.header = header.ipfsUri;
    }

    const ensResult = await setEnsTextRecords(agent.ensName, uploaded);
    const updated = await updateAgentProfile(agentId, profileAssets);

    return res.json({
      success: true,
      agentId,
      ensName: agent.ensName,
      txHash: ensResult.txHash,
      profile: {
        avatar: uploaded.avatar,
        header: uploaded.header,
        avatarUri: profileAssets.avatarUri,
        headerUri: profileAssets.headerUri,
        avatarIpfsUri: uploadedIpfs.avatar,
        headerIpfsUri: uploadedIpfs.header,
      },
      agent: updated ?? agent,
    });
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
