import "dotenv/config";
import mongoose from "mongoose";
import { Worker, type Job } from "bullmq";
import {
  markAgentActive,
  markAgentFailed,
  markAgentProcessing,
} from "../models/QueuedAgent.js";
import { storePolicyWithFileverse } from "../lib/fileverse.js";
import { uploadTextDocumentToPinata } from "../lib/pinata.js";
import { withTimeout } from "../lib/timeout.js";
import { createRedisConnection, getRedisUrl } from "../queue/connection.js";
import {
  AGENT_QUEUE_NAME,
  FILEVERSE_TIMEOUT_MS,
  STORE_POLICY_JOB_ATTEMPTS,
  STORE_POLICY_JOB_NAME,
  STORE_POLICY_JOB_TIMEOUT_MS,
} from "../queue/constants.js";
import type { StorePolicyJobData } from "../queue/types.js";

type StorePolicyJobResult = {
  cid: string;
  storageSource: "fileverse" | "pinata";
};

function toReadablePolicyText(policy: unknown): string {
  if (typeof policy === "string") {
    return policy;
  }

  if (policy === undefined || policy === null) {
    return "null";
  }

  try {
    return JSON.stringify(policy, null, 2);
  } catch {
    return String(policy);
  }
}

async function processStorePolicyJob(
  job: Job<StorePolicyJobData, StorePolicyJobResult, typeof STORE_POLICY_JOB_NAME>,
): Promise<StorePolicyJobResult> {
  const attempt = job.attemptsMade + 1;
  const { agentId, policy } = job.data;

  console.info(
    `[store-policy] job start agentId=${agentId} jobId=${job.id} attempt=${attempt}/${STORE_POLICY_JOB_ATTEMPTS}`,
  );

  await markAgentProcessing(agentId);

  const fileverseStart = Date.now();

  try {
    console.info(`[store-policy] fileverse attempt agentId=${agentId}`);
    const fileverseResult = await withTimeout(
      (signal) => storePolicyWithFileverse(policy, { signal }),
      FILEVERSE_TIMEOUT_MS,
      `Fileverse request timed out after ${FILEVERSE_TIMEOUT_MS}ms`,
    );

    const durationMs = Date.now() - fileverseStart;
    console.info(
      `[store-policy] fileverse success agentId=${agentId} cid=${fileverseResult.cid} durationMs=${durationMs}`,
    );

    await markAgentActive(agentId, fileverseResult.cid, "fileverse");

    return {
      cid: fileverseResult.cid,
      storageSource: "fileverse",
    };
  } catch (fileverseError) {
    const durationMs = Date.now() - fileverseStart;
    const fileverseMessage = (fileverseError as Error).message;

    console.warn(
      `[store-policy] fileverse failed agentId=${agentId} durationMs=${durationMs} error="${fileverseMessage}"`,
    );
    console.info(`[store-policy] fallback triggered agentId=${agentId} target=pinata`);

    try {
      const policyText = toReadablePolicyText(policy);
      const pinataResult = await uploadTextDocumentToPinata(policyText, { agentId });

      console.info(
        `[store-policy] pinata upload success agentId=${agentId} cid=${pinataResult.cid}`,
      );

      await markAgentActive(agentId, pinataResult.cid, "pinata");

      return {
        cid: pinataResult.cid,
        storageSource: "pinata",
      };
    } catch (pinataError) {
      const pinataMessage = (pinataError as Error).message;

      console.error(
        `[store-policy] pinata fallback failed agentId=${agentId} error="${pinataMessage}"`,
      );

      throw new Error(`Fileverse failed: ${fileverseMessage}; Pinata failed: ${pinataMessage}`);
    }
  }
}

async function startWorker(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI must be set in environment");
  }

  console.info("[store-policy] connecting to MongoDB");
  await mongoose.connect(mongoUri);
  console.info("[store-policy] MongoDB connected");

  const redisConnection = createRedisConnection();
  console.info(`[store-policy] Redis connected at ${getRedisUrl()}`);

  const worker = new Worker<
    StorePolicyJobData,
    StorePolicyJobResult,
    typeof STORE_POLICY_JOB_NAME
  >(
    AGENT_QUEUE_NAME,
    async (job) => {
      return withTimeout(
        async () => processStorePolicyJob(job),
        STORE_POLICY_JOB_TIMEOUT_MS,
        `Job timed out after ${STORE_POLICY_JOB_TIMEOUT_MS}ms`,
      );
    },
    {
      connection: redisConnection,
      concurrency: 5,
    },
  );

  worker.on("completed", (job, result) => {
    const typedResult = result as StorePolicyJobResult;
    console.info(
      `[store-policy] job completed agentId=${job.data.agentId} jobId=${job.id} source=${typedResult.storageSource} cid=${typedResult.cid}`,
    );
  });

  worker.on("failed", async (job, error) => {
    if (!job) {
      console.error(`[store-policy] job failed before initialization error="${error.message}"`);
      return;
    }

    const attemptsMade = job.attemptsMade;
    const isFinalFailure = attemptsMade >= STORE_POLICY_JOB_ATTEMPTS;

    if (isFinalFailure) {
      console.error(
        `[store-policy] job permanently failed agentId=${job.data.agentId} jobId=${job.id} attempts=${attemptsMade} error="${error.message}"`,
      );
      await markAgentFailed(job.data.agentId, error.message);
      return;
    }

    console.warn(
      `[store-policy] job retry scheduled agentId=${job.data.agentId} jobId=${job.id} attempts=${attemptsMade}/${STORE_POLICY_JOB_ATTEMPTS} error="${error.message}"`,
    );
  });

  worker.on("error", (error) => {
    console.error(`[store-policy] worker runtime error: ${error.message}`);
  });

  const shutdown = async () => {
    console.info("[store-policy] shutting down worker");
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

  console.info("[store-policy] worker started");
}

startWorker().catch((error) => {
  console.error("[store-policy] fatal worker startup error", error);
  process.exit(1);
});
