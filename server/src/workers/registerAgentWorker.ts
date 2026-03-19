import "dotenv/config";
import mongoose from "mongoose";
import { Worker, type Job } from "bullmq";
import { createAgent as createSdkAgent } from "@vcr-protocol/sdk";
import type { CreateAgentConfig } from "@vcr-protocol/sdk";
import { privateKeyToAccount } from "viem/accounts";
import { saveAgent } from "../models/Agent.js";
import { createRedisConnection, getRedisUrl } from "../queue/connection.js";
import {
  REGISTER_AGENT_JOB_ATTEMPTS,
  REGISTER_AGENT_JOB_NAME,
  REGISTER_AGENT_JOB_TIMEOUT_MS,
  REGISTER_AGENT_QUEUE_NAME,
} from "../queue/constants.js";
import type {
  RegisterAgentConfig,
  RegisterAgentJobData,
  RegisterAgentJobProgress,
  RegisterAgentJobResult,
  RegisterAgentRulesDocumentOverrides,
} from "../queue/types.js";

const REQUIRED_ENV = [
  "BITGO_ACCESS_TOKEN",
  "BITGO_ENTERPRISE_ID",
  "PINATA_JWT",
  "PINATA_GATEWAY",
  "PIMLICO_API_KEY",
  "PRIVATE_KEY",
  "SEPOLIA_RPC_URL",
] as const;

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

function buildSimpleRulesSnapshot(config: RegisterAgentConfig): string {
  return JSON.stringify(
    {
      maxPerTxUsdc: config.maxPerTxUsdc,
      dailyLimitUsdc: config.dailyLimitUsdc,
      allowedRecipients: config.allowedRecipients,
      allowedTokens: config.allowedTokens ?? ["USDC"],
      allowedChains: config.allowedChains ?? ["base-sepolia"],
      allowedHours: config.allowedHours,
      description: config.description,
    },
    null,
    2,
  );
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

function getRegistrationRuntimeEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing environment for register worker: ${missing.join(", ")}`);
  }

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

function createInitialProgress(config: RegisterAgentConfig): RegisterAgentJobProgress {
  return {
    stage: "RUNNING",
    ensName: `${config.name}.${config.baseDomain}`,
    logs: [],
    updatedAt: new Date().toISOString(),
  };
}

function parseProgressFromLog(message: string): Partial<RegisterAgentJobProgress> {
  const trimmed = message.trim();

  const partial: Partial<RegisterAgentJobProgress> = {};

  const agentIdMatch = trimmed.match(/^Agent ID:\s*(\d+)$/i);
  if (agentIdMatch?.[1]) {
    partial.agentId = Number(agentIdMatch[1]);
  }

  const registerTxMatch = trimmed.match(/^register\(\) tx submitted:\s*(0x[a-fA-F0-9]+)$/i);
  if (registerTxMatch?.[1]) {
    partial.registrationTxHash = registerTxMatch[1];
  }

  const ensTxMatch = trimmed.match(/^ENS records set tx:\s*(0x[a-fA-F0-9]+)$/i);
  if (ensTxMatch?.[1]) {
    partial.stage = "ENS_REGISTERED";
    partial.ensTxHash = ensTxMatch[1];
  }

  if (trimmed.includes("Deferring ENS binding to the connected wallet")) {
    partial.stage = "ENS_DEFERRED_SELF_OWNED";
  }

  return partial;
}

async function persistCreatedAgent(
  config: RegisterAgentConfig,
  record: Record<string, unknown>,
  overrides?: RegisterAgentRulesDocumentOverrides,
): Promise<void> {
  const signingAccount = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

  const policyGateway =
    toOptionalString(record.policyGatewayUrl) ??
    toOptionalString(record.policyUri);

  const rulesDocument = resolveRulesDocumentFields({
    explicitUrl: overrides?.rulesDocumentUrl,
    explicitRaw: overrides?.rulesDocumentRaw,
    fallbackUrl: policyGateway,
    fallbackRaw: buildSimpleRulesSnapshot(config),
  });

  await saveAgent({
    agentId: Number(record.agentId),
    name: config.name,
    description: config.description,
    ownerAddress: signingAccount.address,
    creatorAddress: config.creatorAddress,
    registrationMode: config.domainMode,
    agentWalletAddress: toOptionalString(record.walletAddress),
    ensName: toOptionalString(record.ensName),
    agentUri:
      toOptionalString(record.erc8004AgentUri) ??
      toOptionalString(record.policyUri) ??
      "",
    policyUri: toOptionalString(record.policyUri),
    rulesDocumentUrl: rulesDocument.rulesDocumentUrl,
    rulesDocumentRaw: rulesDocument.rulesDocumentRaw,
    rulesDocumentSource: rulesDocument.rulesDocumentSource,
    policyCid: toOptionalString(record.policyCid),
    bitgoWalletId: toOptionalString(record.walletId),
    registrationTxHash: toOptionalString(record.registrationTx) ?? "",
    active: true,
    supportedChains: config.allowedChains ?? ["base-sepolia"],
    supportedTokens: config.allowedTokens ?? ["USDC"],
  } as any);
}

async function processRegisterAgentJob(
  job: Job<RegisterAgentJobData, RegisterAgentJobResult, typeof REGISTER_AGENT_JOB_NAME>,
): Promise<RegisterAgentJobResult> {
  const { config, rulesDocumentOverrides } = job.data;

  const progress = createInitialProgress(config);
  await job.updateProgress(progress);

  const updateProgress = (partial: Partial<RegisterAgentJobProgress>) => {
    progress.stage = partial.stage ?? progress.stage;
    progress.ensName = partial.ensName ?? progress.ensName;
    progress.agentId = partial.agentId ?? progress.agentId;
    progress.registrationTxHash =
      partial.registrationTxHash ?? progress.registrationTxHash;
    progress.ensTxHash = partial.ensTxHash ?? progress.ensTxHash;
    progress.lastLog = partial.lastLog ?? progress.lastLog;

    const nextLogs = [...(progress.logs ?? [])];
    if (partial.lastLog) {
      nextLogs.push(partial.lastLog);
    }
    progress.logs = nextLogs.slice(-40);

    progress.updatedAt = new Date().toISOString();

    void job.updateProgress({ ...progress }).catch((error) => {
      console.warn(
        `[register-worker] failed to update progress for jobId=${job.id}: ${(error as Error).message}`,
      );
    });
  };

  try {
    console.info(
      `[register-worker] job start jobId=${job.id} ensName=${progress.ensName} attempt=${job.attemptsMade + 1}/${REGISTER_AGENT_JOB_ATTEMPTS}`,
    );

    const createSdkAgentWithOptionalLogger = createSdkAgent as unknown as (
      requestConfig: CreateAgentConfig,
      env: ReturnType<typeof getRegistrationRuntimeEnv>,
      options?: {
        logger?: (message: string) => void;
        skipEnsBinding?: boolean;
      },
    ) => Promise<Record<string, unknown>>;

    const record = await createSdkAgentWithOptionalLogger(
      config,
      getRegistrationRuntimeEnv(),
      {
        logger: (message) => {
          const parsed = parseProgressFromLog(message);
          updateProgress({
            ...parsed,
            lastLog: message,
          });
        },
        skipEnsBinding: config.domainMode === "self-owned",
      },
    );

    await persistCreatedAgent(config, record, rulesDocumentOverrides);

    progress.stage = "COMPLETED";
    progress.ensName = toOptionalString(record.ensName) ?? progress.ensName;
    progress.agentId = Number(record.agentId ?? progress.agentId);
    progress.registrationTxHash =
      toOptionalString(record.registrationTx) ?? progress.registrationTxHash;
    progress.ensTxHash = toOptionalString(record.ensTx) ?? progress.ensTxHash;
    progress.updatedAt = new Date().toISOString();

    await job.updateProgress({ ...progress });

    console.info(
      `[register-worker] job completed jobId=${job.id} ensName=${progress.ensName} agentId=${progress.agentId}`,
    );

    return {
      stage: "COMPLETED",
      ensName: progress.ensName ?? `${config.name}.${config.baseDomain}`,
      agentId: progress.agentId ?? Number(record.agentId),
      registrationTxHash:
        progress.registrationTxHash ?? toOptionalString(record.registrationTx) ?? "",
      ensTxHash: progress.ensTxHash,
    };
  } catch (error) {
    progress.stage = "FAILED";
    progress.lastLog = (error as Error).message;
    progress.updatedAt = new Date().toISOString();
    await job.updateProgress({ ...progress });
    throw error;
  }
}

async function startWorker(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI must be set in environment");
  }

  console.info("[register-worker] connecting to MongoDB");
  await mongoose.connect(mongoUri);
  console.info("[register-worker] MongoDB connected");

  const redisConnection = createRedisConnection();
  console.info(`[register-worker] Redis connected at ${getRedisUrl()}`);

  const worker = new Worker<
    RegisterAgentJobData,
    RegisterAgentJobResult,
    typeof REGISTER_AGENT_JOB_NAME
  >(
    REGISTER_AGENT_QUEUE_NAME,
    async (job) => processRegisterAgentJob(job),
    {
      connection: redisConnection,
      concurrency: 1,
      lockDuration: REGISTER_AGENT_JOB_TIMEOUT_MS,
    },
  );

  worker.on("failed", (job, error) => {
    if (!job) {
      console.error(`[register-worker] job failed before start: ${error.message}`);
      return;
    }

    console.error(
      `[register-worker] job failed jobId=${job.id} attempts=${job.attemptsMade}/${REGISTER_AGENT_JOB_ATTEMPTS} error=\"${error.message}\"`,
    );
  });

  worker.on("error", (error) => {
    console.error(`[register-worker] worker runtime error: ${error.message}`);
  });

  const shutdown = async () => {
    console.info("[register-worker] shutting down");
    await worker.close();
    await mongoose.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });

  process.on("SIGTERM", () => {
    void shutdown();
  });

  console.info("[register-worker] worker started");
}

startWorker().catch((error) => {
  console.error("[register-worker] fatal startup error", error);
  process.exit(1);
});
