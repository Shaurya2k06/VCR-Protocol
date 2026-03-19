import { Queue, type JobsOptions } from "bullmq";
import { createRedisConnection } from "./connection.js";
import {
  AGENT_QUEUE_NAME,
  STORE_POLICY_JOB_ATTEMPTS,
  STORE_POLICY_JOB_BACKOFF_MS,
  STORE_POLICY_JOB_TIMEOUT_MS,
  STORE_POLICY_JOB_NAME,
} from "./constants.js";
import type { StorePolicyJobData } from "./types.js";

const defaultJobOptions = {
  attempts: STORE_POLICY_JOB_ATTEMPTS,
  backoff: {
    type: "exponential",
    delay: STORE_POLICY_JOB_BACKOFF_MS,
  },
  timeout: STORE_POLICY_JOB_TIMEOUT_MS,
  removeOnComplete: true,
  removeOnFail: false,
} as JobsOptions & { timeout: number };

let agentQueue:
  | Queue<StorePolicyJobData, unknown, typeof STORE_POLICY_JOB_NAME>
  | undefined;

function getAgentQueue(): Queue<StorePolicyJobData, unknown, typeof STORE_POLICY_JOB_NAME> {
  if (!agentQueue) {
    agentQueue = new Queue<StorePolicyJobData, unknown, typeof STORE_POLICY_JOB_NAME>(
      AGENT_QUEUE_NAME,
      {
        connection: createRedisConnection(),
        defaultJobOptions,
      },
    );
  }

  return agentQueue;
}

export async function enqueueStorePolicyJob(data: StorePolicyJobData) {
  return getAgentQueue().add(STORE_POLICY_JOB_NAME, data, {
    jobId: `store-policy:${data.agentId}`,
  });
}

export async function closeAgentQueue(): Promise<void> {
  if (agentQueue) {
    await agentQueue.close();
    agentQueue = undefined;
  }
}
