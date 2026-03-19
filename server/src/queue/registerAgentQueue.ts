import { Queue, type JobsOptions } from "bullmq";
import { createRedisConnection } from "./connection.js";
import {
  REGISTER_AGENT_JOB_ATTEMPTS,
  REGISTER_AGENT_JOB_BACKOFF_MS,
  REGISTER_AGENT_JOB_NAME,
  REGISTER_AGENT_JOB_TIMEOUT_MS,
  REGISTER_AGENT_QUEUE_NAME,
} from "./constants.js";
import type {
  RegisterAgentJobData,
  RegisterAgentJobProgress,
  RegisterAgentJobResult,
} from "./types.js";

const defaultRegisterAgentJobOptions = {
  attempts: REGISTER_AGENT_JOB_ATTEMPTS,
  backoff: {
    type: "exponential",
    delay: REGISTER_AGENT_JOB_BACKOFF_MS,
  },
  timeout: REGISTER_AGENT_JOB_TIMEOUT_MS,
  removeOnComplete: true,
  removeOnFail: false,
} as JobsOptions & { timeout: number };

let registerAgentQueue:
  | Queue<
      RegisterAgentJobData,
      RegisterAgentJobResult,
      typeof REGISTER_AGENT_JOB_NAME
    >
  | undefined;

function getRegisterAgentQueue(): Queue<
  RegisterAgentJobData,
  RegisterAgentJobResult,
  typeof REGISTER_AGENT_JOB_NAME
> {
  if (!registerAgentQueue) {
    registerAgentQueue = new Queue<
      RegisterAgentJobData,
      RegisterAgentJobResult,
      typeof REGISTER_AGENT_JOB_NAME
    >(REGISTER_AGENT_QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: defaultRegisterAgentJobOptions,
    });
  }

  return registerAgentQueue;
}

export async function enqueueRegisterAgentJob(data: RegisterAgentJobData) {
  const ensName = `${data.config.name}.${data.config.baseDomain}`;

  return getRegisterAgentQueue().add(REGISTER_AGENT_JOB_NAME, data, {
    jobId: `register-agent:${ensName}:${Date.now()}`,
  });
}

export async function getRegisterAgentJob(jobId: string) {
  return getRegisterAgentQueue().getJob(jobId);
}

export function normalizeRegisterAgentProgress(
  value: unknown,
): RegisterAgentJobProgress | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const payload = value as Partial<RegisterAgentJobProgress>;
  if (!payload.stage || typeof payload.stage !== "string") {
    return undefined;
  }

  return {
    stage: payload.stage,
    ensName: payload.ensName,
    agentId: payload.agentId,
    registrationTxHash: payload.registrationTxHash,
    ensTxHash: payload.ensTxHash,
    lastLog: payload.lastLog,
    logs: Array.isArray(payload.logs)
      ? payload.logs.filter((entry): entry is string => typeof entry === "string")
      : undefined,
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : new Date().toISOString(),
  };
}

export async function closeRegisterAgentQueue(): Promise<void> {
  if (registerAgentQueue) {
    await registerAgentQueue.close();
    registerAgentQueue = undefined;
  }
}
